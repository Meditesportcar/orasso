import { randomBytes } from "node:crypto";
import {
  normalizePlate,
  type ShareFormat,
  type VehicleBrief,
  type VehicleCreate,
  type VehicleDetail,
  type VehicleFull,
  type VehicleHistoryItem,
  type VehiclePublic,
  type VehicleUpdate,
  vehiclePlateIssue,
} from "@orasso/shared";
import { and, count, desc, eq, max, ne } from "drizzle-orm";
import sharp from "sharp";

import { db } from "../../db/client";
import {
  applications,
  checkins,
  events,
  profiles,
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
import { notificationsService } from "../notifications/service";
import { checkCategories } from "./categories";
import { certificationService } from "./certification";
import { plateTransferService } from "./plate-transfer";
import { type VehicleRow, vehiclesRepo } from "./repo";
import { vehicleFull, vehiclePublic } from "./serializers";
import { cachedShareImage } from "./share-image";

export const MAX_PHOTOS = 8;
export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
const PHOTO_MAX_SIDE = 2048;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

const isUniqueViolation = (error: unknown, constraint: string) => {
  const e = error as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } };
  const pg = e.cause ?? e;
  return pg.code === "23505" && pg.constraint === constraint;
};

/** Plaque déjà active, ou deuxième demande de transfert simultanée pour la même plaque (index uniques). */
const isPlateConflict = (error: unknown) =>
  isUniqueViolation(error, "vehicles_active_plate_key") || isUniqueViolation(error, "plate_transfer_requests_open_key");

/** Cohérence marque → modèle → génération, et type du véhicule (sauf modèle « Autre »). */
export async function checkReference(
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

/** Véhicule actif qui porte déjà cette plaque (hors le véhicule en cours de modification). */
async function plateHolder(ex: Executor, plateNormalized: string | null, exceptVehicleId?: string) {
  if (!plateNormalized) return null;
  const holder = await ex.query.vehicles.findFirst({
    where: and(
      eq(vehicles.plateNormalized, plateNormalized),
      eq(vehicles.status, "active"),
      exceptVehicleId ? ne(vehicles.id, exceptVehicleId) : undefined,
    ),
  });
  return holder ?? null;
}

/**
 * Plaque déjà active sur un autre véhicule du même compte : refus (`409 plate_taken`). Sur le véhicule d'un autre compte :
 * pas de refus, une demande de transfert est ouverte à la création du véhicule (lot 31, S36).
 */
function assertNotOwnPlate(holder: { ownerId: string } | null, ownerId: string) {
  if (holder && holder.ownerId === ownerId) {
    throw conflict("plate_taken", "Cette plaque est déjà enregistrée sur un de tes véhicules actifs", {
      transferRequested: false,
    });
  }
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

  /** Page du véhicule : fiche complète et état de la certification. */
  getMine: async (v: Viewer, id: string): Promise<VehicleDetail> => {
    await ownVehicle(v, id);
    const row = await vehiclesRepo.findFullById(id);
    if (!row) throw notFound("Véhicule introuvable");
    return { ...vehicleFull(row), certification: await certificationService.stateOf(v, row) };
  },

  /** Garage visible des autres (sans plaque). */
  async garageOf(userId: string): Promise<VehiclePublic[]> {
    return (await vehiclesRepo.findFull(eq(vehicles.ownerId, userId))).map(vehiclePublic);
  },

  /** Historique : les candidatures du véhicule, avec « présent » quand l'entrée a été enregistrée sur place. */
  async history(v: Viewer, id: string): Promise<VehicleHistoryItem[]> {
    await ownVehicle(v, id);
    const rows = await db
      .select({
        applicationId: applications.id,
        eventId: events.id,
        eventTitle: events.title,
        eventSlug: events.slug,
        startsAt: events.startsAt,
        status: applications.status,
        checkinId: checkins.id,
      })
      .from(applications)
      .innerJoin(events, eq(events.id, applications.eventId))
      .leftJoin(checkins, eq(checkins.applicationId, applications.id))
      .where(eq(applications.vehicleId, id))
      .orderBy(desc(events.startsAt));
    return rows.map((r) => ({
      applicationId: r.applicationId,
      eventId: r.eventId,
      eventTitle: r.eventTitle,
      eventSlug: r.eventSlug,
      startsAt: r.startsAt.toISOString(),
      status: r.status,
      attended: r.checkinId !== null,
    }));
  },

  /** PNG de la fiche à partager (story ou publication), sans plaque ; mis en cache une heure. */
  async shareImage(v: Viewer, id: string, format: ShareFormat): Promise<Buffer> {
    await ownVehicle(v, id);
    const row = await vehiclesRepo.findFullById(id);
    if (!row) throw notFound("Véhicule introuvable");
    return cachedShareImage(row, v.profile.pseudo, format);
  },

  async create(v: Viewer, input: VehicleCreate): Promise<VehicleFull> {
    const plateNormalized = input.plate && !input.unregistered ? normalizePlate(input.plate) : null;
    if (input.plate && !plateNormalized) throw validation("Plaque invalide", { field: "plate" });
    await checkReference(db, input);
    await checkCategories(db, input.categoryIds, {
      vehicleType: input.vehicleType,
      makeId: input.makeId,
      year: input.year ?? null,
    });
    const holder = input.status === "active" ? await plateHolder(db, plateNormalized) : null;
    assertNotOwnPlate(holder, v.user.id);
    try {
      const id = await withTx(async (tx, after) => {
        // Plaque d'un autre compte : le véhicule est créé quand même, sans plaque normalisée, en attente (S36).
        const pendingTransferId =
          holder && plateNormalized
            ? await plateTransferService.open(tx, after, {
                plateNormalized,
                holder,
                requester: v,
                plateText: input.plate ?? null,
              })
            : null;
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
            plateNormalized: pendingTransferId ? null : plateNormalized,
            pendingTransferId,
            unregistered: input.unregistered,
            status: input.status,
            statusNote: input.status === "active" ? null : input.statusNote,
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
      if (isPlateConflict(error)) {
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
    const pending = Boolean(current.pendingTransferId);
    // Tant que la plaque est en attente de transfert, on ne la change pas : on supprime le véhicule ou on l'archive.
    if (pending) {
      const plateChanged = input.plate !== undefined && input.plate !== current.plate;
      const unregisteredChanged = input.unregistered !== undefined && input.unregistered !== current.unregistered;
      if (plateChanged || unregisteredChanged) {
        throw validation("Plaque en attente de transfert : elle ne peut pas être modifiée pour le moment", {
          field: "plate",
        });
      }
    }
    if (merged.unregistered) merged.plate = null;
    const plateIssue = vehiclePlateIssue(merged);
    if (plateIssue) throw validation(plateIssue, { field: "plate" });
    const plateNormalized = pending ? null : merged.plate ? normalizePlate(merged.plate) : null;
    const referenceChanged = Boolean(
      input.makeId || input.modelId || input.generationId !== undefined || input.vehicleType,
    );
    if (referenceChanged) await checkReference(db, merged);
    // Catégories revérifiées quand elles changent, ou quand ce qui les conditionne change (marque, type, année) :
    // une fiche ancienne reste modifiable même si les règles ont été durcies depuis.
    if (input.categoryIds || referenceChanged || input.year !== undefined) {
      const categoryIds =
        input.categoryIds ??
        (
          await db
            .select({ id: vehicleCategories.categoryId })
            .from(vehicleCategories)
            .where(eq(vehicleCategories.vehicleId, id))
        ).map((r) => r.id);
      await checkCategories(db, categoryIds, {
        vehicleType: merged.vehicleType,
        makeId: merged.makeId,
        year: merged.year ?? null,
      });
    }
    // Plaque : changée ou véhicule réactivé → doublon chez soi refusé, chez un autre compte = demande de transfert.
    const wantsPlate = merged.status === "active" && Boolean(plateNormalized);
    const plateIsNew = plateNormalized !== current.plateNormalized || current.status !== "active";
    const holder = wantsPlate && plateIsNew ? await plateHolder(db, plateNormalized, id) : null;
    assertNotOwnPlate(holder, v.user.id);
    const { categoryIds: _ignored, ...fields } = input;
    try {
      await withTx(async (tx, after) => {
        // Véhicule verrouillé et relu : une acceptation de transfert concurrente ne doit jamais être écrasée (I1).
        const [locked] = await tx.select().from(vehicles).where(eq(vehicles.id, id)).for("update");
        if (
          !locked ||
          locked.pendingTransferId !== current.pendingTransferId ||
          locked.plateNormalized !== current.plateNormalized ||
          locked.status !== current.status
        ) {
          throw conflict("conflict", "La fiche vient de changer : recharge-la et recommence.");
        }
        const certifiedBefore = await certificationService.fieldsBeforeChange(tx, id);
        const openedTransferId =
          holder && plateNormalized
            ? await plateTransferService.open(tx, after, {
                plateNormalized,
                holder,
                requester: v,
                plateText: merged.plate,
              })
            : null;
        const pendingTransferId = openedTransferId ?? current.pendingTransferId;
        const nextPending = merged.status === "active" ? pendingTransferId : null;
        const nextPlateNormalized = pendingTransferId ? null : plateNormalized;
        await tx
          .update(vehicles)
          .set({
            ...fields,
            generationId: merged.generationId ?? null,
            year: merged.year ?? null,
            plate: merged.plate,
            // Jamais réécrits s'ils ne changent pas.
            ...(nextPlateNormalized !== current.plateNormalized ? { plateNormalized: nextPlateNormalized } : {}),
            ...(nextPending !== current.pendingTransferId ? { pendingTransferId: nextPending } : {}),
            unregistered: merged.unregistered,
            status: merged.status,
            statusNote: merged.status === "active" ? null : (input.statusNote ?? current.statusNote),
            archivedAt: merged.status === "active" ? null : (current.archivedAt ?? now()),
          })
          .where(eq(vehicles.id, id));
        if (input.categoryIds) await setCategories(tx, id, input.categoryIds);
        // La demande de transfert du véhicule archivé est annulée ; si ce véhicule quitte sa plaque, les demandes des
        // autres comptes sur cette plaque sont acceptées d'office.
        if (merged.status !== "active") await plateTransferService.cancelFor(tx, id, current.pendingTransferId);
        const leftPlate =
          current.status === "active" &&
          current.plateNormalized &&
          (merged.status !== "active" || plateNormalized !== current.plateNormalized);
        if (leftPlate) await plateTransferService.plateReleased(tx, id);
        // La certification se perd quand un champ technique, une catégorie ou une photo change (S38), pas pour la
        // description, la préparation, la couleur ou le statut.
        await certificationService.afterChange(tx, after, id, certifiedBefore);
      });
    } catch (error) {
      if (isPlateConflict(error)) {
        throw conflict("plate_taken", "Cette plaque est déjà enregistrée sur un véhicule actif");
      }
      throw error;
    }
    return full(id);
  },

  /** Suppression réelle si le véhicule n'a jamais candidaté ; sinon il faut l'archiver (choix C26). */
  async remove(v: Viewer, id: string) {
    const current = await ownVehicle(v, id);
    const [used] = await db.select({ n: count() }).from(applications).where(eq(applications.vehicleId, id));
    if ((used?.n ?? 0) > 0) {
      throw conflict("conflict", "Ce véhicule a déjà participé : archive-le (vendu, souvenir, accidenté)");
    }
    const photos = await vehiclesRepo.photos(id);
    await withTx(async (tx, after) => {
      // Plusieurs demandes ouvertes sur cette plaque : la suppression les emporterait (clé étrangère en cascade).
      if ((await plateTransferService.openCount(tx, id)) > 1) {
        throw conflict("conflict", "Plusieurs demandes de transfert portent sur cette plaque : archive-le (Vendu).");
      }
      await plateTransferService.cancelFor(tx, id, current.pendingTransferId);
      await plateTransferService.plateReleased(tx, id);
      await tx.delete(vehicles).where(eq(vehicles.id, id));
      after(() => notificationsService.kick());
    });
    for (const p of photos) await storage.remove(p.storageKey);
  },

  /** Fiche vue par un autre utilisateur connecté : complète si le compte est public, marque et modèle s'il est privé. */
  async getOther(v: Viewer, id: string): Promise<VehiclePublic | VehicleBrief> {
    const row = await vehiclesRepo.findFullById(id);
    if (!row) throw notFound("Véhicule introuvable");
    const owner = await db.query.profiles.findFirst({ where: eq(profiles.userId, row.ownerId) });
    if (owner?.visibility === "private" && row.ownerId !== v.user.id) {
      return {
        id: row.id,
        label: `${row.make.name} ${row.model.name}`,
        makeName: row.make.name,
        modelName: row.model.name,
        vehicleType: row.vehicleType,
        photoUrl: null,
      };
    }
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
      await withTx(async (tx, after) => {
        // Deux envois simultanés : la ligne du véhicule sérialise le calcul de la position.
        await tx.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.id, id)).for("update");
        const certifiedBefore = await certificationService.fieldsBeforeChange(tx, id);
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
        // Une photo ajoutée ou retirée fait perdre la certification (S38).
        await certificationService.afterChange(tx, after, id, certifiedBefore);
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
    await withTx(async (tx, after) => {
      await tx.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.id, id)).for("update");
      const certifiedBefore = await certificationService.fieldsBeforeChange(tx, id);
      await tx.delete(vehiclePhotos).where(eq(vehiclePhotos.id, photoId));
      // Positions renumérotées 1..n (contrainte d'unicité différée à la validation).
      let position = 1;
      for (const p of photos) {
        if (p.id === photoId) continue;
        if (p.position !== position) await tx.update(vehiclePhotos).set({ position }).where(eq(vehiclePhotos.id, p.id));
        position++;
      }
      await certificationService.afterChange(tx, after, id, certifiedBefore);
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
