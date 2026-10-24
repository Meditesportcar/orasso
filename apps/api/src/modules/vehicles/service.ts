import { randomBytes } from "node:crypto";
import {
  formatPlate,
  normalizePlate,
  type PlateRect,
  type ShareFormat,
  type ShareStyle,
  type VehicleCreate,
  type VehicleDetail,
  type VehicleFull,
  type VehicleHistoryItem,
  type VehiclePublic,
  type VehicleUpdate,
  vehiclePlateIssue,
} from "@orasso/shared";
import { and, asc, count, desc, eq, max, ne } from "drizzle-orm";
import sharp from "sharp";

import { db } from "../../db/client";
import {
  applications,
  checkins,
  events,
  plateNormalizationConflicts,
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
import { socialJournal } from "../social/journal";
import { checkCategories } from "./categories";
import { certificationService } from "./certification";
import { blurPlateRegions, MAX_INPUT_PIXELS, removeOrRetry } from "./photos-blur";
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

/** Véhicule déjà créé par ce compte avec cette clé client (lot M1, tour 2), ou null. */
async function vehicleByClientKey(ownerId: string, clientKey: string | undefined): Promise<string | null> {
  if (!clientKey) return null;
  const [row] = await db
    .select({ id: vehicles.id })
    .from(vehicles)
    .where(and(eq(vehicles.ownerId, ownerId), eq(vehicles.clientKey, clientKey)));
  return row?.id ?? null;
}

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

/**
 * Véhicule actif qui porte déjà cette plaque (hors le véhicule en cours de modification). Lot M2, tour 3 : la forme
 * voulue d'un véhicule listé en conflit (`plate_normalization_conflicts`) lui est réservée : un autre compte qui saisit
 * cette plaque passe par une demande de transfert, sans créer de doublon.
 */
async function plateHolder(ex: Executor, plateNormalized: string | null, exceptVehicleId?: string) {
  if (!plateNormalized) return null;
  const except = exceptVehicleId ? ne(vehicles.id, exceptVehicleId) : undefined;
  const holder = await ex.query.vehicles.findFirst({
    where: and(eq(vehicles.plateNormalized, plateNormalized), eq(vehicles.status, "active"), except),
  });
  if (holder) return holder;
  const [reserved] = await ex
    .select({ vehicle: vehicles })
    .from(plateNormalizationConflicts)
    .innerJoin(vehicles, eq(vehicles.id, plateNormalizationConflicts.vehicleId))
    .where(
      and(eq(plateNormalizationConflicts.wantedNormalized, plateNormalized), eq(vehicles.status, "active"), except),
    )
    .orderBy(asc(plateNormalizationConflicts.createdAt))
    .limit(1);
  return reserved?.vehicle ?? null;
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

  /**
   * PNG de l'affiche à partager (story ou post, lot M6), sans plaque ; mise en cache une heure. `masks` : zones que
   * l'appli a re-détectées sur l'affiche composée, floutées en plus.
   */
  async shareImage(
    v: Viewer,
    id: string,
    format: ShareFormat,
    style: ShareStyle = "night",
    masks: PlateRect[] = [],
  ): Promise<Buffer> {
    await ownVehicle(v, id);
    const row = await vehiclesRepo.findFullById(id);
    if (!row) throw notFound("Véhicule introuvable");
    return cachedShareImage(row, v.profile.pseudo, format, Date.now(), { style, masks });
  },

  async create(v: Viewer, input: VehicleCreate): Promise<VehicleFull> {
    // Lot M1, tour 2 : création idempotente. La même clé client (« Reprendre » après une réponse perdue) renvoie le
    // véhicule déjà créé au lieu d'un doublon.
    const replay = await vehicleByClientKey(v.user.id, input.clientKey);
    if (replay) return full(replay);
    const plateNormalized = input.plate && !input.unregistered ? normalizePlate(input.plate) : null;
    if (input.plate && !plateNormalized) throw validation("Plaque invalide", { field: "plate" });
    await checkReference(db, input);
    await checkCategories(db, input.categoryIds, {
      vehicleType: input.vehicleType,
      makeId: input.makeId,
      modelId: input.modelId,
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
            // Lot M2 : forme lisible unique (« ae 665gh » → « AE-665-GH ») ; la forme de recherche est `plateNormalized`.
            plate: input.unregistered || !input.plate ? null : formatPlate(input.plate),
            plateNormalized: pendingTransferId ? null : plateNormalized,
            pendingTransferId,
            unregistered: input.unregistered,
            status: input.status,
            statusNote: input.status === "active" ? null : input.statusNote,
            description: input.description,
            preparation: input.preparation,
            archivedAt: input.status === "active" ? null : now(),
            clientKey: input.clientKey ?? null,
          })
          .returning({ id: vehicles.id });
        if (!row) throw new Error("Insertion du véhicule impossible");
        await setCategories(tx, row.id, input.categoryIds);
        return row.id;
      });
      // Journal des amis (lot 17) : « <pseudo> a ajouté un véhicule » ; ne bloque jamais l'ajout.
      if (input.status === "active") {
        await socialJournal
          .friendNewVehicle(v.user.id, id)
          .catch((error) => console.error("Journal des amis :", error));
      }
      return full(id);
    } catch (error) {
      // Deux envois simultanés avec la même clé : le second renvoie le véhicule du premier.
      if (isUniqueViolation(error, "vehicles_owner_client_key_unique")) {
        const existing = await vehicleByClientKey(v.user.id, input.clientKey);
        if (existing) return full(existing);
      }
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
      plate: input.plate !== undefined ? (input.plate ? formatPlate(input.plate) : null) : current.plate,
      unregistered: input.unregistered ?? current.unregistered,
      status: input.status ?? current.status,
    };
    const pending = Boolean(current.pendingTransferId);
    // Tant que la plaque est en attente de transfert, on ne la change pas : on supprime le véhicule ou on l'archive.
    if (pending) {
      // Même plaque écrite autrement (« ab 123 cd ») : pas un changement (lot M2).
      const plateChanged =
        input.plate !== undefined && normalizePlate(input.plate ?? "") !== normalizePlate(current.plate ?? "");
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
    // Lot M2, tour 3 : la clé n'est recalculée que si la plaque change (numéro, « non immatriculé », statut). Un véhicule
    // listé en conflit garde ainsi sa clé quand on modifie sa couleur ou ses photos.
    const plateTouched =
      (input.plate !== undefined && normalizePlate(input.plate ?? "") !== normalizePlate(current.plate ?? "")) ||
      (input.unregistered !== undefined && input.unregistered !== current.unregistered) ||
      merged.status !== current.status;
    const plateNormalized = pending
      ? null
      : !plateTouched
        ? current.plateNormalized
        : merged.plate
          ? normalizePlate(merged.plate)
          : null;
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
        modelId: merged.modelId,
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
        // Lot M2, tour 4 : la plaque change (ou le véhicule quitte sa plaque) : sa ligne de conflit est périmée, retirée
        // avant toute libération (une réservation périmée n'est pas une preuve de détention).
        if (nextPlateNormalized !== current.plateNormalized || merged.status !== current.status) {
          await tx.delete(plateNormalizationConflicts).where(eq(plateNormalizationConflicts.vehicleId, id));
        }
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

  /**
   * Photo recompressée à l'arrivée : 2048 px au plus, WebP, orientation EXIF appliquée, métadonnées retirées.
   * `plateRects` (lot 51) : plaque floutée avant le stockage, l'original n'est jamais écrit (V9).
   * Lot M1, tour 2 (vie privée, défense en profondeur) : aucune photo de véhicule n'entre sans décision sur la plaque,
   * quel que soit le client — des cadres, ou « aucune plaque visible » confirmé (`noPlate` : la case « Envoyer sans
   * flouter » du site, le bouton « Aucune plaque » de l'appli). Sinon 400, rien n'est écrit.
   */
  async addPhoto(
    v: Viewer,
    id: string,
    file: File,
    plateRects: PlateRect[] | undefined,
    noPlate: boolean,
  ): Promise<VehicleFull> {
    await ownVehicle(v, id);
    if (!plateRects?.length && !noPlate) {
      throw validation("Photo : place le cadre sur la plaque, ou confirme qu'aucune plaque n'est visible.", {
        fields: { plateDecision: "required" },
      });
    }
    if (file.size > MAX_PHOTO_BYTES) throw new AppError(413, "payload_too_large", "Photo trop lourde (15 Mo au plus)");
    if (!ACCEPTED_TYPES.includes(file.type)) {
      throw new AppError(415, "unsupported_media_type", "Formats acceptés : JPEG, PNG, WebP, HEIC");
    }
    let output: { data: Buffer; info: { width: number; height: number; size: number } };
    try {
      output = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: MAX_INPUT_PIXELS })
        .rotate()
        .resize(PHOTO_MAX_SIDE, PHOTO_MAX_SIDE, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer({ resolveWithObject: true });
    } catch {
      throw new AppError(415, "unsupported_media_type", "Image illisible (HEIC : convertir en JPEG côté appli)");
    }
    if (plateRects?.length) output = await blurPlateRegions(output.data, plateRects);
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
          plateRects: plateRects?.length ? plateRects : null,
          plateBlurred: Boolean(plateRects?.length),
          // Lot R4b, tour 3 : la décision « aucune plaque visible » est gardée (seulement sans cadre).
          noPlateConfirmed: noPlate && !plateRects?.length,
        });
        // Une photo ajoutée ou retirée fait perdre la certification (S38).
        await certificationService.afterChange(tx, after, id, certifiedBefore);
      });
    } catch (error) {
      await removeOrRetry(key);
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
    // Lot M1, tour 2 : l'ancienne image (peut-être avec une plaque nette) ne reste jamais stockée.
    await removeOrRetry(target.storageKey);
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
