// Conflits de plaque laissés par la forme unique du lot M2 (`plate_normalization_conflicts`, migrations 0052 et 0053) :
// l'écran de l'équipe Orasso (lot C7). La migration n'a rien fusionné : la ligne garde son ancienne forme et la forme
// unique reste réservée (`plateHolder`). L'équipe tranche : appliquer la forme unique quand plus personne ne la porte
// (l'autre véhicule a été vendu, archivé, a changé de plaque ; l'autre demande est close), ou classer le conflit
// (les deux plaques sont bien différentes, ou l'affaire est réglée autrement) : la réservation est levée.
import type { AdminPlateConflict, AdminPlateConflictResolution } from "@orasso/shared";
import { formatPlate } from "@orasso/shared";
import { and, asc, eq, inArray, ne } from "drizzle-orm";

import { db } from "../../db/client";
import { adminAuditLog, plateNormalizationConflicts, plateTransferRequests, profiles, vehicles } from "../../db/schema";
import { requirePlatformRole } from "../../lib/access";
import { conflict, notFound } from "../../lib/errors";
import type { Viewer } from "../../lib/session";
import { type Tx, withTx } from "../../lib/tx";
import { vehiclesRepo } from "./repo";
import { vehicleLabel } from "./serializers";

const OPEN = ["pending", "arbitrated"] as const;

const isUniqueViolation = (error: unknown) => {
  const e = error as { code?: string; cause?: { code?: string } };
  return (e.cause ?? e).code === "23505";
};

async function pseudoOf(userId: string | null | undefined): Promise<string> {
  if (!userId) return "Membre";
  const p = await db.query.profiles.findFirst({ where: eq(profiles.userId, userId) });
  return p?.pseudo ?? "Membre";
}

async function labelOf(vehicleId: string | null | undefined): Promise<string | null> {
  if (!vehicleId) return null;
  const v = await vehiclesRepo.findFullById(vehicleId);
  return v ? vehicleLabel(v) : null;
}

/** Le véhicule actif qui porte la forme unique (autre que `exceptId`), ou null. */
function activeHolder(ex: Tx | typeof db, wanted: string, exceptId: string) {
  return ex.query.vehicles.findFirst({
    where: and(eq(vehicles.plateNormalized, wanted), eq(vehicles.status, "active"), ne(vehicles.id, exceptId)),
  });
}

/** L'autre demande ouverte du même compte qui porte la forme unique, ou null. */
function openTwin(ex: Tx | typeof db, wanted: string, toUserId: string, exceptId: string) {
  return ex.query.plateTransferRequests.findFirst({
    where: and(
      eq(plateTransferRequests.plateNormalized, wanted),
      eq(plateTransferRequests.toUserId, toUserId),
      inArray(plateTransferRequests.status, [...OPEN]),
      ne(plateTransferRequests.id, exceptId),
    ),
  });
}

export const plateConflictsService = {
  /** File de l'équipe, plus anciens d'abord. */
  async adminList(v: Viewer): Promise<AdminPlateConflict[]> {
    await requirePlatformRole(v, "super_admin");
    const rows = await db
      .select()
      .from(plateNormalizationConflicts)
      .orderBy(asc(plateNormalizationConflicts.createdAt));
    const out: AdminPlateConflict[] = [];
    for (const c of rows) {
      const base = {
        id: c.id,
        createdAt: c.createdAt.toISOString(),
        keptNormalized: c.keptNormalized,
        wantedNormalized: c.wantedNormalized,
      };
      if (c.vehicleId) {
        const vehicle = await db.query.vehicles.findFirst({ where: eq(vehicles.id, c.vehicleId) });
        if (!vehicle) continue;
        const holder = await activeHolder(db, c.wantedNormalized, vehicle.id);
        out.push({
          ...base,
          kind: "vehicle",
          plate: formatPlate(vehicle.plate ?? c.keptNormalized),
          ownerPseudo: await pseudoOf(vehicle.ownerId),
          vehicleId: vehicle.id,
          vehicleLabel: await labelOf(vehicle.id),
          holder: holder ? { pseudo: await pseudoOf(holder.ownerId), label: await labelOf(holder.id) } : null,
        });
      } else if (c.transferId) {
        const transfer = await db.query.plateTransferRequests.findFirst({
          where: eq(plateTransferRequests.id, c.transferId),
        });
        if (!transfer) continue;
        const twin = await openTwin(db, c.wantedNormalized, transfer.toUserId, transfer.id);
        out.push({
          ...base,
          kind: "transfer",
          plate: formatPlate(c.keptNormalized),
          ownerPseudo: await pseudoOf(transfer.toUserId),
          vehicleId: null,
          vehicleLabel: null,
          holder: twin ? { pseudo: await pseudoOf(twin.toUserId), label: "Autre demande de transfert ouverte" } : null,
        });
      }
    }
    return out;
  },

  /** Appliquer la forme unique (refusé tant qu'un autre la porte) ou classer le conflit. Journal de l'équipe. */
  async adminResolve(v: Viewer, id: string, input: AdminPlateConflictResolution): Promise<void> {
    await requirePlatformRole(v, "super_admin");
    try {
      await withTx(async (tx) => {
        const [row] = await tx
          .select()
          .from(plateNormalizationConflicts)
          .where(eq(plateNormalizationConflicts.id, id))
          .for("update");
        if (!row) throw notFound("Conflit introuvable ou déjà résolu");
        if (input.action === "apply") {
          if (row.vehicleId) {
            if (await activeHolder(tx, row.wantedNormalized, row.vehicleId)) {
              throw conflict(
                "plate_taken",
                "Un autre véhicule actif porte encore cette plaque : classe le conflit ou attends qu'il la quitte.",
              );
            }
            await tx
              .update(vehicles)
              .set({ plateNormalized: row.wantedNormalized })
              .where(eq(vehicles.id, row.vehicleId));
          } else if (row.transferId) {
            const transfer = await tx.query.plateTransferRequests.findFirst({
              where: eq(plateTransferRequests.id, row.transferId),
            });
            if (transfer && (await openTwin(tx, row.wantedNormalized, transfer.toUserId, transfer.id))) {
              throw conflict(
                "plate_taken",
                "Une autre demande ouverte du même compte porte cette plaque : classe le conflit.",
              );
            }
            await tx
              .update(plateTransferRequests)
              .set({ plateNormalized: row.wantedNormalized })
              .where(eq(plateTransferRequests.id, row.transferId));
          }
        }
        await tx.delete(plateNormalizationConflicts).where(eq(plateNormalizationConflicts.id, id));
        await tx.insert(adminAuditLog).values({
          actorUserId: v.user.id,
          action: `plate_conflict.${input.action}`,
          targetType: row.vehicleId ? "vehicle" : "plate_transfer",
          targetId: row.vehicleId ?? row.transferId ?? id,
          reason: input.note ?? null,
        });
      });
    } catch (error) {
      // Deux décisions simultanées : l'index unique des plaques actives (ou des demandes ouvertes) tranche.
      if (isUniqueViolation(error)) throw conflict("plate_taken", "Cette plaque est déjà portée par un véhicule actif");
      throw error;
    }
  },
};
