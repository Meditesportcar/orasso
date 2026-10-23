// Jour J (ARCHITECTURE.md § 2.5, § 4.4 à 4.6) : réception des lectures des appareils (idempotente), doublons entre
// appareils (le premier `scanned_at` gagne), pointage manuel et par plaque, recherche, rapport, direct.
import {
  type CheckinListItem,
  type CheckinMethod,
  type CheckinResult,
  checkinStaffRoles,
  dayFor,
  isMultiDay,
  type LiveCounters,
  localDate,
  MINUTE,
  normalizePlate,
  providerTypeLabel,
  type ScanBatch,
  type ScanBatchItem,
  type ScanBatchResult,
  type ScanReport,
  type ScanServerResult,
  type StaffRole,
  settleAt,
  staffModeOpensAt,
  type VendorTypeCode,
  verifyPassPayload,
} from "@orasso/shared";
import { and, asc, eq, ilike, inArray, isNull, like, or, type SQL, sql } from "drizzle-orm";

import { db } from "../../db/client";
import {
  accessPasses,
  applications,
  categories,
  checkins,
  devices,
  events,
  eventZones,
  profiles,
  scanEvents,
  staffAlerts,
  vehicleCategories,
  vehicleMakes,
  vehicleModels,
  vehicles,
} from "../../db/schema";
import { requireOrganizer } from "../../lib/access";
import { now } from "../../lib/deps";
import { AppError, notFound, validation } from "../../lib/errors";
import { lockEventCheckins } from "../../lib/locks";
import { escapeLike } from "../../lib/pagination";
import { realtime } from "../../lib/realtime";
import type { Viewer } from "../../lib/session";
import { ed25519Verify, signing } from "../../lib/signing";
import { type Tx, withTx } from "../../lib/tx";
import { announceCandidatesChanged } from "../audience-prize/service";
import { daysRepo } from "../events/days";
import { type EventRow, eventsRepo } from "../events/repo";
import { passportService } from "../passport/service";
import { loadProviders } from "../providers/serializers";
import { assertStaffWindow, staffService } from "../staff/service";
import { shopService } from "../staff/shop";
import { vehiclesRepo } from "../vehicles/repo";
import { vehicleLabel } from "../vehicles/serializers";

export type CheckinRow = typeof checkins.$inferSelect;
type ScanRow = typeof scanEvents.$inferSelect;

/** Avance tolérée de l'horloge d'un appareil sur celle du serveur. */
const MAX_FUTURE_SKEW_MS = 5 * MINUTE;

const lockedError = (message: string) => new AppError(423, "locked", message);

/**
 * Horloge de l'appareil (choix C22), gardée seulement si elle tombe dans la fenêtre de l'événement (de la veille
 * 00:00 au règlement de J+2) et pas après la réception (5 min de tolérance) ; sinon, l'heure de réception.
 */
export function clampScannedAt(
  scannedAt: Date,
  receivedAt: Date,
  event: Parameters<typeof settleAt>[0] & {
    startsAt: Date;
    timezone?: string;
  },
): Date {
  const t = scannedAt.getTime();
  const ok =
    t >= staffModeOpensAt(event).getTime() &&
    t < settleAt(event).getTime() &&
    t <= receivedAt.getTime() + MAX_FUTURE_SKEW_MS;
  return ok ? scannedAt : receivedAt;
}

/** Événement publié et fenêtre ouverte (sinon 423, avant tout traitement). */
function assertWritable(event: EventRow) {
  if (event.status !== "published") throw lockedError("Événement non publié ou annulé");
  if (now() < staffModeOpensAt(event)) throw lockedError("Pointage ouvert à partir de la veille de l'événement");
}

/** Points déjà réglés (ou échéance passée) : plus aucune entrée possible. Relu après le verrou. */
async function isSettled(tx: Tx, eventId: string): Promise<boolean> {
  const [row] = await tx
    .select({ endsAt: events.endsAt, settledAt: events.settledAt })
    .from(events)
    .where(eq(events.id, eventId));
  return !row || Boolean(row.settledAt) || now() >= settleAt(row);
}

/** Candidature retenue de l'événement avec un pass valide (sinon pas d'entrée possible). */
async function admittedApplication(tx: Tx, eventId: string, applicationId: string) {
  const [row] = await tx
    .select({ app: applications, passId: accessPasses.id })
    .from(applications)
    .innerJoin(accessPasses, and(eq(accessPasses.applicationId, applications.id), isNull(accessPasses.revokedAt)))
    .where(
      and(eq(applications.id, applicationId), eq(applications.eventId, eventId), eq(applications.status, "accepted")),
    );
  return row ?? null;
}

/**
 * Entrée d'une candidature (une seule par candidature). Un scan antérieur à l'entrée connue la réécrit (heure la plus
 * ancienne, choix C9) ; un pointage manuel ou par plaque ne réécrit jamais une entrée existante.
 */
async function recordEntry(
  tx: Tx,
  input: {
    eventId: string;
    applicationId: string;
    zoneId: string | null;
    at: Date;
    method: CheckinMethod;
    deviceId: string | null;
    staffUserId: string | null;
    scanId?: string;
    note?: string | null;
  },
): Promise<{ checkin: CheckinRow; created: boolean; rewritten: boolean }> {
  const existing = await tx.query.checkins.findFirst({ where: eq(checkins.applicationId, input.applicationId) });
  if (!existing) {
    const [row] = await tx
      .insert(checkins)
      .values({
        applicationId: input.applicationId,
        eventId: input.eventId,
        method: input.method,
        checkedInAt: input.at,
        deviceId: input.deviceId,
        staffUserId: input.staffUserId,
        zoneId: input.zoneId,
        sourceScanId: input.scanId ?? null,
        note: input.note ?? null,
      })
      .returning();
    if (!row) throw new Error("Entrée non enregistrée");
    // Lot 49 : tampon de participation à l'heure de l'entrée (point de reprise : jamais d'échec du pointage), publié à
    // l'écran par `announce` après validation.
    await passportService.stampCheckin(tx, {
      applicationId: row.applicationId,
      eventId: row.eventId,
      at: input.at,
      announce: true,
    });
    return { checkin: row, created: true, rewritten: false };
  }
  if (input.method === "scan" && input.scanId && input.at < existing.checkedInAt) {
    const [row] = await tx
      .update(checkins)
      .set({
        method: "scan",
        checkedInAt: input.at,
        deviceId: input.deviceId,
        staffUserId: input.staffUserId,
        sourceScanId: input.scanId,
      })
      .where(eq(checkins.id, existing.id))
      .returning();
    if (!row) throw new Error("Entrée non mise à jour");
    return { checkin: row, created: false, rewritten: true };
  }
  return { checkin: existing, created: false, rewritten: false };
}

/** Après une réécriture : toutes les autres lectures retenues de la candidature deviennent des doublons du premier. */
async function markDuplicates(tx: Tx, applicationId: string, first: { id: string; deviceId: string | null }) {
  await tx
    .update(scanEvents)
    .set({
      serverResult: sql`case when ${scanEvents.deviceId} is not distinct from ${first.deviceId}::uuid
        then 'duplicate_same_device' else 'duplicate_other_device' end::scan_server_result`,
      duplicateOfScanId: first.id,
    })
    .where(
      and(
        eq(scanEvents.applicationId, applicationId),
        sql`${scanEvents.id} <> ${first.id}`,
        inArray(scanEvents.serverResult, ["accepted", "duplicate_same_device", "duplicate_other_device"]),
      ),
    );
}

async function zoneOf(applicationZoneId: string | null) {
  if (!applicationZoneId) return null;
  const z = await db.query.eventZones.findFirst({ where: eq(eventZones.id, applicationZoneId) });
  return z ? { code: z.code, name: z.name } : null;
}

/** Réponse à une lecture déjà reçue : son état courant (aucune écriture). */
async function storedResult(scan: ScanRow): Promise<ScanBatchResult> {
  const checkin = scan.applicationId
    ? await db.query.checkins.findFirst({ where: eq(checkins.applicationId, scan.applicationId) })
    : undefined;
  const app = scan.applicationId
    ? await db.query.applications.findFirst({ where: eq(applications.id, scan.applicationId) })
    : undefined;
  return {
    id: scan.id,
    result: scan.serverResult,
    applicationId: scan.applicationId,
    checkedInAt: checkin?.checkedInAt.toISOString() ?? null,
    duplicateOf: scan.duplicateOfScanId,
    zone: await zoneOf(app?.zoneId ?? null),
  };
}

/** Résout le pass d'une lecture : identifiant fourni par l'appareil, ou QR relu et vérifié par le serveur. */
async function resolvePass(tx: Tx, item: Extract<ScanBatchItem, { kind: "scan" }>) {
  let passId = item.passId ?? null;
  if (!passId && item.rawPayload) {
    const keys = await signing.trustedKeys(tx);
    const check = verifyPassPayload(item.rawPayload, keys, ed25519Verify);
    if (check.ok) passId = check.pass.passId;
  }
  if (!passId) return null;
  return (await tx.query.accessPasses.findFirst({ where: eq(accessPasses.id, passId) })) ?? null;
}

/** Une lecture (§ 2.5) : décision serveur, entrée éventuelle, doublon. */
async function applyScan(
  tx: Tx,
  event: EventRow,
  v: Viewer,
  deviceId: string,
  item: Extract<ScanBatchItem, { kind: "scan" }>,
  receivedAt: Date,
): Promise<ScanBatchResult> {
  const scannedAt = clampScannedAt(item.scannedAt, receivedAt, event);
  const pass = await resolvePass(tx, item);
  const ofEvent = pass?.eventId === event.id ? pass : null;
  const app = ofEvent
    ? await tx.query.applications.findFirst({ where: eq(applications.id, ofEvent.applicationId) })
    : undefined;

  let result: ScanServerResult;
  let duplicateOf: string | null = null;
  let entry: Awaited<ReturnType<typeof recordEntry>> | null = null;
  const evidence = item.decision === "ok" || item.decision === "already" || item.decision === "override";
  if (!ofEvent || !app) {
    // QR étranger, d'un autre événement ou inconnu du serveur.
    result = item.decision === "refused" || !evidence ? "rejected" : "unknown";
  } else if (!evidence || ofEvent.revokedAt || app.status !== "accepted") {
    // Refusé par l'appareil, pass révoqué, candidature plus retenue : pas d'entrée.
    result = "rejected";
  } else {
    const current = await tx.query.checkins.findFirst({ where: eq(checkins.applicationId, app.id) });
    if (!current || scannedAt < current.checkedInAt) {
      result = "accepted";
    } else {
      result = current.deviceId === deviceId ? "duplicate_same_device" : "duplicate_other_device";
      duplicateOf = current.sourceScanId;
    }
  }

  const [inserted] = await tx
    .insert(scanEvents)
    .values({
      id: item.id,
      eventId: event.id,
      deviceId,
      staffUserId: v.user.id,
      passId: ofEvent?.id ?? null,
      applicationId: ofEvent?.applicationId ?? null,
      rawPayload: ofEvent ? null : (item.rawPayload ?? null),
      localDecision: item.decision,
      localReason: item.reason,
      zoneCode: item.zoneCode,
      scannedAt,
      receivedAt,
      serverResult: result,
      duplicateOfScanId: duplicateOf,
    })
    .onConflictDoNothing()
    .returning();
  // Même identifiant reçu en même temps par deux requêtes : la première a gagné, on renvoie son état.
  if (!inserted) {
    const stored = await tx.query.scanEvents.findFirst({ where: eq(scanEvents.id, item.id) });
    if (!stored) throw new Error("Lecture introuvable");
    if (stored.eventId !== event.id || stored.staffUserId !== v.user.id) {
      return { id: item.id, result: "rejected", applicationId: null, checkedInAt: null, duplicateOf: null, zone: null };
    }
    return storedResult(stored);
  }

  if (result === "accepted" && app) {
    entry = await recordEntry(tx, {
      eventId: event.id,
      applicationId: app.id,
      zoneId: app.zoneId,
      at: scannedAt,
      method: "scan",
      deviceId,
      staffUserId: v.user.id,
      scanId: item.id,
    });
    if (entry.rewritten) await markDuplicates(tx, app.id, { id: item.id, deviceId });
  }
  const checkin = app ? await tx.query.checkins.findFirst({ where: eq(checkins.applicationId, app.id) }) : undefined;
  return {
    id: item.id,
    result,
    applicationId: app?.id ?? null,
    checkedInAt: checkin?.checkedInAt.toISOString() ?? null,
    duplicateOf,
    zone: await zoneOf(app?.zoneId ?? null),
  };
}

/** Pointage fait hors ligne depuis la liste ou par plaque, envoyé dans le même lot que les lectures. */
async function applyCheckinItem(
  tx: Tx,
  event: EventRow,
  v: Viewer,
  deviceId: string,
  item: Extract<ScanBatchItem, { kind: "manual" | "plate" | "drive" }>,
  receivedAt: Date,
): Promise<ScanBatchResult> {
  const admitted = await admittedApplication(tx, event.id, item.applicationId);
  const base = { id: item.id, applicationId: item.applicationId, duplicateOf: null };
  if (!admitted) return { ...base, result: "rejected", checkedInAt: null, zone: null };
  const { checkin, created } = await recordEntry(tx, {
    eventId: event.id,
    applicationId: admitted.app.id,
    zoneId: admitted.app.zoneId,
    at: clampScannedAt(item.scannedAt, receivedAt, event),
    method: item.kind,
    deviceId,
    staffUserId: v.user.id,
    note: item.note,
  });
  return {
    ...base,
    result: created || checkin.deviceId === deviceId ? "accepted" : "duplicate_other_device",
    checkedInAt: checkin.checkedInAt.toISOString(),
    zone: await zoneOf(admitted.app.zoneId),
  };
}

/** Temps réel après une entrée : direct de l'organisateur et liste du staff. */
function announce(after: (cb: () => unknown) => void, eventId: string, applicationIds: string[]) {
  if (!applicationIds.length) return;
  after(async () => {
    realtime.publish(`event:${eventId}:access`, "access.changed", { applicationIds });
    announceCandidatesChanged(eventId);
    realtime.publish(`event:${eventId}:live`, "live", await checkinsService.liveCounters(eventId));
    await passportService.announce(eventId, applicationIds);
  });
}

/** Lignes de pointage (liste, recherche, résultats), hydratées par lots. */
async function listItems(eventId: string, where: SQL | undefined, limit = 1000): Promise<CheckinListItem[]> {
  const rows = await db
    .select({ app: applications, checkin: checkins, pseudo: profiles.pseudo })
    .from(applications)
    .innerJoin(profiles, eq(profiles.userId, applications.userId))
    .innerJoin(accessPasses, and(eq(accessPasses.applicationId, applications.id), isNull(accessPasses.revokedAt)))
    .leftJoin(checkins, eq(checkins.applicationId, applications.id))
    .leftJoin(vehicles, eq(vehicles.id, applications.vehicleId))
    .leftJoin(vehicleMakes, eq(vehicleMakes.id, vehicles.makeId))
    .leftJoin(vehicleModels, eq(vehicleModels.id, vehicles.modelId))
    .where(and(eq(applications.eventId, eventId), eq(applications.status, "accepted"), where))
    .orderBy(asc(profiles.pseudo), asc(applications.id))
    .limit(limit);
  const vs = new Map(
    (await vehiclesRepo.findFullByIds(rows.flatMap((r) => (r.app.vehicleId ? [r.app.vehicleId] : [])))).map((x) => [
      x.id,
      x,
    ]),
  );
  const zones = new Map(
    (await db.query.eventZones.findMany({ where: eq(eventZones.eventId, eventId) })).map((z) => [z.id, z]),
  );
  const providers = await loadProviders(
    rows.flatMap((r) => (r.app.providerProfileId ? [r.app.providerProfileId] : [])),
  );
  const dayDates = await daysRepo.byIds(rows.map((r) => r.app.eventDayId));
  return rows.map(({ app, checkin, pseudo }) => {
    const v = app.vehicleId ? vs.get(app.vehicleId) : undefined;
    const z = app.zoneId ? zones.get(app.zoneId) : undefined;
    const prov = app.providerProfileId ? providers.get(app.providerProfileId) : undefined;
    return {
      applicationId: app.id,
      pseudo,
      vehicleLabel: prov
        ? `${providerTypeLabel(prov.type as VendorTypeCode, prov.customType)} · ${prov.name}`
        : v
          ? vehicleLabel(v)
          : null,
      zone: z ? { code: z.code, name: z.name } : null,
      status: app.status,
      checkedInAt: checkin?.checkedInAt.toISOString() ?? null,
      method: checkin?.method ?? null,
      note: checkin?.note ?? null,
      dayDate: app.eventDayId ? (dayDates.get(app.eventDayId)?.dayDate ?? null) : null,
    };
  });
}

/**
 * Lot 26 : candidatures « tout l'événement » lues ce jour-là (lecture acceptée ou doublon, date locale de l'événement).
 * Avec l'entrée datée de ce jour, c'est la règle d'un « arrivé » d'un jour (direct, liste du jour J, bilan).
 */
async function seenOnDay(
  eventId: string,
  appIds: string[],
  dayDate: string,
  timezone: string,
): Promise<Set<string | null>> {
  if (!appIds.length) return new Set();
  const rows = await db
    .selectDistinct({ appId: scanEvents.applicationId })
    .from(scanEvents)
    .where(
      and(
        eq(scanEvents.eventId, eventId),
        inArray(scanEvents.applicationId, appIds),
        inArray(scanEvents.serverResult, ["accepted", "duplicate_same_device", "duplicate_other_device"]),
        sql`(${scanEvents.scannedAt} at time zone ${timezone})::date = ${dayDate}::date`,
      ),
    );
  return new Set(rows.map((r) => r.appId));
}

/** Jour d'un autre événement (IDOR) ou inconnu : introuvable (lot 26). */
async function assertEventDay(eventId: string, dayId: string | undefined) {
  if (!dayId) return;
  if (!(await daysRepo.list(eventId)).some((d) => d.id === dayId)) throw notFound("Jour introuvable");
}

async function staffEvent(v: Viewer, eventId: string, roles?: readonly StaffRole[]) {
  const event = await eventsRepo.byId(eventId);
  if (event.status === "draft") throw notFound("Événement introuvable");
  const access = await staffService.requireEventStaff(v, event, roles);
  return { event, access };
}

export const checkinsService = {
  /**
   * `POST /events/:id/scans` : lot de lectures d'un appareil (≤ 200). Idempotent : un identifiant déjà reçu renvoie
   * son état sans rien écrire. Chaque lecture est attribuée à l'appareil et au staff qui l'envoie.
   */
  async receiveBatch(v: Viewer, eventId: string, batch: ScanBatch): Promise<{ results: ScanBatchResult[] }> {
    const { event } = await staffEvent(v, eventId, checkinStaffRoles);
    const device = await db.query.devices.findFirst({ where: eq(devices.id, batch.deviceId) });
    if (!device || device.userId !== v.user.id || device.revokedAt) {
      throw validation("Appareil inconnu : enregistre-le d'abord (/me/devices)");
    }
    const ids = batch.items.map((i) => i.id);
    if (new Set(ids).size !== ids.length) throw validation("Identifiants en double dans le lot");
    const already = await db.query.scanEvents.findMany({ where: inArray(scanEvents.id, ids) });
    const known = new Map(already.map((s) => [s.id, s]));
    const fresh = batch.items.filter((i) => !(i.kind === "scan" && known.has(i.id)));
    if (fresh.length) assertWritable(event);

    const touched: string[] = [];
    const computed = new Map<string, ScanBatchResult>();
    if (fresh.length) {
      await withTx(async (tx, after) => {
        await lockEventCheckins(tx, eventId);
        const receivedAt = now();
        if (await isSettled(tx, eventId)) {
          // Points réglés : chaque élément est refusé (la file hors ligne de l'appli se vide au lieu de bloquer).
          for (const item of fresh) {
            computed.set(item.id, {
              id: item.id,
              result: "rejected",
              reason: "settled",
              applicationId: null,
              checkedInAt: null,
              duplicateOf: null,
              zone: null,
            });
          }
          return;
        }
        for (const item of fresh) {
          const r =
            item.kind === "scan"
              ? await applyScan(tx, event, v, device.id, item, receivedAt)
              : await applyCheckinItem(tx, event, v, device.id, item, receivedAt);
          computed.set(item.id, r);
          if (r.applicationId && (r.result === "accepted" || item.kind !== "scan")) touched.push(r.applicationId);
        }
        await tx.update(devices).set({ lastSeenAt: receivedAt }).where(eq(devices.id, device.id));
        announce(after, eventId, [...new Set(touched)]);
      });
    }
    const results: ScanBatchResult[] = [];
    for (const item of batch.items) {
      const stored = known.get(item.id);
      if (stored && item.kind === "scan") {
        // Rejeu : même réponse, sans écriture ; une lecture d'un autre staff ou d'un autre événement est refusée.
        results.push(
          stored.eventId === eventId && stored.staffUserId === v.user.id
            ? await storedResult(stored)
            : {
                id: item.id,
                result: "rejected",
                applicationId: null,
                checkedInAt: null,
                duplicateOf: null,
                zone: null,
              },
        );
      } else {
        const r = computed.get(item.id);
        if (r) results.push(r);
      }
    }
    return { results };
  },

  /** Pointage manuel en ligne (liste du site ou de l'appli) : 201 si créé, 200 si déjà entré. */
  async create(
    v: Viewer,
    eventId: string,
    input: { applicationId: string; method: "manual" | "plate" | "drive"; note: string | null },
  ): Promise<CheckinResult> {
    const { event } = await staffEvent(v, eventId, checkinStaffRoles);
    assertWritable(event);
    const created = await withTx(async (tx, after) => {
      await lockEventCheckins(tx, eventId);
      if (await isSettled(tx, eventId)) throw lockedError("Points déjà réglés : pointage fermé");
      const admitted = await admittedApplication(tx, eventId, input.applicationId);
      if (!admitted) throw notFound("Participant introuvable ou non retenu");
      const r = await recordEntry(tx, {
        eventId,
        applicationId: admitted.app.id,
        zoneId: admitted.app.zoneId,
        at: now(),
        method: input.method,
        deviceId: null,
        staffUserId: v.user.id,
        note: input.note,
      });
      if (r.created) announce(after, eventId, [admitted.app.id]);
      return r.created;
    });
    const [item] = await listItems(eventId, eq(applications.id, input.applicationId), 1);
    if (!item) throw notFound("Participant introuvable");
    return { ...item, created };
  },

  /**
   * Pointage rapide par plaque, après coup (entrées massives) : plaques saisies, comparées en version normalisée
   * aux véhicules des retenus. Les plaques sans correspondance sont renvoyées telles quelles.
   */
  async byPlates(v: Viewer, eventId: string, plates: string[]) {
    const { event } = await staffEvent(v, eventId, checkinStaffRoles);
    assertWritable(event);
    const wanted = new Map<string, string>();
    for (const p of plates) {
      const n = normalizePlate(p);
      if (n.length >= 2 && !wanted.has(n)) wanted.set(n, p);
    }
    const all = wanted.size
      ? await db
          .select({
            appId: applications.id,
            zoneId: applications.zoneId,
            plate: vehicles.plateNormalized,
            eventDayId: applications.eventDayId,
          })
          .from(applications)
          .innerJoin(vehicles, eq(vehicles.id, applications.vehicleId))
          .innerJoin(accessPasses, and(eq(accessPasses.applicationId, applications.id), isNull(accessPasses.revokedAt)))
          .where(
            and(
              eq(applications.eventId, eventId),
              eq(applications.status, "accepted"),
              inArray(vehicles.plateNormalized, [...wanted.keys()]),
            ),
          )
      : [];
    // Plusieurs jours (lot 26) : seulement tout l'événement ou le jour même (Paris) ; une plaque qui garde plusieurs
    // candidatures (jour et tout l'événement, ou hors des jours) est renvoyée ambiguë, rien n'est pointé.
    const days = await daysRepo.list(eventId);
    const ambiguous: string[] = [];
    const today = isMultiDay(days) ? dayFor(days, now(), event.timezone) : null;
    const kept = isMultiDay(days) ? all.filter((r) => r.eventDayId === null || r.eventDayId === today?.id) : all;
    // Lot M2, tour 4 : sur tout événement (un jour ou plusieurs), une plaque qui désigne plusieurs pass retenus est
    // renvoyée ambiguë et rien n'est pointé (jamais de points au mauvais participant).
    const perPlate = new Map<string | null, number>();
    for (const r of kept) perPlate.set(r.plate, (perPlate.get(r.plate) ?? 0) + 1);
    const rows = kept.filter((r) => perPlate.get(r.plate) === 1);
    for (const [plate, n] of perPlate) if (n > 1 && plate) ambiguous.push(wanted.get(plate) ?? plate);
    const createdIds = new Set<string>();
    await withTx(async (tx, after) => {
      await lockEventCheckins(tx, eventId);
      if (await isSettled(tx, eventId)) throw lockedError("Points déjà réglés : pointage fermé");
      for (const r of rows) {
        const e = await recordEntry(tx, {
          eventId,
          applicationId: r.appId,
          zoneId: r.zoneId,
          at: now(),
          method: "plate",
          deviceId: null,
          staffUserId: v.user.id,
        });
        if (e.created) createdIds.add(r.appId);
      }
      announce(after, eventId, [...createdIds]);
    });
    const items = rows.length
      ? await listItems(
          eventId,
          inArray(
            applications.id,
            rows.map((r) => r.appId),
          ),
        )
      : [];
    const byApp = new Map(items.map((i) => [i.applicationId, i]));
    const matched = rows.flatMap((r) => {
      const item = byApp.get(r.appId);
      return item
        ? [{ plate: wanted.get(r.plate ?? "") ?? r.plate ?? "", ...item, created: createdIds.has(r.appId) }]
        : [];
    });
    // Une plaque connue mais attendue un autre jour seulement n'est pas « inconnue » : elle n'est ni pointée ni listée.
    const found = new Set(all.map((r) => r.plate));
    return {
      matched,
      unmatched: [...wanted.entries()].filter(([n]) => !found.has(n)).map(([, raw]) => raw),
      ambiguous,
    };
  },

  /** Liste des retenus et de leur entrée (« Tous / Arrivés / Attendus », filtre « Sans scan » par méthode). */
  async list(v: Viewer, eventId: string, q: { method?: CheckinMethod; zoneId?: string; q?: string; dayId?: string }) {
    const { event, access } = await staffEvent(v, eventId);
    assertStaffWindow(event, access);
    const filters: (SQL | undefined)[] = [];
    // Plusieurs jours (lot 26) : les attendus d'un jour (ses candidatures et celles de tout l'événement).
    if (q.dayId) {
      await assertEventDay(eventId, q.dayId);
      filters.push(or(isNull(applications.eventDayId), eq(applications.eventDayId, q.dayId)));
    }
    if (q.method) filters.push(eq(checkins.method, q.method));
    if (q.zoneId) filters.push(eq(applications.zoneId, q.zoneId));
    if (q.q) {
      const l = `%${escapeLike(q.q)}%`;
      filters.push(or(ilike(profiles.pseudo, l), ilike(vehicleMakes.name, l), ilike(vehicleModels.name, l)));
    }
    const items = await listItems(eventId, and(...filters));
    if (!q.dayId) return items;
    // Lot 26 : « arrivé » ce jour-là, même règle que le direct : candidature du jour entrée, ou tout l'événement entré ou
    // lu ce jour-là (l'entrée garde le premier passage).
    const day = (await daysRepo.list(eventId)).find((d) => d.id === q.dayId);
    if (!day) return items;
    const whole = items.filter((i) => !i.dayDate && i.checkedInAt).map((i) => i.applicationId);
    const seen = await seenOnDay(eventId, whole, day.dayDate, event.timezone);
    return items.map((i) => ({
      ...i,
      arrivedOnDay: Boolean(
        i.checkedInAt &&
          (i.dayDate ||
            localDate(new Date(i.checkedInAt), event.timezone) === day.dayDate ||
            seen.has(i.applicationId)),
      ),
    }));
  },

  /** Recherche en ligne par plaque (début de plaque normalisée) ou pseudo ; la plaque n'est jamais renvoyée. */
  async search(v: Viewer, eventId: string, text: string) {
    const { event, access } = await staffEvent(v, eventId);
    assertStaffWindow(event, access);
    const plate = normalizePlate(text);
    const conditions: SQL[] = [ilike(profiles.pseudo, `${escapeLike(text)}%`)];
    if (plate.length >= 2) conditions.push(like(vehicles.plateNormalized, `${escapeLike(plate)}%`));
    return listItems(eventId, or(...conditions), 20);
  },

  /** Rapport du jour J (§ 4.5) : totaux, par appareil, doublons, « accepté quand même », refus. */
  async report(v: Viewer, eventId: string): Promise<ScanReport> {
    await staffEvent(v, eventId);
    const scans = await db
      .select({ s: scanEvents, deviceName: devices.name, staffPseudo: profiles.pseudo })
      .from(scanEvents)
      .leftJoin(devices, eq(devices.id, scanEvents.deviceId))
      .leftJoin(profiles, eq(profiles.userId, scanEvents.staffUserId))
      .where(eq(scanEvents.eventId, eventId))
      .orderBy(asc(scanEvents.scannedAt));
    // Entrées des véhicules seulement : `expected` ne compte ni les prestataires (lot 21, compteur à part dans le direct)
    // ni les badges presse (lot 45).
    const otherApps = new Set(
      (
        await db
          .select({ id: applications.id })
          .from(applications)
          .where(and(eq(applications.eventId, eventId), sql`${applications.kind} <> 'vehicle'`))
      ).map((r) => r.id),
    );
    const entries = (await db.query.checkins.findMany({ where: eq(checkins.eventId, eventId) })).filter(
      (c) => !otherApps.has(c.applicationId),
    );
    const expected = (await eventsRepo.statusCounts(eventId)).accepted;
    const items = await listItems(eventId, undefined);
    const people = new Map(items.map((i) => [i.applicationId, i]));
    const appPseudo = async (applicationId: string | null) => {
      if (!applicationId) return null;
      const known = people.get(applicationId);
      if (known) return known.pseudo;
      const [row] = await db
        .select({ pseudo: profiles.pseudo })
        .from(applications)
        .innerJoin(profiles, eq(profiles.userId, applications.userId))
        .where(eq(applications.id, applicationId));
      return row?.pseudo ?? null;
    };
    const isDup = (r: ScanServerResult) => r === "duplicate_same_device" || r === "duplicate_other_device";
    const byMethod = { scan: 0, manual: 0, plate: 0, express: 0, drive: 0 } satisfies Record<CheckinMethod, number>;
    for (const c of entries) byMethod[c.method]++;
    const devicesMap = new Map<string, ScanReport["byDevice"][number]>();
    for (const { s, deviceName, staffPseudo } of scans) {
      const key = `${s.deviceId ?? "?"}|${s.staffUserId ?? "?"}`;
      const d = devicesMap.get(key) ?? { deviceId: s.deviceId, deviceName, staffPseudo, scans: 0, duplicates: 0 };
      d.scans++;
      if (isDup(s.serverResult)) d.duplicates++;
      devicesMap.set(key, d);
    }
    const label = (deviceName: string | null, deviceId: string | null) => deviceName ?? deviceId;
    const duplicates: ScanReport["duplicates"] = [];
    for (const appId of new Set(scans.filter((x) => isDup(x.s.serverResult)).map((x) => x.s.applicationId))) {
      if (!appId) continue;
      const entry = entries.find((c) => c.applicationId === appId);
      const source = scans.find((x) => x.s.id === entry?.sourceScanId);
      const others = scans.filter((x) => x.s.applicationId === appId && isDup(x.s.serverResult));
      const item = people.get(appId);
      duplicates.push({
        applicationId: appId,
        pseudo: item?.pseudo ?? (await appPseudo(appId)) ?? "",
        vehicleLabel: item?.vehicleLabel ?? null,
        first: {
          scanId: source?.s.id ?? null,
          device: source ? label(source.deviceName, source.s.deviceId) : null,
          staff: source?.staffPseudo ?? null,
          at: (entry?.checkedInAt ?? source?.s.scannedAt ?? new Date(0)).toISOString(),
        },
        others: others.map((o) => ({
          scanId: o.s.id,
          device: label(o.deviceName, o.s.deviceId),
          staff: o.staffPseudo,
          at: o.s.scannedAt.toISOString(),
          result: o.s.serverResult,
        })),
      });
    }
    const overrides: ScanReport["overrides"] = [];
    for (const { s, staffPseudo } of scans.filter((x) => x.s.localDecision === "override")) {
      overrides.push({
        scanId: s.id,
        applicationId: s.applicationId,
        pseudo: await appPseudo(s.applicationId),
        staff: staffPseudo,
        at: s.scannedAt.toISOString(),
      });
    }
    const rejected: ScanReport["rejected"] = [];
    for (const { s, staffPseudo } of scans.filter(
      (x) => x.s.serverResult === "rejected" || x.s.serverResult === "unknown",
    )) {
      rejected.push({
        scanId: s.id,
        result: s.serverResult,
        localDecision: s.localDecision,
        reason: s.localReason,
        pseudo: await appPseudo(s.applicationId),
        staff: staffPseudo,
        at: s.scannedAt.toISOString(),
      });
    }
    const count = (r: ScanServerResult) => scans.filter((x) => x.s.serverResult === r).length;
    return {
      totals: {
        scans: scans.length,
        accepted: count("accepted"),
        checkins: entries.length,
        expected,
        byMethod,
        duplicates: count("duplicate_same_device") + count("duplicate_other_device"),
        rejected: count("rejected"),
        overrides: overrides.length,
        unknown: count("unknown"),
      },
      byDevice: [...devicesMap.values()],
      duplicates,
      overrides,
      rejected,
    };
  },

  /**
   * Direct de l'organisateur : arrivés / attendus par catégorie et par zone, staff présent, alertes ouvertes.
   * Plusieurs jours (lot 26) : `dayId` = un jour — attendus : candidatures de ce jour et de tout l'événement ;
   * arrivés : entrée enregistrée (candidature du jour), ou, pour tout l'événement, entrée ou lecture du QR ce jour-là
   * (l'entrée garde le premier passage, S29 : les jours suivants, la lecture « déjà entré » fait foi).
   */
  async liveCounters(eventId: string, dayId: string | null = null): Promise<LiveCounters> {
    const event = await eventsRepo.byId(eventId);
    const day = dayId ? (await daysRepo.list(eventId)).find((d) => d.id === dayId) : undefined;
    let rows = await db
      .select({
        appId: applications.id,
        zoneId: applications.zoneId,
        vehicleId: applications.vehicleId,
        kind: applications.kind,
        eventDayId: applications.eventDayId,
        at: checkins.checkedInAt,
      })
      .from(applications)
      .leftJoin(checkins, eq(checkins.applicationId, applications.id))
      .where(
        and(
          eq(applications.eventId, eventId),
          eq(applications.status, "accepted"),
          day ? or(isNull(applications.eventDayId), eq(applications.eventDayId, day.id)) : undefined,
        ),
      );
    if (day) {
      const whole = rows.filter((r) => r.eventDayId === null && r.at).map((r) => r.appId);
      const seenThatDay = await seenOnDay(eventId, whole, day.dayDate, event.timezone);
      rows = rows.map((r) =>
        r.eventDayId === null && r.at && localDate(r.at, event.timezone) !== day.dayDate && !seenThatDay.has(r.appId)
          ? { ...r, at: null }
          : r,
      );
    }
    // Les prestataires ont leur propre compteur : jamais dans les véhicules, les catégories ni les zones (lot 21).
    const providerRows = rows.filter((r) => r.kind === "provider");
    rows = rows.filter((r) => r.kind === "vehicle");
    const vehicleIds = rows.flatMap((r) => (r.vehicleId ? [r.vehicleId] : []));
    const cats = vehicleIds.length
      ? await db
          .select({ vehicleId: vehicleCategories.vehicleId, c: categories })
          .from(vehicleCategories)
          .innerJoin(categories, eq(categories.id, vehicleCategories.categoryId))
          .where(inArray(vehicleCategories.vehicleId, vehicleIds))
      : [];
    const byCategory = new Map<string, LiveCounters["byCategory"][number] & { position: number }>();
    const arrivedVehicles = new Set(rows.filter((r) => r.at).flatMap((r) => (r.vehicleId ? [r.vehicleId] : [])));
    for (const { vehicleId, c } of cats) {
      const b = byCategory.get(c.id) ?? {
        categoryId: c.id,
        slug: c.slug,
        label: c.label,
        arrived: 0,
        expected: 0,
        position: c.position,
      };
      b.expected++;
      if (arrivedVehicles.has(vehicleId)) b.arrived++;
      byCategory.set(c.id, b);
    }
    const zones = await db.query.eventZones.findMany({
      where: eq(eventZones.eventId, eventId),
      orderBy: [asc(eventZones.position), asc(eventZones.code)],
    });
    const byZone: LiveCounters["byZone"] = [
      ...zones.map((z) => ({ zoneId: z.id, code: z.code, name: z.name, arrived: 0, expected: 0 })),
      { zoneId: null, code: null, name: null, arrived: 0, expected: 0 },
    ];
    for (const r of rows) {
      const z = byZone.find((x) => x.zoneId === r.zoneId) ?? byZone[byZone.length - 1];
      if (!z) continue;
      z.expected++;
      if (r.at) z.arrived++;
    }
    const staff = await staffService.members(event);
    const [alerts] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(staffAlerts)
      .where(and(eq(staffAlerts.eventId, eventId), isNull(staffAlerts.resolvedAt)));
    return {
      dayId: day?.id ?? null,
      arrived: rows.filter((r) => r.at).length,
      expected: rows.length,
      byCategory: [...byCategory.values()]
        .sort((a, b) => a.position - b.position)
        .map(({ position: _p, ...rest }) => rest),
      byZone: byZone.filter((z) => z.zoneId !== null || z.expected > 0),
      staffPresent: staff.filter((m) => m.presence === "present").length,
      staffExpected: staff.length,
      alertsOpen: alerts?.n ?? 0,
      providers: { expected: providerRows.length, arrived: providerRows.filter((r) => r.at).length },
      // Lot 24 : compteur d'entrées des visiteurs (rôle boutique) et billets du public contrôlés.
      visitors: await shopService.visitorTotal(eventId),
      tickets: await shopService.ticketCounts(eventId),
    };
  },

  async live(v: Viewer, eventId: string, dayId?: string): Promise<LiveCounters> {
    const event = await eventsRepo.byId(eventId);
    await requireOrganizer(v, event.structureId);
    await assertEventDay(eventId, dayId);
    return this.liveCounters(eventId, dayId ?? null);
  },
};
