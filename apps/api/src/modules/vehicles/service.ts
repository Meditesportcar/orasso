import { randomBytes } from "node:crypto";
import {
  categoryAllowedForYear,
  normalizePlate,
  type VehicleCreate,
  type VehicleFull,
  type VehiclePublic,
  type VehicleUpdate,
  vehiclePlateIssue,
} from "@orasso/shared";
import { and, count, eq, inArray, max, ne } from "drizzle-orm";
import sharp from "sharp";

import { db } from "../../db/client";
import {
  applications,
  categories,
  plateTransferRequests,
  vehicleCategories,
  vehicleGenerations,
  vehicleModels,
  vehiclePhotos,
  vehicles,
} from "../../db/schema";
import { now } from "../../lib/deps";
import { AppError, conflict, notFound, validation } from "../../lib/errors";
import type { Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";
import { type Executor, type Tx, withTx } from "../../lib/tx";
import { type VehicleRow, vehiclesRepo } from "./repo";
import { vehicleFull, vehiclePublic } from "./serializers";

export const MAX_PHOTOS = 8;
export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
const PHOTO_MAX_SIDE = 2048;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

const isUniqueViolation = (error: unknown, constraint: string) => {
  const e = error as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } };
  const pg = e.cause ?? e;
  return pg.code === "23505" && pg.constraint === constraint;
};

/** Cohérence marque → modèle → génération, et type du véhicule (sauf modèle « Autre »). */
async function checkReference(
  ex: Executor,
  v: { vehicleType: string; makeId: string; modelId: string; generationId?: string | null },
) {
  const model = await ex.query.vehicleModels.findFirst({ where: eq(vehicleModels.id, v.modelId) });
  if (!model || model.makeId !== v.makeId) throw validation("Modèle inconnu pour cette marque");
  if (!model.isOther && model.vehicleType !== v.vehicleType) throw validation("Type de véhicule incohérent");
  if (v.generationId) {
    const gen = await ex.query.vehicleGenerations.findFirst({ where: eq(vehicleGenerations.id, v.generationId) });
    if (!gen || gen.modelId !== v.modelId) throw validation("Génération inconnue pour ce modèle");
  }
}

/** Catégories actives et cohérentes avec l'âge du véhicule (pas de « youngtimer » sur une voiture de 2015). */
async function checkCategories(ex: Executor, ids: string[], year: number | null) {
  if (!ids.length) return;
  const rows = await ex.query.categories.findMany({ where: inArray(categories.id, ids) });
  if (rows.length !== new Set(ids).size || rows.some((c) => !c.active)) throw validation("Catégorie inconnue");
  const refused = rows.filter((c) => !categoryAllowedForYear(c.minVehicleAge, year, now()));
  if (refused.length) {
    throw validation(`Catégorie incompatible avec l'année : ${refused.map((c) => c.label).join(", ")}`, {
      categoryIds: refused.map((c) => c.id),
    });
  }
}

/**
 * Plaque déjà active ailleurs → `409 plate_taken`. Si elle appartient à un autre compte, une demande de transfert
 * est créée (confirmée par l'ancien propriétaire ou arbitrée par l'équipe Orasso, lot 13).
 */
async function checkPlate(ex: Executor, ownerId: string, plateNormalized: string | null, exceptVehicleId?: string) {
  if (!plateNormalized) return;
  const holder = await ex.query.vehicles.findFirst({
    where: and(
      eq(vehicles.plateNormalized, plateNormalized),
      eq(vehicles.status, "active"),
      exceptVehicleId ? ne(vehicles.id, exceptVehicleId) : undefined,
    ),
  });
  if (!holder) return;
  if (holder.ownerId !== ownerId) {
    const existing = await ex.query.plateTransferRequests.findFirst({
      where: and(
        eq(plateTransferRequests.plateNormalized, plateNormalized),
        eq(plateTransferRequests.toUserId, ownerId),
        eq(plateTransferRequests.status, "pending"),
      ),
    });
    if (!existing) {
      await db.insert(plateTransferRequests).values({ plateNormalized, fromVehicleId: holder.id, toUserId: ownerId });
    }
  }
  throw conflict("plate_taken", "Cette plaque est déjà enregistrée sur un véhicule actif", {
    transferRequested: holder.ownerId !== ownerId,
  });
}

async function setCategories(tx: Tx, vehicleId: string, ids: string[]) {
  await tx.delete(vehicleCategories).where(eq(vehicleCategories.vehicleId, vehicleId));
  const unique = [...new Set(ids)];
  if (unique.length) await tx.insert(vehicleCategories).values(unique.map((categoryId) => ({ vehicleId, categoryId })));
}

async function ownVehicle(v: Viewer, id: string): Promise<VehicleRow> {
  const row = await vehiclesRepo.byId(id);
  if (!row || row.ownerId !== v.user.id) throw notFound("Véhicule introuvable");
  return row;
}

async function full(id: string): Promise<VehicleFull> {
  const row = await vehiclesRepo.findFullById(id);
  if (!row) throw notFound("Véhicule introuvable");
  return vehicleFull(row);
}

export const vehiclesService = {
  async reference() {
    return { categories: await vehiclesRepo.categories() };
  },

  async listMine(v: Viewer): Promise<VehicleFull[]> {
    return (await vehiclesRepo.findFull(eq(vehicles.ownerId, v.user.id))).map(vehicleFull);
  },

  getMine: async (v: Viewer, id: string) => {
    await ownVehicle(v, id);
    return full(id);
  },

  /** Garage visible des autres (sans plaque). */
  async garageOf(userId: string): Promise<VehiclePublic[]> {
    return (await vehiclesRepo.findFull(eq(vehicles.ownerId, userId))).map(vehiclePublic);
  },

  async create(v: Viewer, input: VehicleCreate): Promise<VehicleFull> {
    const plateNormalized = input.plate && !input.unregistered ? normalizePlate(input.plate) : null;
    if (input.plate && !plateNormalized) throw validation("Plaque invalide", { field: "plate" });
    await checkReference(db, input);
    await checkCategories(db, input.categoryIds, input.year ?? null);
    if (input.status === "active") await checkPlate(db, v.user.id, plateNormalized);
    try {
      const id = await withTx(async (tx) => {
        const [row] = await tx
          .insert(vehicles)
          .values({
            ownerId: v.user.id,
            vehicleType: input.vehicleType,
            makeId: input.makeId,
            modelId: input.modelId,
            generationId: input.generationId ?? null,
            year: input.year ?? null,
            color: input.color,
            engine: input.engine,
            powerHp: input.powerHp ?? null,
            weightKg: input.weightKg ?? null,
            plate: input.unregistered ? null : input.plate,
            plateNormalized,
            unregistered: input.unregistered,
            status: input.status,
            description: input.description,
            preparation: input.preparation,
            archivedAt: input.status === "active" ? null : now(),
          })
          .returning({ id: vehicles.id });
        if (!row) throw new Error("Insertion du véhicule impossible");
        await setCategories(tx, row.id, input.categoryIds);
        return row.id;
      });
      return full(id);
    } catch (error) {
      if (isUniqueViolation(error, "vehicles_active_plate_key")) {
        throw conflict("plate_taken", "Cette plaque est déjà enregistrée sur un véhicule actif");
      }
      throw error;
    }
  },

  async update(v: Viewer, id: string, input: VehicleUpdate): Promise<VehicleFull> {
    const current = await ownVehicle(v, id);
    const merged = {
      vehicleType: input.vehicleType ?? current.vehicleType,
      makeId: input.makeId ?? current.makeId,
      modelId: input.modelId ?? current.modelId,
      generationId: input.generationId !== undefined ? input.generationId : current.generationId,
      year: input.year !== undefined ? input.year : current.year,
      plate: input.plate !== undefined ? input.plate : current.plate,
      unregistered: input.unregistered ?? current.unregistered,
      status: input.status ?? current.status,
    };
    if (merged.unregistered) merged.plate = null;
    const plateIssue = vehiclePlateIssue(merged);
    if (plateIssue) throw validation(plateIssue, { field: "plate" });
    const plateNormalized = merged.plate ? normalizePlate(merged.plate) : null;
    if (input.makeId || input.modelId || input.generationId !== undefined || input.vehicleType) {
      await checkReference(db, merged);
    }
    const categoryIds =
      input.categoryIds ??
      (
        await db
          .select({ id: vehicleCategories.categoryId })
          .from(vehicleCategories)
          .where(eq(vehicleCategories.vehicleId, id))
      ).map((r) => r.id);
    await checkCategories(db, categoryIds, merged.year ?? null);
    if (merged.status === "active") await checkPlate(db, v.user.id, plateNormalized, id);
    const { categoryIds: _ignored, ...fields } = input;
    try {
      await withTx(async (tx) => {
        await tx
          .update(vehicles)
          .set({
            ...fields,
            generationId: merged.generationId ?? null,
            year: merged.year ?? null,
            plate: merged.plate,
            plateNormalized,
            unregistered: merged.unregistered,
            status: merged.status,
            archivedAt: merged.status === "active" ? null : (current.archivedAt ?? now()),
            // La certification se perd à toute modification de la fiche (docs/01).
            certifiedAt: null,
          })
          .where(eq(vehicles.id, id));
        if (input.categoryIds) await setCategories(tx, id, input.categoryIds);
      });
    } catch (error) {
      if (isUniqueViolation(error, "vehicles_active_plate_key")) {
        throw conflict("plate_taken", "Cette plaque est déjà enregistrée sur un véhicule actif");
      }
      throw error;
    }
    return full(id);
  },

  /** Suppression réelle si le véhicule n'a jamais candidaté ; sinon il faut l'archiver (choix C26). */
  async remove(v: Viewer, id: string) {
    await ownVehicle(v, id);
    const [used] = await db.select({ n: count() }).from(applications).where(eq(applications.vehicleId, id));
    if ((used?.n ?? 0) > 0) {
      throw conflict("conflict", "Ce véhicule a déjà participé : archive-le (vendu, gardé, accidenté)");
    }
    const photos = await vehiclesRepo.photos(id);
    await db.delete(vehicles).where(eq(vehicles.id, id));
    for (const p of photos) await storage.remove(p.storageKey);
  },

  async getOther(id: string): Promise<VehiclePublic> {
    const row = await vehiclesRepo.findFullById(id);
    if (!row) throw notFound("Véhicule introuvable");
    return vehiclePublic(row);
  },

  /** Photo recompressée à l'arrivée : 2048 px au plus, WebP, orientation EXIF appliquée, métadonnées retirées. */
  async addPhoto(v: Viewer, id: string, file: File): Promise<VehicleFull> {
    await ownVehicle(v, id);
    if (file.size > MAX_PHOTO_BYTES) throw new AppError(413, "payload_too_large", "Photo trop lourde (15 Mo au plus)");
    if (!ACCEPTED_TYPES.includes(file.type)) {
      throw new AppError(415, "unsupported_media_type", "Formats acceptés : JPEG, PNG, WebP, HEIC");
    }
    let output: { data: Buffer; info: { width: number; height: number; size: number } };
    try {
      output = await sharp(Buffer.from(await file.arrayBuffer()))
        .rotate()
        .resize(PHOTO_MAX_SIDE, PHOTO_MAX_SIDE, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer({ resolveWithObject: true });
    } catch {
      throw new AppError(415, "unsupported_media_type", "Image illisible (HEIC : convertir en JPEG côté appli)");
    }
    const key = `vehicles/${id}/${randomBytes(8).toString("hex")}.webp`;
    await storage.put(key, output.data);
    try {
      await withTx(async (tx) => {
        const [agg] = await tx
          .select({ n: count(), maxPos: max(vehiclePhotos.position) })
          .from(vehiclePhotos)
          .where(eq(vehiclePhotos.vehicleId, id));
        if ((agg?.n ?? 0) >= MAX_PHOTOS) throw conflict("conflict", "8 photos au maximum");
        await tx.insert(vehiclePhotos).values({
          vehicleId: id,
          position: (agg?.maxPos ?? 0) + 1,
          storageKey: key,
          width: output.info.width,
          height: output.info.height,
          bytes: output.info.size,
        });
        await tx.update(vehicles).set({ certifiedAt: null }).where(eq(vehicles.id, id));
      });
    } catch (error) {
      await storage.remove(key);
      throw error;
    }
    return full(id);
  },

  async removePhoto(v: Viewer, id: string, photoId: string): Promise<VehicleFull> {
    await ownVehicle(v, id);
    const photos = await vehiclesRepo.photos(id);
    const target = photos.find((p) => p.id === photoId);
    if (!target) throw notFound("Photo introuvable");
    await withTx(async (tx) => {
      await tx.delete(vehiclePhotos).where(eq(vehiclePhotos.id, photoId));
      // Positions renumérotées 1..n (contrainte d'unicité différée à la validation).
      let position = 1;
      for (const p of photos) {
        if (p.id === photoId) continue;
        if (p.position !== position) await tx.update(vehiclePhotos).set({ position }).where(eq(vehiclePhotos.id, p.id));
        position++;
      }
    });
    await storage.remove(target.storageKey);
    return full(id);
  },

  async reorderPhotos(v: Viewer, id: string, photoIds: string[]): Promise<VehicleFull> {
    await ownVehicle(v, id);
    const photos = await vehiclesRepo.photos(id);
    const current = new Set(photos.map((p) => p.id));
    if (photoIds.length !== current.size || !photoIds.every((p) => current.has(p))) {
      throw validation("La liste doit contenir toutes les photos du véhicule, une fois chacune");
    }
    await withTx(async (tx) => {
      for (const [i, photoId] of photoIds.entries()) {
        await tx
          .update(vehiclePhotos)
          .set({ position: i + 1 })
          .where(eq(vehiclePhotos.id, photoId));
      }
    });
    return full(id);
  },
};
