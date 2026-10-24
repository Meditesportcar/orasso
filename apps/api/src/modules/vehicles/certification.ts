// Certification d'un véhicule (lot 31, S37 et S38). Demande à partir du grade Sport, validation manuelle par l'équipe
// Orasso, perte à la modification de la fiche (champs techniques, catégories, photos) ou après six mois sans événement.
import {
  type AdminCertificationRequest,
  type AdminDecision,
  type CertificationFields,
  type CertificationSnapshot,
  type CertificationStatus,
  certificationEligibility,
  certificationInactive,
  certificationInactivityCutoff,
  certificationLostByChange,
  certificationLostLabels,
  type VehicleCertification,
} from "@orasso/shared";
import { and, desc, eq, isNotNull, lte, max } from "drizzle-orm";

import { db } from "../../db/client";
import {
  adminAuditLog,
  applications,
  certificationRequests,
  checkins,
  profiles,
  vehicleCategories,
  vehiclePhotos,
  vehicles,
} from "../../db/schema";
import { requirePlatformRole } from "../../lib/access";
import { now } from "../../lib/deps";
import { conflict, notFound } from "../../lib/errors";
import type { Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";
import { type Executor, type Tx, withTx } from "../../lib/tx";
import { notificationsService } from "../notifications/service";
import { type VehicleWithAll, vehiclesRepo } from "./repo";
import { vehicleLabel } from "./serializers";

const isUniqueViolation = (error: unknown) => {
  const e = error as { code?: string; cause?: { code?: string } };
  return (e.cause ?? e).code === "23505";
};

const garageLink = (vehicleId: string) => ({ label: "Voir mon véhicule", path: `/app/garage/${vehicleId}` });

/** Champs surveillés (S38), lus en base pour comparer avant / après une modification. */
export async function certificationFieldsOf(ex: Executor, vehicleId: string): Promise<CertificationFields | null> {
  const v = await ex.query.vehicles.findFirst({ where: eq(vehicles.id, vehicleId) });
  if (!v) return null;
  const [cats, photos] = await Promise.all([
    ex
      .select({ id: vehicleCategories.categoryId })
      .from(vehicleCategories)
      .where(eq(vehicleCategories.vehicleId, vehicleId)),
    ex.select({ id: vehiclePhotos.id }).from(vehiclePhotos).where(eq(vehiclePhotos.vehicleId, vehicleId)),
  ]);
  return {
    makeId: v.makeId,
    modelId: v.modelId,
    generationId: v.generationId,
    year: v.year,
    engine: v.engine,
    powerHp: v.powerHp,
    weightKg: v.weightKg,
    categoryIds: cats.map((c) => c.id),
    photoIds: photos.map((p) => p.id),
    proposedMake: v.proposedMake,
    proposedModel: v.proposedModel,
  };
}

function snapshotOf(v: VehicleWithAll): CertificationSnapshot {
  return {
    label: vehicleLabel(v),
    year: v.year,
    engine: v.engine,
    powerHp: v.powerHp,
    weightKg: v.weightKg,
    description: v.description,
    preparation: v.preparation,
    categories: v.categories.map((c) => c.category.label),
    photoUrls: v.photos.map((p) => storage.url(p.storageKey) ?? ""),
  };
}

export const certificationService = {
  /** État de la certification pour la page du véhicule (propriétaire). */
  async stateOf(v: Viewer, row: VehicleWithAll): Promise<VehicleCertification> {
    const last = await db.query.certificationRequests.findFirst({
      where: eq(certificationRequests.vehicleId, row.id),
      orderBy: [desc(certificationRequests.createdAt)],
    });
    const eligibility = certificationEligibility(
      { grade: v.profile.grade },
      {
        status: row.status,
        photoCount: row.photos.length,
        description: row.description,
        categoryCount: row.categories.length,
        plateTransferPending: Boolean(row.pendingTransferId),
        certified: Boolean(row.certifiedAt),
        hasPendingRequest: last?.status === "pending",
        // Lot R4a : un modèle tapé se certifie une fois rattaché à la liste par l'équipe.
        referencePending: Boolean(row.proposedMake || row.proposedModel),
      },
    );
    return {
      certified: Boolean(row.certifiedAt),
      certifiedAt: row.certifiedAt?.toISOString() ?? null,
      lostReason: row.certifiedLostReason,
      request: last
        ? {
            id: last.id,
            status: last.status,
            createdAt: last.createdAt.toISOString(),
            decidedAt: last.decidedAt?.toISOString() ?? null,
            note: last.note,
          }
        : null,
      grade: v.profile.grade,
      eligible: eligibility.ok,
      missing: eligibility.missing,
    };
  },

  /** `POST /me/vehicles/:id/certification-request`. */
  async request(v: Viewer, vehicleId: string, message: string | null): Promise<VehicleCertification> {
    const row = await vehiclesRepo.findFullById(vehicleId);
    if (!row || row.ownerId !== v.user.id) throw notFound("Véhicule introuvable");
    const state = await certificationService.stateOf(v, row);
    if (!state.eligible) {
      throw conflict("conflict", "Les conditions de la certification ne sont pas réunies", { missing: state.missing });
    }
    try {
      await db.insert(certificationRequests).values({
        vehicleId,
        userId: v.user.id,
        message,
        // La fiche affichée et les champs surveillés : la validation compare ceux-ci à la fiche du moment (B1).
        snapshot: { ...snapshotOf(row), fields: (await certificationFieldsOf(db, vehicleId)) ?? undefined },
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict("conflict", "Une demande est déjà en cours pour ce véhicule");
      throw error;
    }
    const fresh = await vehiclesRepo.findFullById(vehicleId);
    if (!fresh) throw notFound("Véhicule introuvable");
    return certificationService.stateOf(v, fresh);
  },

  /** File de l'équipe : demandes à examiner d'abord (la plus ancienne en premier), puis les décisions récentes. */
  async adminList(v: Viewer, status?: CertificationStatus): Promise<AdminCertificationRequest[]> {
    await requirePlatformRole(v, "super_admin");
    const rows = await db
      .select({ req: certificationRequests, pseudo: profiles.pseudo, grade: profiles.grade })
      .from(certificationRequests)
      .innerJoin(profiles, eq(profiles.userId, certificationRequests.userId))
      .where(status ? eq(certificationRequests.status, status) : undefined)
      .orderBy(desc(certificationRequests.status), certificationRequests.createdAt)
      .limit(200);
    return rows.map(({ req, pseudo, grade }) => {
      const snapshot = req.snapshot as CertificationSnapshot;
      return {
        id: req.id,
        status: req.status,
        createdAt: req.createdAt.toISOString(),
        decidedAt: req.decidedAt?.toISOString() ?? null,
        note: req.note,
        message: req.message,
        userId: req.userId,
        pseudo,
        grade,
        vehicleId: req.vehicleId,
        vehicleLabel: snapshot.label,
        snapshot,
      };
    });
  },

  /** `POST /admin/certification-requests/:id/decide`. */
  async adminDecide(v: Viewer, id: string, input: AdminDecision): Promise<void> {
    await requirePlatformRole(v, "super_admin");
    await withTx(async (tx, after) => {
      const [req] = await tx.select().from(certificationRequests).where(eq(certificationRequests.id, id)).for("update");
      if (!req) throw notFound("Demande introuvable");
      if (req.status !== "pending") throw conflict("conflict", "Cette demande est déjà traitée");
      // Véhicule verrouillé : plus de modification de la fiche entre la comparaison et la validation.
      await tx.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.id, req.vehicleId)).for("update");
      const vehicle = await vehiclesRepo.findFullById(req.vehicleId, tx);
      if (!vehicle) throw notFound("Véhicule introuvable");
      const accept = input.decision === "accept";
      if (accept && vehicle.status !== "active") throw conflict("conflict", "Le véhicule n'est plus actif");
      // Lot R4a, tour 2 : un nom tapé pas encore rattaché à la liste ne se certifie pas (condition « reference »).
      if (accept && (vehicle.proposedMake || vehicle.proposedModel)) {
        throw conflict("conflict", "Le modèle n'est pas encore rattaché à la liste Orasso : rattache-le d'abord.");
      }
      if (accept) {
        const examined = (req.snapshot as CertificationSnapshot).fields;
        const current = await certificationFieldsOf(tx, vehicle.id);
        // Demande sans champs enregistrés (ancienne) : on ne peut pas comparer, on refuse de valider à l'aveugle.
        if (!examined || !current || certificationLostByChange(examined, current)) {
          throw conflict("conflict", "Fiche modifiée depuis la demande : refuse la demande, le membre en refera une.");
        }
      }
      const at = now();
      await tx
        .update(certificationRequests)
        .set({ status: accept ? "accepted" : "refused", decidedBy: v.user.id, decidedAt: at, note: input.note ?? null })
        .where(eq(certificationRequests.id, id));
      if (accept) {
        await tx
          .update(vehicles)
          .set({ certifiedAt: at, certifiedLostReason: null })
          .where(eq(vehicles.id, vehicle.id));
      }
      const label = vehicleLabel(vehicle);
      await notificationsService.notify(tx, req.userId, accept ? "certification_accepted" : "certification_refused", {
        title: accept ? "Véhicule certifié" : "Certification refusée",
        body: accept
          ? `${label} est certifié : le badge apparaît sur sa fiche et pendant le tri.`
          : `La certification de ${label} est refusée.${input.note ? `\n${input.note}` : ""}`,
        data: { vehicleId: vehicle.id, requestId: id },
        link: garageLink(vehicle.id),
      });
      await tx.insert(adminAuditLog).values({
        actorUserId: v.user.id,
        action: `certification.${input.decision}`,
        targetType: "vehicle",
        targetId: vehicle.id,
        reason: input.note ?? null,
      });
      after(() => notificationsService.kick());
    });
  },

  /** Perte de la certification (modifiée ou inactive) : colonne remise à zéro et notification. */
  async lose(tx: Tx, vehicleId: string, reason: "modified" | "inactive"): Promise<boolean> {
    const [v] = await tx
      .update(vehicles)
      .set({ certifiedAt: null, certifiedLostReason: reason })
      .where(and(eq(vehicles.id, vehicleId), isNotNull(vehicles.certifiedAt)))
      .returning();
    if (!v) return false;
    const full = await vehiclesRepo.findFullById(vehicleId, tx);
    const label = full ? vehicleLabel(full) : "Ton véhicule";
    await notificationsService.notify(tx, v.ownerId, "certification_lost", {
      title: "Certification perdue",
      body: `${label} n'est plus certifié (${certificationLostLabels[reason].toLowerCase()}). Tu peux refaire une demande.`,
      data: { vehicleId },
      link: garageLink(vehicleId),
    });
    return true;
  },

  /**
   * À appeler après toute modification de la fiche d'un véhicule certifié : perte si un champ surveillé a changé
   * (S38) ; sinon rien.
   */
  async afterChange(
    tx: Tx,
    after: (cb: () => unknown) => void,
    vehicleId: string,
    before: CertificationFields | null,
  ): Promise<void> {
    if (!before) return;
    const current = await certificationFieldsOf(tx, vehicleId);
    if (!current || !certificationLostByChange(before, current)) return;
    if (await certificationService.lose(tx, vehicleId, "modified")) after(() => notificationsService.kick());
  },

  /**
   * Champs surveillés avant une modification, lus **dans la transaction** (véhicule verrouillé par l'appelant) :
   * null si le véhicule n'est pas certifié. Une demande en cours n'en a pas besoin : sa validation compare la fiche à
   * celle de la demande.
   */
  async fieldsBeforeChange(tx: Tx, vehicleId: string): Promise<CertificationFields | null> {
    const [v] = await tx.select({ at: vehicles.certifiedAt }).from(vehicles).where(eq(vehicles.id, vehicleId));
    return v?.at ? certificationFieldsOf(tx, vehicleId) : null;
  },

  /**
   * Tâche `certification.sweep` (quotidienne) : les véhicules certifiés depuis plus de six mois, sans entrée sur un
   * événement depuis six mois, perdent leur certification (« inactive »).
   */
  async sweep(): Promise<number> {
    const at = now();
    const cutoff = certificationInactivityCutoff(at);
    const rows = await db
      .select({ id: vehicles.id, certifiedAt: vehicles.certifiedAt, lastCheckin: max(checkins.checkedInAt) })
      .from(vehicles)
      .leftJoin(applications, eq(applications.vehicleId, vehicles.id))
      .leftJoin(checkins, eq(checkins.applicationId, applications.id))
      .where(and(isNotNull(vehicles.certifiedAt), lte(vehicles.certifiedAt, cutoff)))
      .groupBy(vehicles.id);
    let lost = 0;
    for (const r of rows) {
      if (!r.certifiedAt || !certificationInactive(r.certifiedAt, r.lastCheckin, at)) continue;
      await withTx(async (tx, after) => {
        if (await certificationService.lose(tx, r.id, "inactive")) {
          lost++;
          after(() => notificationsService.kick());
        }
      });
    }
    return lost;
  },
};
