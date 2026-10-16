// Lot 06 : QR des retenus, jour J (« Salon Argelès »), événement passé réglé, points.
// Code déplacé tel quel depuis `scripts/seed.ts` (lot 15) ; appelé par `seed.ts`.
import { randomUUID } from "node:crypto";
import { settleAt } from "@orasso/shared";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../../src/db/client";
import * as t from "../../src/db/schema";
import { startJobs } from "../../src/jobs";
import { deps, systemClock } from "../../src/lib/deps";
import { withTx } from "../../src/lib/tx";
import { accessService } from "../../src/modules/access/service";
import { scheduleEventJobs } from "../../src/modules/events/jobs";
import { pointsService } from "../../src/modules/points/service";
import { apply, createAccount, createEvent, DAY, HOUR, now, parisAt, SMALL } from "./helpers";

// --- Lot 06 : accès, jour J, points -------------------------------------------------------------------------------

/** QR des candidatures retenues qui n'en ont pas (données du lot 05, ou retenues écrites directement par le seed). */
async function issueMissingPasses() {
  const missing = await db
    .select({ id: t.applications.id, eventId: t.applications.eventId, userId: t.applications.userId })
    .from(t.applications)
    .leftJoin(
      t.accessPasses,
      and(eq(t.accessPasses.applicationId, t.applications.id), isNull(t.accessPasses.revokedAt)),
    )
    .where(and(eq(t.applications.status, "accepted"), isNull(t.accessPasses.id)));
  if (!missing.length) return 0;
  await withTx(async (tx) => {
    for (const app of missing) await accessService.issue(tx, app);
  });
  return missing.length;
}

export async function staffAccount(hash: string, pseudo: string, email: string, firstName: string, lastName: string) {
  const existing = await db.query.user.findFirst({ where: eq(t.user.email, email) });
  if (existing) return { id: existing.id, pseudo };
  return createAccount(hash, { pseudo, email, firstName, lastName, departments: ["66"] });
}

export async function seedDayJ(hash: string) {
  const issued = await issueMissingPasses();
  if (issued) console.log(`QR d'inscription émis : ${issued}.`);
  if (await db.query.events.findFirst({ where: eq(t.events.slug, "salon-argeles") })) {
    console.log("Jour J déjà présent (Salon Argelès).");
    return;
  }
  const structure = await db.query.structures.findFirst({ where: eq(t.structures.slug, "meditesportcar") });
  if (!structure) throw new Error("Structure MéditeSportCar absente");
  const byPseudo = async (pseudo: string) => {
    const p = await db.query.profiles.findFirst({ where: sql`lower(${t.profiles.pseudo}) = lower(${pseudo})` });
    if (!p) throw new Error(`Compte ${pseudo} absent`);
    return { id: p.userId, pseudo: p.pseudo };
  };
  const damien = await byPseudo("Damien_66");
  const kenji = await byPseudo("Kenji_66");
  const julie = await byPseudo("Julie_66");
  const theo = await byPseudo("Theo_66");
  const marc = await byPseudo("Marc_66");
  const nina = await byPseudo("Nina_34");
  // Deux membres du staff de plus (6 au total sur le Salon).
  const hugo = await staffAccount(hash, "Hugo_66", "hugo@orasso.local", "Hugo", "Sala");
  const ines = await staffAccount(hash, "Ines_66", "ines@orasso.local", "Inès", "Bosch");
  await db
    .insert(t.structureMembers)
    .values([
      {
        structureId: structure.id,
        userId: hugo.id,
        role: "staff",
        staffRoles: ["scan"],
        status: "active",
        joinedAt: now,
      },
      {
        structureId: structure.id,
        userId: ines.id,
        role: "staff",
        staffRoles: ["control"],
        status: "active",
        joinedAt: now,
      },
    ])
    .onConflictDoNothing();
  const staffIds = new Set([julie.id, theo.id, marc.id, nina.id, hugo.id, ines.id]);

  // Véhicules actifs des passionnés (hors staff), dans l'ordre de création : Kenji d'abord.
  const candidates = (
    await db
      .select({ id: t.vehicles.id, ownerId: t.vehicles.ownerId })
      .from(t.vehicles)
      .where(eq(t.vehicles.status, "active"))
      .orderBy(asc(t.vehicles.createdAt))
  ).filter((v) => !staffIds.has(v.ownerId) && v.ownerId !== damien.id);

  // Salon Argelès : aujourd'hui, début dans 1 h (donc verrouillé), 112 retenus (30 en --small).
  const startsAt = new Date(Math.ceil((now.getTime() + HOUR) / (5 * 60_000)) * 5 * 60_000);
  const salon = await createEvent(structure.id, damien.id, {
    title: "Salon Argelès",
    slug: "salon-argeles",
    format: "show",
    description: "Salon de l'automobile passion sur l'esplanade : JDM, allemandes, exposants.",
    startsAt,
    endsAt: new Date(startsAt.getTime() + 7 * HOUR),
    addressLine: "Esplanade Charles Trenet",
    postalCode: "66700",
    city: "Argelès-sur-Mer",
    department: "66",
    lat: 42.5463,
    lng: 3.0435,
    capacity: 120,
    maxVehiclesPerUser: 2,
    lockOffsetMinutes: 120,
    lockedAt: now,
    registrationsOpenAt: new Date(now.getTime() - 20 * DAY),
    instructions: "Entrée par le parking nord, QR à 30 cm du pare-brise.\nPas de musique avant 11 h.",
  });
  const zones = await db
    .insert(t.eventZones)
    .values([
      { eventId: salon.id, code: "JDM", name: "JDM", capacity: 30, position: 1 },
      { eventId: salon.id, code: "ALL", name: "Allemandes", capacity: 35, position: 2 },
      { eventId: salon.id, code: "EXP", name: "Exposants", capacity: 15, position: 3 },
      { eventId: salon.id, code: "LIB", name: "Libre", capacity: 40, position: 4 },
    ])
    .returning();
  const retained = candidates.slice(0, SMALL ? 30 : 112);
  const salonApps: (typeof t.applications.$inferSelect)[] = [];
  for (const [i, v] of retained.entries()) {
    salonApps.push(
      await apply(salon, v, "accepted", {
        decidedBy: damien.id,
        zoneId: zones[i % zones.length]?.id ?? null,
        createdAt: new Date(now.getTime() - 15 * DAY + i * 900_000),
      }),
    );
  }
  await issueMissingPasses();

  // Staff de l'événement : 6 membres, 4 présents (et synchronisés), 2 sans réponse.
  await db.insert(t.eventStaff).values(
    [julie, theo, marc, nina, hugo, ines].map((m, i) => ({
      eventId: salon.id,
      userId: m.id,
      presence: i < 4 ? ("present" as const) : ("unknown" as const),
      presenceUpdatedAt: i < 4 ? new Date(now.getTime() - DAY) : null,
      syncedAt: i < 4 ? new Date(now.getTime() - 30 * 60_000) : null,
      reminderCount: i < 4 ? 1 : 3,
      lastRemindedAt: new Date(now.getTime() - DAY),
    })),
  );
  const [julieDevice, theoDevice] = await db
    .insert(t.devices)
    .values([
      { userId: julie.id, platform: "android" as const, name: "Pixel de Julie", appVersion: "1.0.0", lastSeenAt: now },
      { userId: theo.id, platform: "ios" as const, name: "iPhone de Théo", appVersion: "1.0.0", lastSeenAt: now },
    ])
    .returning();
  if (!julieDevice || !theoDevice) throw new Error("appareils");

  // 38 entrées (36 scannées, 2 pointées à la main), un doublon entre les deux appareils.
  const passes = new Map(
    (await db.query.accessPasses.findMany({ where: eq(t.accessPasses.eventId, salon.id) })).map((p) => [
      p.applicationId,
      p,
    ]),
  );
  const arrivals = salonApps.slice(0, Math.min(38, salonApps.length));
  for (const [i, app] of arrivals.entries()) {
    const at = new Date(now.getTime() - (50 - i) * 60_000);
    const manual = i >= arrivals.length - 2;
    const dev = i % 2 === 0 ? julieDevice : theoDevice;
    const staffId = i % 2 === 0 ? julie.id : theo.id;
    const scanId = manual ? null : randomUUID();
    if (scanId) {
      await db.insert(t.scanEvents).values({
        id: scanId,
        eventId: salon.id,
        deviceId: dev.id,
        staffUserId: staffId,
        passId: passes.get(app.id)?.id ?? null,
        applicationId: app.id,
        localDecision: "ok",
        zoneCode: zones.find((z) => z.id === app.zoneId)?.code ?? null,
        scannedAt: at,
        receivedAt: new Date(at.getTime() + 20_000),
        serverResult: "accepted",
      });
    }
    await db.insert(t.checkins).values({
      applicationId: app.id,
      eventId: salon.id,
      method: manual ? "manual" : "scan",
      checkedInAt: at,
      deviceId: manual ? null : dev.id,
      staffUserId: manual ? marc.id : staffId,
      zoneId: app.zoneId,
      sourceScanId: scanId,
      note: manual ? "Entré sans scan (QR illisible au soleil)" : null,
    });
    if (i === 3 && scanId) {
      // Théo, sans réseau, a rescanné le même QR deux minutes plus tard.
      await db.insert(t.scanEvents).values({
        id: randomUUID(),
        eventId: salon.id,
        deviceId: theoDevice.id,
        staffUserId: theo.id,
        passId: passes.get(app.id)?.id ?? null,
        applicationId: app.id,
        localDecision: "ok",
        scannedAt: new Date(at.getTime() + 2 * 60_000),
        receivedAt: new Date(at.getTime() + 5 * 60_000),
        serverResult: "duplicate_other_device",
        duplicateOfScanId: scanId,
      });
    }
  }

  // Événement passé, réglé à J+2 : participations, deux malus dont un contesté (encore dans le délai).
  const pastStart = parisAt(-5, 19);
  const past = await createEvent(structure.id, damien.id, {
    title: "Nocturne de rentrée",
    slug: "nocturne-de-rentree",
    format: "night",
    description: "Nocturne de rentrée sur le front de mer.",
    startsAt: pastStart,
    endsAt: new Date(pastStart.getTime() + 4 * HOUR),
    addressLine: "Front de mer",
    postalCode: "66750",
    city: "Saint-Cyprien",
    department: "66",
    capacity: 40,
    lockedAt: new Date(pastStart.getTime() - 2 * HOUR),
    registrationsOpenAt: new Date(pastStart.getTime() - 20 * DAY),
    publishedAt: new Date(pastStart.getTime() - 25 * DAY),
  });
  const pastApps: (typeof t.applications.$inferSelect)[] = [];
  for (const [i, v] of candidates.slice(0, SMALL ? 8 : 16).entries()) {
    pastApps.push(
      await apply(past, v, "accepted", {
        decidedBy: damien.id,
        createdAt: new Date(pastStart.getTime() - 15 * DAY + i * 900_000),
      }),
    );
  }
  await issueMissingPasses();
  // Les deux derniers ne sont pas venus.
  for (const [i, app] of pastApps.slice(0, -2).entries()) {
    await db.insert(t.checkins).values({
      applicationId: app.id,
      eventId: past.id,
      method: "scan",
      checkedInAt: new Date(pastStart.getTime() - 30 * 60_000 + i * 60_000),
      staffUserId: julie.id,
    });
  }
  await db.insert(t.eventStaff).values([
    { eventId: past.id, userId: julie.id, presence: "present" as const },
    { eventId: past.id, userId: theo.id, presence: "present" as const },
  ]);
  // Règlement avec la vraie règle, à l'heure de J+2.
  deps.clock = { now: () => settleAt(past) };
  await pointsService.settleEvent(past.id);
  const malus = await db.query.pointEntries.findMany({
    where: and(eq(t.pointEntries.eventId, past.id), eq(t.pointEntries.kind, "malus")),
  });
  const contested = malus[0];
  if (contested?.applicationId) {
    await db.insert(t.malusContests).values({
      pointEntryId: contested.id,
      userId: contested.userId,
      eventId: past.id,
      applicationId: contested.applicationId,
      message: "Crevaison sur la D914 en venant, j'ai prévenu Julie par message.",
      createdAt: new Date(settleAt(past).getTime() + DAY),
    });
  }
  deps.clock = systemClock;

  // Points du prototype (Damien 340 · Sport, Kenji 120 · Route) : complétés par une reprise tracée.
  await withTx(async (tx) => {
    const season = await pointsService.seasonFor(tx, now);
    for (const [person, target] of [
      [damien, 340],
      [kenji, 120],
    ] as const) {
      const [sum] = await tx
        .select({ total: sql<number>`coalesce(sum(${t.pointEntries.points}), 0)::int` })
        .from(t.pointEntries)
        .where(and(eq(t.pointEntries.userId, person.id), eq(t.pointEntries.seasonId, season.id)));
      const missing = target - (sum?.total ?? 0);
      if (missing !== 0) {
        await tx.insert(t.pointEntries).values({
          userId: person.id,
          seasonId: season.id,
          kind: "admin_adjustment",
          points: missing,
          note: "Reprise des points du prototype",
        });
      }
      await pointsService.recompute(tx, person.id);
    }
  });

  // Tâches du Salon (verrouillage déjà tracé, règlement à J+2) comme à une vraie publication.
  const boss = await startJobs({ work: false });
  await scheduleEventJobs(salon);
  await boss.stop({ graceful: true });
  console.log(
    `Jour J : « Salon Argelès » (${salonApps.length} retenus, ${arrivals.length} entrées, 6 staffs dont 4 présents), ` +
      `« Nocturne de rentrée » réglée (${malus.length} malus, 1 contesté).`,
  );
}
