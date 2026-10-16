// Rôle boutique (lot 24, ARCHITECTURE-SUITE § 8.2) : contrôle des billets du public, y compris hors ligne, et compteur
// d'entrées des visiteurs. Activable par événement (`events.shop_enabled`). Le serveur est l'arbitre : il revérifie
// la signature du QR, n'accepte un billet qu'une fois (mise à jour atomique) et rejoue sans écrire un identifiant déjà
// reçu. Aucun nom de visiteur ne sort de ce module au-delà du pseudo public du titulaire (liste du rôle boutique).
import {
  type StaffRole,
  settleAt,
  staffModeOpensAt,
  type TicketListEntry,
  type TicketScanBatch,
  type TicketScanItem,
  type TicketScanResultView,
  type VisitorEntriesResult,
  type VisitorEntryBatch,
  verifyTicketPayload,
} from "@orasso/shared";
import { and, count, eq, inArray, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { devices, profiles, ticketScans, tickets, ticketTypes, visitorEntries } from "../../db/schema";
import { now } from "../../lib/deps";
import { AppError, notFound, validation } from "../../lib/errors";
import { rateLimit } from "../../lib/rateLimit";
import { realtime } from "../../lib/realtime";
import type { Viewer } from "../../lib/session";
import { ed25519Verify, signing } from "../../lib/signing";
import { type Executor, type Tx, withTx } from "../../lib/tx";
import { type EventRow, eventsRepo } from "../events/repo";
import { staffService } from "./service";

/** Le rôle qui donne accès à la boutique (les organisateurs l'ont d'office, `staffAccess`). */
export const SHOP_ROLES: readonly StaffRole[] = ["shop"];

/** Avance tolérée de l'horloge d'un appareil sur celle du serveur (comme les scans de véhicules). */
const MAX_FUTURE_SKEW_MS = 5 * 60_000;

/** Heure de l'appareil gardée si elle tombe dans la fenêtre du jour J (veille 00:00 → règlement) et pas dans le futur. */
function clampTime(at: Date, receivedAt: Date, event: EventRow): Date {
  const t = at.getTime();
  const ok =
    t >= staffModeOpensAt(event).getTime() &&
    t < settleAt(event).getTime() &&
    t <= receivedAt.getTime() + MAX_FUTURE_SKEW_MS;
  return ok ? at : receivedAt;
}

async function shopEvent(v: Viewer, eventId: string) {
  const event = await eventsRepo.byId(eventId);
  if (event.status === "draft") throw notFound("Événement introuvable");
  await staffService.requireEventStaff(v, event, SHOP_ROLES);
  return event;
}

/** Boutique activée, événement publié, fenêtre du jour J ouverte et points pas encore réglés. */
function assertShopOpen(event: EventRow) {
  if (event.status !== "published") throw new AppError(423, "locked", "Événement non publié ou annulé");
  if (!event.shopEnabled) throw new AppError(409, "conflict", "La boutique n'est pas activée pour cet événement.");
  const t = now();
  if (t < staffModeOpensAt(event)) throw new AppError(423, "locked", "Boutique ouverte à partir de la veille");
  if (t >= settleAt(event) || event.settledAt)
    throw new AppError(423, "locked", "Points déjà réglés : boutique fermée");
}

async function ownedDevice(v: Viewer, deviceId: string | null | undefined): Promise<string | null> {
  if (!deviceId) return null;
  const device = await db.query.devices.findFirst({ where: eq(devices.id, deviceId) });
  if (!device || device.userId !== v.user.id || device.revokedAt) {
    throw validation("Appareil inconnu : enregistre-le d'abord (/me/devices)");
  }
  return device.id;
}

const lockShop = (tx: Tx, eventId: string) =>
  tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`shop:${eventId}`}, 0))`);

type ScanRow = typeof ticketScans.$inferSelect;

async function storedScan(tx: Executor, row: ScanRow): Promise<TicketScanResultView> {
  const ticket = row.ticketId
    ? await tx
        .select({ usedAt: tickets.usedAt, name: ticketTypes.name })
        .from(tickets)
        .innerJoin(ticketTypes, eq(ticketTypes.id, tickets.ticketTypeId))
        .where(eq(tickets.id, row.ticketId))
        .then((r) => r[0])
    : undefined;
  return {
    id: row.id,
    result: row.serverResult,
    ...(row.reason ? { reason: row.reason as TicketScanResultView["reason"] } : {}),
    usedAt: ticket?.usedAt?.toISOString() ?? null,
    ticketName: ticket?.name ?? null,
  };
}

/** Arbitre une lecture : vérifie le QR, retrouve le billet de cet événement, le passe à « utilisé » une seule fois. */
async function arbitrate(
  tx: Tx,
  event: EventRow,
  v: Viewer,
  deviceId: string | null,
  item: TicketScanItem,
  receivedAt: Date,
  keys: ReadonlyMap<number, Uint8Array>,
): Promise<Pick<ScanRow, "ticketId" | "serverResult" | "reason">> {
  const verdict = verifyTicketPayload(item.rawPayload, keys, ed25519Verify);
  if (!verdict.ok) {
    return {
      ticketId: null,
      serverResult: "refused",
      reason: verdict.reason === "malformed" ? "malformed" : "forged",
    };
  }
  if (verdict.ticket.eventNo !== event.eventNo) {
    return { ticketId: null, serverResult: "refused", reason: "other_event" };
  }
  // Le billet doit être celui de CET événement (jamais un billet d'un autre, même signé avec le même numéro).
  const [row] = await tx
    .select()
    .from(tickets)
    .where(and(eq(tickets.id, verdict.ticket.passId), eq(tickets.eventId, event.id)))
    .for("update");
  if (!row) return { ticketId: null, serverResult: "refused", reason: "unknown" };
  if (row.status === "cancelled") return { ticketId: row.id, serverResult: "refused", reason: "cancelled" };
  if (row.status === "used") return { ticketId: row.id, serverResult: "already", reason: null };
  await tx
    .update(tickets)
    .set({
      status: "used",
      usedAt: clampTime(item.scannedAt, receivedAt, event),
      usedBy: v.user.id,
      usedByDeviceId: deviceId,
    })
    .where(eq(tickets.id, row.id));
  return { ticketId: row.id, serverResult: "accepted", reason: null };
}

async function publishLive(eventId: string) {
  const { checkinsService } = await import("../checkins/service");
  realtime.publish(`event:${eventId}:live`, "live", await checkinsService.liveCounters(eventId));
}

export const shopService = {
  /**
   * `POST /events/:id/ticket-scans` : lot de lectures de billets d'un appareil (≤ 200), idempotent par `id`. Rôle
   * « boutique » (ou organisation), boutique activée. Réponse par élément : `accepted` (premier passage), `already`
   * (déjà utilisé, ici ou sur un autre téléphone), `refused`.
   */
  async scanTickets(v: Viewer, eventId: string, batch: TicketScanBatch): Promise<{ results: TicketScanResultView[] }> {
    const event = await shopEvent(v, eventId);
    assertShopOpen(event);
    rateLimit("ticketCheck", v.user.id);
    const deviceId = await ownedDevice(v, batch.deviceId);
    const ids = batch.items.map((i) => i.id);
    if (new Set(ids).size !== ids.length) throw validation("Identifiants en double dans le lot");
    await signing.ensureSynced();
    const keys = await signing.trustedKeys();
    const results = await withTx(async (tx, after) => {
      await lockShop(tx, eventId);
      const receivedAt = now();
      const known = new Map(
        (await tx.select().from(ticketScans).where(inArray(ticketScans.id, ids))).map((s) => [s.id, s]),
      );
      const out: TicketScanResultView[] = [];
      let accepted = 0;
      for (const item of batch.items) {
        const stored = known.get(item.id);
        if (stored) {
          // Rejeu : même réponse sans écriture ; l'identifiant d'un autre staff ou d'un autre événement est refusé.
          out.push(
            stored.eventId === eventId && stored.staffUserId === v.user.id
              ? await storedScan(tx, stored)
              : { id: item.id, result: "rejected", usedAt: null, ticketName: null },
          );
          continue;
        }
        const verdict = await arbitrate(tx, event, v, deviceId, item, receivedAt, keys);
        const [row] = await tx
          .insert(ticketScans)
          .values({
            id: item.id,
            eventId,
            deviceId,
            staffUserId: v.user.id,
            ticketId: verdict.ticketId,
            localDecision: item.decision,
            reason: verdict.reason,
            scannedAt: clampTime(item.scannedAt, receivedAt, event),
            receivedAt,
            serverResult: verdict.serverResult,
          })
          .returning();
        if (!row) throw new Error("Lecture non enregistrée");
        if (verdict.serverResult === "accepted") accepted++;
        out.push(await storedScan(tx, row));
      }
      if (deviceId) await tx.update(devices).set({ lastSeenAt: receivedAt }).where(eq(devices.id, deviceId));
      if (accepted > 0) after(() => void publishLive(eventId));
      return out;
    });
    return { results };
  },

  /**
   * `POST /events/:id/visitor-entries` : touchers du compteur d'entrées (≤ 200), idempotents par `id`. Rend le total de
   * l'événement après ces touchers.
   */
  async addVisitorEntries(v: Viewer, eventId: string, batch: VisitorEntryBatch): Promise<VisitorEntriesResult> {
    const event = await shopEvent(v, eventId);
    assertShopOpen(event);
    rateLimit("ticketCheck", v.user.id);
    const deviceId = await ownedDevice(v, batch.deviceId);
    const ids = batch.items.map((i) => i.id);
    if (new Set(ids).size !== ids.length) throw validation("Identifiants en double dans le lot");
    const receivedAt = now();
    const results = await withTx(async (tx, after) => {
      await lockShop(tx, eventId);
      const out: VisitorEntriesResult["results"] = [];
      let applied = 0;
      for (const item of batch.items) {
        const [row] = await tx
          .insert(visitorEntries)
          .values({
            id: item.id,
            eventId,
            deviceId,
            staffUserId: v.user.id,
            delta: item.delta,
            at: clampTime(item.at, receivedAt, event),
          })
          .onConflictDoNothing()
          .returning({ id: visitorEntries.id });
        out.push({ id: item.id, applied: Boolean(row) });
        if (row) applied++;
      }
      if (applied > 0) after(() => void publishLive(eventId));
      return out;
    });
    return { results, total: await shopService.visitorTotal(eventId) };
  },

  /** Total des visiteurs comptés (tous appareils), jamais en dessous de zéro. */
  async visitorTotal(eventId: string, ex: Executor = db): Promise<number> {
    const [row] = await ex
      .select({ total: sql<number>`coalesce(sum(${visitorEntries.delta}), 0)::int` })
      .from(visitorEntries)
      .where(eq(visitorEntries.eventId, eventId));
    return Math.max(0, row?.total ?? 0);
  },

  /** Billets du public vendus (valides ou utilisés) et déjà contrôlés : le direct de l'organisateur. */
  async ticketCounts(eventId: string, ex: Executor = db): Promise<{ sold: number; used: number }> {
    const [row] = await ex
      .select({
        sold: count(),
        used: sql<number>`count(*) filter (where ${tickets.status} = 'used')::int`,
      })
      .from(tickets)
      .where(and(eq(tickets.eventId, eventId), inArray(tickets.status, ["valid", "used"])));
    return { sold: row?.sold ?? 0, used: row?.used ?? 0 };
  },

  /**
   * Billets de la synchro du rôle boutique : pseudo public du titulaire, type, état. Jamais de nom, d'e-mail ni de
   * téléphone. Tous les billets de l'événement : la synchro en tire la différentielle (même curseur que la liste
   * d'accès, comparé à `updated_at`).
   */
  async ticketEntries(event: EventRow): Promise<TicketListEntry[]> {
    const rows = await db
      .select({ t: tickets, type: ticketTypes.name, pseudo: profiles.pseudo })
      .from(tickets)
      .innerJoin(ticketTypes, eq(ticketTypes.id, tickets.ticketTypeId))
      .leftJoin(profiles, eq(profiles.userId, tickets.userId))
      .where(eq(tickets.eventId, event.id));
    return rows.map(({ t, type, pseudo }) => ({
      ticketId: t.id,
      status: t.status,
      holderLabel: pseudo ?? "—",
      typeLabel: type,
      usedAt: t.usedAt?.toISOString() ?? null,
      updatedAt: t.updatedAt.toISOString(),
    }));
  },
};
