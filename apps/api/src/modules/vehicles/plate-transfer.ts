// Transfert de plaque (lot 31, S36). Une plaque saisie qui appartient déjà à un véhicule actif d'un autre compte ne
// bloque plus : le véhicule du demandeur est créé sans plaque normalisée (il ne peut pas candidater), l'ancien
// propriétaire confirme (son véhicule passe « Vendu », la plaque change de main) ou refuse ; sans réponse en 7 jours
// ou après un refus, l'équipe Orasso arbitre (`/admin/transferts`). Refus final : véhicule non immatriculé.
import {
  type AdminDecision,
  type AdminPlateTransfer,
  PLATE_TRANSFER_DELAY_DAYS,
  type PlateTransferView,
} from "@orasso/shared";
import { and, asc, desc, eq, inArray, lte, or } from "drizzle-orm";

import { db } from "../../db/client";
import { adminAuditLog, plateTransferRequests, profiles, vehicles } from "../../db/schema";
import { requirePlatformRole } from "../../lib/access";
import { deps, now } from "../../lib/deps";
import { conflict, notFound } from "../../lib/errors";
import type { Viewer } from "../../lib/session";
import { type Tx, withTx } from "../../lib/tx";
import { notificationsService } from "../notifications/service";
import { vehiclesRepo } from "./repo";
import { vehicleLabel } from "./serializers";

type TransferRow = typeof plateTransferRequests.$inferSelect;

const DAY = 86_400_000;
const answerBy = (t: TransferRow) => new Date(t.createdAt.getTime() + PLATE_TRANSFER_DELAY_DAYS * DAY);
const garageLink = (vehicleId: string) => ({ label: "Ouvrir mon garage", path: `/app/garage/${vehicleId}` });

const isUniqueViolation = (error: unknown) => {
  const e = error as { code?: string; cause?: { code?: string } };
  return (e.cause ?? e).code === "23505";
};

/** Le véhicule du demandeur, créé en attente de cette demande. */
const requesterVehicle = (tx: Tx | typeof db, transferId: string) =>
  tx.query.vehicles.findFirst({ where: eq(vehicles.pendingTransferId, transferId) });

async function labelOf(vehicleId: string | undefined | null, tx: Tx | typeof db = db): Promise<string | null> {
  if (!vehicleId) return null;
  const v = await vehiclesRepo.findFullById(vehicleId, tx);
  return v ? vehicleLabel(v) : null;
}

/**
 * Ouvre une demande pour la plaque `plateNormalized` détenue par `holder` : à appeler dans la transaction qui crée le
 * véhicule du demandeur (qui reçoit `pendingTransferId`). Notifie l'ancien propriétaire et planifie l'arbitrage.
 */
async function open(
  tx: Tx,
  after: (cb: () => unknown) => void,
  input: {
    plateNormalized: string;
    holder: { id: string; ownerId: string };
    requester: Viewer;
    plateText: string | null;
  },
): Promise<string> {
  const { plateNormalized, holder, requester } = input;
  const existing = await tx.query.plateTransferRequests.findFirst({
    where: and(
      eq(plateTransferRequests.plateNormalized, plateNormalized),
      eq(plateTransferRequests.toUserId, requester.user.id),
      inArray(plateTransferRequests.status, ["pending", "arbitrated"]),
    ),
  });
  if (existing) {
    throw conflict("plate_taken", "Une demande de transfert est déjà en cours pour cette plaque", {
      transferRequested: true,
    });
  }
  const [row] = await tx
    .insert(plateTransferRequests)
    .values({ plateNormalized, fromVehicleId: holder.id, toUserId: requester.user.id, createdAt: now() })
    .returning();
  if (!row) throw new Error("Demande de transfert non enregistrée");
  const holderLabel = (await labelOf(holder.id, tx)) ?? "ton véhicule";
  await notificationsService.notify(tx, holder.ownerId, "plate_transfer_request", {
    title: "Demande de transfert de plaque",
    body: `${requester.profile.pseudo} a saisi la plaque de ${holderLabel} pour son propre véhicule. Si tu l'as vendu, confirme le transfert ; sinon, l'équipe Orasso tranchera.`,
    data: { transferId: row.id, vehicleId: holder.id },
    link: garageLink(holder.id),
  });
  const escalateAt = answerBy(row);
  after(() => deps.jobs.send("plate-transfer.escalate", { transferId: row.id }, escalateAt));
  after(() => notificationsService.kick());
  return row.id;
}

/**
 * Applique un transfert accepté (par l'ancien propriétaire, par l'équipe, ou automatiquement quand la plaque se libère) :
 * l'ancien véhicule passe « Vendu » s'il porte encore la plaque, le véhicule du demandeur la reçoit.
 */
async function applyAccepted(tx: Tx, transfer: TransferRow, decidedBy: string | null, note: string | null) {
  const target = await requesterVehicle(tx, transfer.id);
  const at = now();
  const [holder] = await tx.select().from(vehicles).where(eq(vehicles.id, transfer.fromVehicleId)).for("update");
  if (holder && holder.status === "active" && holder.plateNormalized === transfer.plateNormalized) {
    await tx
      .update(vehicles)
      .set({
        status: "sold",
        archivedAt: at,
        plateNormalized: null,
        statusNote: "Plaque transférée à un autre membre",
        certifiedAt: null,
      })
      .where(eq(vehicles.id, holder.id));
  }
  if (!target) {
    await tx
      .update(plateTransferRequests)
      .set({ status: "refused", decidedBy, decidedAt: at, note: note ?? "Véhicule du demandeur supprimé" })
      .where(eq(plateTransferRequests.id, transfer.id));
    return;
  }
  try {
    await tx
      .update(vehicles)
      .set({ plateNormalized: transfer.plateNormalized, pendingTransferId: null })
      .where(eq(vehicles.id, target.id));
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict("plate_taken", "Cette plaque est déjà portée par un véhicule actif");
    throw error;
  }
  await tx
    .update(plateTransferRequests)
    .set({ status: "accepted", decidedBy, decidedAt: at, note })
    .where(eq(plateTransferRequests.id, transfer.id));
  await notificationsService.notify(tx, transfer.toUserId, "plate_transfer_accepted", {
    title: "Plaque transférée",
    body: `La plaque est à toi : ${(await labelOf(target.id, tx)) ?? "ton véhicule"} peut maintenant candidater.`,
    data: { transferId: transfer.id, vehicleId: target.id },
    link: garageLink(target.id),
  });
}

/** Refus définitif (équipe Orasso) : le véhicule du demandeur devient non immatriculé, plaque effacée. */
async function applyRefused(tx: Tx, transfer: TransferRow, decidedBy: string | null, note: string | null) {
  const target = await requesterVehicle(tx, transfer.id);
  await tx
    .update(plateTransferRequests)
    .set({ status: "refused", decidedBy, decidedAt: now(), note })
    .where(eq(plateTransferRequests.id, transfer.id));
  if (!target) return;
  await tx
    .update(vehicles)
    .set({ unregistered: true, plate: null, plateNormalized: null, pendingTransferId: null })
    .where(eq(vehicles.id, target.id));
  await notificationsService.notify(tx, transfer.toUserId, "plate_transfer_refused", {
    title: "Transfert de plaque refusé",
    body: `Cette plaque reste à son propriétaire : ${(await labelOf(target.id, tx)) ?? "ton véhicule"} devient non immatriculé.${note ? `\n${note}` : ""}`,
    data: { transferId: transfer.id, vehicleId: target.id },
    link: garageLink(target.id),
  });
}

/** Demande passée à l'arbitrage de l'équipe (refus de l'ancien propriétaire, ou sept jours sans réponse). */
async function toArbitration(tx: Tx, transfer: TransferRow, reason: "declined" | "timeout") {
  await tx
    .update(plateTransferRequests)
    .set({ status: "arbitrated", ...(reason === "timeout" ? { note: "Sans réponse de l'ancien propriétaire" } : {}) })
    .where(eq(plateTransferRequests.id, transfer.id));
  const target = await requesterVehicle(tx, transfer.id);
  await notificationsService.notify(tx, transfer.toUserId, "plate_transfer_arbitrated", {
    title: "Transfert de plaque confié à l'équipe",
    body:
      reason === "declined"
        ? "L'ancien propriétaire n'a pas confirmé le transfert : l'équipe Orasso va trancher."
        : "L'ancien propriétaire n'a pas répondu en 7 jours : l'équipe Orasso va trancher.",
    data: { transferId: transfer.id, ...(target ? { vehicleId: target.id } : {}) },
    link: target ? garageLink(target.id) : undefined,
  });
}

async function lockedTransfer(tx: Tx, id: string): Promise<TransferRow> {
  const [row] = await tx.select().from(plateTransferRequests).where(eq(plateTransferRequests.id, id)).for("update");
  if (!row) throw notFound("Demande introuvable");
  return row;
}

async function viewOf(t: TransferRow, holderVehicleId: string): Promise<PlateTransferView> {
  const [holder, requester, target] = await Promise.all([
    db.query.vehicles.findFirst({ where: eq(vehicles.id, holderVehicleId) }),
    db.query.profiles.findFirst({ where: eq(profiles.userId, t.toUserId) }),
    requesterVehicle(db, t.id),
  ]);
  return {
    id: t.id,
    status: t.status,
    createdAt: t.createdAt.toISOString(),
    plate: holder?.plate ?? t.plateNormalized,
    requesterPseudo: requester?.pseudo ?? "Membre",
    holderVehicleId,
    holderVehicleLabel: (await labelOf(holderVehicleId)) ?? "Véhicule",
    requesterVehicleLabel: await labelOf(target?.id),
    answerBy: answerBy(t).toISOString(),
    note: t.note,
  };
}

export const plateTransferService = {
  open,

  /** Demandes reçues (je suis l'ancien propriétaire) et envoyées (j'ai saisi la plaque d'un autre). */
  async listMine(v: Viewer): Promise<{ incoming: PlateTransferView[]; outgoing: PlateTransferView[] }> {
    const mine = await db
      .select({ transfer: plateTransferRequests })
      .from(plateTransferRequests)
      .innerJoin(vehicles, eq(vehicles.id, plateTransferRequests.fromVehicleId))
      .where(and(eq(vehicles.ownerId, v.user.id), eq(plateTransferRequests.status, "pending")))
      .orderBy(asc(plateTransferRequests.createdAt));
    const sent = await db
      .select()
      .from(plateTransferRequests)
      .where(
        and(
          eq(plateTransferRequests.toUserId, v.user.id),
          inArray(plateTransferRequests.status, ["pending", "arbitrated"]),
        ),
      )
      .orderBy(asc(plateTransferRequests.createdAt));
    return {
      incoming: await Promise.all(mine.map((m) => viewOf(m.transfer, m.transfer.fromVehicleId))),
      outgoing: await Promise.all(sent.map((t) => viewOf(t, t.fromVehicleId))),
    };
  },

  /** L'ancien propriétaire confirme : son véhicule passe « Vendu », la plaque change de main. */
  async accept(v: Viewer, id: string): Promise<void> {
    await withTx(async (tx, after) => {
      const transfer = await lockedTransfer(tx, id);
      const holder = await tx.query.vehicles.findFirst({ where: eq(vehicles.id, transfer.fromVehicleId) });
      if (!holder || holder.ownerId !== v.user.id) throw notFound("Demande introuvable");
      if (transfer.status !== "pending") throw conflict("conflict", "Cette demande n'attend plus ta réponse");
      await applyAccepted(tx, transfer, v.user.id, null);
      after(() => notificationsService.kick());
    });
  },

  /** L'ancien propriétaire refuse : la demande part à l'arbitrage de l'équipe. */
  async decline(v: Viewer, id: string): Promise<void> {
    await withTx(async (tx, after) => {
      const transfer = await lockedTransfer(tx, id);
      const holder = await tx.query.vehicles.findFirst({ where: eq(vehicles.id, transfer.fromVehicleId) });
      if (!holder || holder.ownerId !== v.user.id) throw notFound("Demande introuvable");
      if (transfer.status !== "pending") throw conflict("conflict", "Cette demande n'attend plus ta réponse");
      await toArbitration(tx, transfer, "declined");
      after(() => notificationsService.kick());
    });
  },

  /**
   * Tâche `plate-transfer.escalate` : une demande (`transferId`) ou toutes celles sans réponse depuis 7 jours passent à
   * l'arbitrage. L'état est revérifié en base (la tâche ne porte aucune décision).
   */
  async escalate(transferId?: string): Promise<number> {
    const cutoff = new Date(now().getTime() - PLATE_TRANSFER_DELAY_DAYS * DAY);
    const due = await db
      .select({ id: plateTransferRequests.id })
      .from(plateTransferRequests)
      .where(
        and(
          eq(plateTransferRequests.status, "pending"),
          lte(plateTransferRequests.createdAt, cutoff),
          transferId ? eq(plateTransferRequests.id, transferId) : undefined,
        ),
      );
    let n = 0;
    for (const { id } of due) {
      await withTx(async (tx, after) => {
        const transfer = await lockedTransfer(tx, id);
        if (transfer.status !== "pending") return;
        await toArbitration(tx, transfer, "timeout");
        n++;
        after(() => notificationsService.kick());
      });
    }
    return n;
  },

  /** File de l'équipe : demandes à arbitrer (et celles encore dans le délai), plus récentes en dernier. */
  async adminList(v: Viewer): Promise<AdminPlateTransfer[]> {
    await requirePlatformRole(v, "super_admin");
    const rows = await db
      .select()
      .from(plateTransferRequests)
      .where(or(eq(plateTransferRequests.status, "arbitrated"), eq(plateTransferRequests.status, "pending")))
      .orderBy(desc(plateTransferRequests.status), asc(plateTransferRequests.createdAt));
    return Promise.all(
      rows.map(async (t) => {
        const view = await viewOf(t, t.fromVehicleId);
        const holder = await db.query.vehicles.findFirst({ where: eq(vehicles.id, t.fromVehicleId) });
        const holderProfile = holder
          ? await db.query.profiles.findFirst({ where: eq(profiles.userId, holder.ownerId) })
          : null;
        const target = await requesterVehicle(db, t.id);
        return {
          ...view,
          requesterId: t.toUserId,
          holderPseudo: holderProfile?.pseudo ?? "Membre",
          requesterVehicleId: target?.id ?? null,
        };
      }),
    );
  },

  /** Décision de l'équipe : accepter (la plaque change de main) ou refuser (véhicule non immatriculé). */
  async adminDecide(v: Viewer, id: string, input: AdminDecision): Promise<void> {
    await requirePlatformRole(v, "super_admin");
    await withTx(async (tx, after) => {
      const transfer = await lockedTransfer(tx, id);
      if (transfer.status !== "pending" && transfer.status !== "arbitrated") {
        throw conflict("conflict", "Cette demande est déjà tranchée");
      }
      if (input.decision === "accept") await applyAccepted(tx, transfer, v.user.id, input.note ?? null);
      else await applyRefused(tx, transfer, v.user.id, input.note ?? null);
      await tx.insert(adminAuditLog).values({
        actorUserId: v.user.id,
        action: `plate_transfer.${input.decision}`,
        targetType: "plate_transfer",
        targetId: id,
        reason: input.note ?? null,
      });
      after(() => notificationsService.kick());
    });
  },

  /**
   * L'ancien véhicule quitte la plaque (vendu, archivé, plaque changée, supprimé) pendant qu'une demande est ouverte :
   * la plaque est libre, la demande est acceptée d'office.
   */
  async plateReleased(tx: Tx, holderVehicleId: string): Promise<void> {
    const open = await tx
      .select()
      .from(plateTransferRequests)
      .where(
        and(
          eq(plateTransferRequests.fromVehicleId, holderVehicleId),
          inArray(plateTransferRequests.status, ["pending", "arbitrated"]),
        ),
      )
      .orderBy(asc(plateTransferRequests.createdAt));
    // Une seule demande peut recevoir la plaque (index unique des plaques actives) : la plus ancienne ; les autres
    // sont refusées.
    let first = true;
    for (const t of open) {
      const locked = await lockedTransfer(tx, t.id);
      if (first) await applyAccepted(tx, locked, null, "Plaque libérée par l'ancien propriétaire");
      else await applyRefused(tx, locked, null, "Plaque attribuée à une demande plus ancienne");
      first = false;
    }
  },

  /** Le demandeur supprime son véhicule en attente : la demande est annulée. */
  async cancelFor(tx: Tx, requesterVehicleId: string, transferId: string | null): Promise<void> {
    if (!transferId) return;
    await tx
      .update(plateTransferRequests)
      .set({ status: "refused", decidedAt: now(), note: "Annulée par le demandeur" })
      .where(
        and(eq(plateTransferRequests.id, transferId), inArray(plateTransferRequests.status, ["pending", "arbitrated"])),
      );
    await tx.update(vehicles).set({ pendingTransferId: null }).where(eq(vehicles.id, requesterVehicleId));
  },
};
