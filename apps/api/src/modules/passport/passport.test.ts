// Lot 49 : passeport et tampons, prix du public, récap (ARCHITECTURE-DA-V2 § 5.5), avec l'horloge simulée.
import { randomUUID } from "node:crypto";
import { type Decide, fromWallTime, nearestFullMoon, stampSeed } from "@orasso/shared";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  addMember,
  call,
  createEvent,
  createStructure,
  createVehicle,
  resetDb,
  seedReference,
  signUp,
  type TestUser,
  useClock,
  viewerOf,
} from "../../../test/helpers";
import { db, pool } from "../../db/client";
import {
  applications,
  audiencePrizeResults,
  audienceVotes,
  checkins,
  devices,
  events,
  notifications,
  passportStamps,
  platformSettings,
  pointEntries,
  profiles,
  vehicles,
} from "../../db/schema";
import { realtime } from "../../lib/realtime";
import type { Viewer } from "../../lib/session";
import { settingsStore } from "../../lib/settings";
import { accountService } from "../account/service";
import { applicationsService } from "../applications/service";
import { audiencePrizeService } from "../audience-prize/service";
import { checkinsService } from "../checkins/service";
import { scheduleEventJobs } from "../events/jobs";
import { notificationsService } from "../notifications/service";
import { pointsService } from "../points/service";
import { recapService } from "../recap/service";
import { staffService } from "../staff/service";

afterAll(async () => {
  await notificationsService.flush();
  await pool.end();
});

const paris = (month: number, day: number, hour: number, minute = 0, year = 2026) =>
  fromWallTime({ year, month, day, hour, minute });

// « Béziers Night » de test : nocturne dans le 66, samedi 17 octobre 2026, 19:00–22:30 ; récap le dimanche à 10:00,
// règlement le lundi 19 à 22:30.
const STARTS = paris(10, 17, 19);
const ENDS = paris(10, 17, 22, 30);
const RECAP = paris(10, 18, 10);
const SETTLE = paris(10, 19, 22, 30);
const ACCEPT: Decide = { decision: "accept", sendReasons: true, note: null };

type Person = { u: TestUser; v: Viewer; applicationId: string; vehicleId: string };
let clock: ReturnType<typeof useClock>;
let ref: Awaited<ReturnType<typeof seedReference>>;
let orga: TestUser;
let orgaV: Viewer;
let structureId: string;
let julie: TestUser;
let julieV: Viewer;
let eventId: string;
let p: Record<"kenji" | "lea" | "nina" | "marc", Person>;

async function enroll(eid: string, u: TestUser, v: Viewer) {
  const vehicle = await createVehicle(u.id, ref);
  const [app] = await applicationsService.apply(v, eid, {
    vehicleIds: [vehicle.id],
    rulesAccepted: true,
    followStructure: false,
    newsletterOptIn: false,
    companions: 0,
    message: null,
  });
  await applicationsService.decide(orgaV, eid, app!.id, ACCEPT);
  return { applicationId: app!.id, vehicleId: vehicle.id };
}

/** Sortie passée, pointée avant la mise en ligne du passeport (candidature retenue + entrée, sans tampon). */
async function pastEntry(eid: string, person: Person, at: Date) {
  const [app] = await db
    .insert(applications)
    .values({
      eventId: eid,
      userId: person.u.id,
      vehicleId: person.vehicleId,
      status: "accepted",
      rulesAcceptedAt: at,
      followStructure: false,
    })
    .returning();
  await db.insert(checkins).values({ applicationId: app!.id, eventId: eid, method: "scan", checkedInAt: at });
}

async function checkin(person: Person, at: Date, eid = eventId) {
  clock.set(at);
  return checkinsService.create(julieV, eid, { applicationId: person.applicationId, method: "manual", note: null });
}

const stampsOf = (userId: string, eid = eventId) =>
  db.query.passportStamps.findMany({ where: and(eq(passportStamps.userId, userId), eq(passportStamps.eventId, eid)) });

const vote = (u: TestUser, applicationId: string, eid = eventId) =>
  call(u, "PUT", `/events/${eid}/audience-prize/vote`, { applicationId });

/** Une connexion WebSocket simulée, abonnée à un canal. */
function listen(channel: string) {
  const messages: { type: string; payload: Record<string, unknown> }[] = [];
  const socket = { send: (data: string) => messages.push(JSON.parse(data)) };
  realtime.subscribe(channel, socket);
  return { messages, stop: () => realtime.unsubscribeAll(socket) };
}

beforeEach(async () => {
  await resetDb();
  clock = useClock(paris(10, 10, 12));
  ref = await seedReference();
  orga = await signUp("Damien_66", { twoFactor: true });
  orgaV = await viewerOf(orga);
  structureId = (await createStructure(orga.id)).id;
  julie = await signUp("Julie_66");
  await addMember(structureId, julie.id, "staff", ["scan"]);
  julieV = await viewerOf(julie);
  eventId = (
    await createEvent(structureId, {
      title: "Béziers Night",
      format: "night",
      department: "66",
      startsAt: STARTS,
      endsAt: ENDS,
      capacity: 20,
    })
  ).id;
  p = {} as typeof p;
  for (const [key, pseudo] of [
    ["kenji", "Kenji_66"],
    ["lea", "Lea_11"],
    ["nina", "Nina_34"],
    ["marc", "Marc_66"],
  ] as const) {
    const u = await signUp(pseudo);
    const v = await viewerOf(u);
    p[key] = { u, v, ...(await enroll(eventId, u, v)) };
  }
});

describe("passeport : tampons", () => {
  it("au pointage : forme du format, encre du département, idempotent, Journal et événement WebSocket", async () => {
    const ws = listen(`user:${p.kenji.u.id}`);
    await checkin(p.kenji, paris(10, 17, 19, 2));
    // Pointé une seconde fois (liste) : rien de plus.
    await checkin(p.kenji, paris(10, 17, 19, 30));
    const stamps = await stampsOf(p.kenji.u.id);
    expect(stamps).toHaveLength(1);
    expect(stamps[0]).toMatchObject({
      kind: "participation",
      shape: "octagon",
      ink: "66",
      rare: false,
      seed: stampSeed(p.kenji.u.id, eventId),
      applicationId: p.kenji.applicationId,
      stampedAt: paris(10, 17, 19, 2),
    });
    const stamped = ws.messages.filter((m) => m.type === "passport.stamped");
    expect(stamped).toHaveLength(1);
    expect(stamped[0]!.payload).toMatchObject({ kind: "participation", shape: "octagon", event: { id: eventId } });
    ws.stop();
    const note = await db.query.notifications.findFirst({
      where: and(eq(notifications.userId, p.kenji.u.id), eq(notifications.type, "stamp_received")),
    });
    expect(note).toMatchObject({
      inJournal: true,
      body: "Nouveau tampon de nuit dans ton passeport, encre sang et or du 66.",
    });

    // Lot de l'appareil (pointage hors ligne) : même tampon.
    const [device] = await db.insert(devices).values({ userId: julie.id, platform: "android" }).returning();
    await checkinsService.receiveBatch(julieV, eventId, {
      deviceId: device!.id,
      items: [
        {
          kind: "manual",
          id: randomUUID(),
          applicationId: p.lea.applicationId,
          note: null,
          scannedAt: paris(10, 17, 19, 30),
        },
      ],
    });
    expect(await stampsOf(p.lea.u.id)).toHaveLength(1);

    const passport = (await call(p.kenji.u, "GET", "/me/passport")).json;
    expect(passport).toMatchObject({ total: 1, rare: 0, season: { year: 2026, name: "Saison 2026", total: 1 } });
    expect(passport.pages).toHaveLength(1);
    expect(passport.pages[0].stamps[0]).toMatchObject({ kind: "participation", event: { title: "Béziers Night" } });
    const other = (await call(p.kenji.u, "GET", "/me/passport?season=2025")).json;
    expect(other).toMatchObject({ total: 0, pages: [{ stamps: [] }] });
    expect(other.seasons.map((s: { year: number }) => s.year)).toEqual([2026, 2025]);
    expect((await call(null, "GET", "/me/passport")).status).toBe(401);
  });

  it("staff : la veille seule ne compte pas ; « là » le jour J ou une action le jour J, oui ; visite au billet", async () => {
    const marcel = await signUp("Marcel_66");
    await addMember(structureId, marcel.id, "staff", ["scan"]);
    const theo = await signUp("Theo_66");
    await addMember(structureId, theo.id, "staff", ["scan"]);
    // « Je serai là » la veille : ni tampon, ni voix, ni rare au règlement.
    clock.set(paris(10, 16, 18));
    await staffService.setPresence(await viewerOf(marcel), eventId, true);
    await staffService.setPresence(await viewerOf(theo), eventId, true);
    expect(await stampsOf(marcel.id)).toHaveLength(0);
    // Julie : « Je suis là » 1 h avant le début (dans la fenêtre de 3 h) → tampon tout de suite.
    clock.set(paris(10, 17, 18));
    await staffService.setPresence(julieV, eventId, true);
    expect((await stampsOf(julie.id)).map((s) => s.kind)).toEqual(["staff"]);
    // Théo pointe une voiture le jour J : sa présence devient vérifiable.
    clock.set(paris(10, 17, 19, 2));
    await checkinsService.create(await viewerOf(theo), eventId, {
      applicationId: p.kenji.applicationId,
      method: "manual",
      note: null,
    });
    await checkin(p.lea, paris(10, 17, 19, 10));
    clock.set(paris(10, 17, 20));
    expect((await vote(marcel, p.lea.applicationId)).json.error.code).toBe("not_checked_in");
    expect((await vote(theo, p.lea.applicationId)).status).toBe(200);

    // Billet gratuit du public, contrôlé à l'entrée par le staff d'accueil.
    await db.update(events).set({ publicAccess: "free_reservation" }).where(eq(events.id, eventId));
    clock.set(paris(10, 12, 12));
    expect((await call(orga, "PUT", `/events/${eventId}/ticketing`, { enabled: true, capacity: 50 })).status).toBe(200);
    const visitor = await signUp("Sofia_66");
    const [ticket] = (await call(visitor, "POST", `/events/${eventId}/tickets/reserve`, { quantity: 1 })).json;
    clock.set(paris(10, 17, 19, 20));
    const ok = await call(julie, "POST", `/events/${eventId}/tickets/check`, { payload: ticket.payload });
    expect(ok.json.result).toBe("ok");
    expect((await stampsOf(visitor.id)).map((s) => s.kind)).toEqual(["visit"]);

    clock.set(SETTLE);
    await pointsService.settleEvent(eventId);
    expect(await stampsOf(marcel.id)).toHaveLength(0);
    expect((await stampsOf(theo.id)).map((s) => s.kind).sort()).toEqual(["first_outing", "staff"]);
    expect((await stampsOf(julie.id)).map((s) => s.kind).sort()).toEqual(["first_outing", "staff"]);
  });

  it("staff repassé « pas là » (ou corrigé par l'organisateur) : tampon retiré, pas compté au règlement", async () => {
    clock.set(paris(10, 17, 18));
    await staffService.setPresence(julieV, eventId, true);
    expect(await stampsOf(julie.id)).toHaveLength(1);
    await staffService.setPresence(julieV, eventId, false);
    expect(await stampsOf(julie.id)).toHaveLength(0);
    await staffService.setPresence(julieV, eventId, true);
    expect(await stampsOf(julie.id)).toHaveLength(1);
    await staffService.update(orgaV, eventId, julie.id, { presence: "absent" });
    expect(await stampsOf(julie.id)).toHaveLength(0);
    clock.set(SETTLE);
    await pointsService.settleEvent(eventId);
    expect(await stampsOf(julie.id)).toHaveLength(0);
  });

  it("rares sur l'historique réel : 10e événement, pas de « première sortie » pour un habitué ; pleine lune", async () => {
    // Kenji : neuf sorties pointées avant la mise en ligne du passeport (aucun tampon), Léa : une.
    for (let i = 1; i <= 9; i++) {
      const past = await createEvent(structureId, {
        format: "gathering",
        department: "34",
        startsAt: paris(3, i, 10),
        endsAt: paris(3, i, 14),
        settledAt: paris(3, i + 2, 14),
      });
      await pastEntry(past.id, p.kenji, paris(3, i, 10, 30));
      if (i === 1) await pastEntry(past.id, p.lea, paris(3, i, 10, 40));
    }
    expect(await db.query.passportStamps.findMany()).toHaveLength(0);
    await checkin(p.kenji, paris(10, 17, 19, 2));
    await checkin(p.lea, paris(10, 17, 19, 10));
    await checkin(p.nina, paris(10, 17, 19, 20));
    clock.set(SETTLE);
    expect(await pointsService.settleEvent(eventId)).toBe(true);
    expect((await stampsOf(p.kenji.u.id)).map((s) => s.kind).sort()).toEqual(["participation", "tenth_event"]);
    expect((await stampsOf(p.lea.u.id)).map((s) => s.kind)).toEqual(["participation"]);
    const nina = await stampsOf(p.nina.u.id);
    expect(nina.map((s) => s.kind).sort()).toEqual(["first_outing", "participation"]);
    expect(nina.find((s) => s.kind === "first_outing")).toMatchObject({ rare: true, shape: "octagon", ink: "66" });
    // Le tampon garde l'heure de l'entrée.
    expect(nina.find((s) => s.kind === "participation")?.stampedAt).toEqual(paris(10, 17, 19, 20));
    // Marc, retenu mais absent : rien.
    expect(await stampsOf(p.marc.u.id)).toHaveLength(0);
    // Rejoué (tâche + balayage) : rien de plus.
    await db.update(events).set({ settledAt: null }).where(eq(events.id, eventId));
    await pointsService.settleEvent(eventId);
    // 5 pour les pilotes, 2 pour Julie (staff : elle a pointé le jour J, présence vérifiable).
    expect(await db.query.passportStamps.findMany({ where: eq(passportStamps.eventId, eventId) })).toHaveLength(7);

    // Pleine lune : un événement qui commence à l'instant de la pleine lune la plus proche.
    const moon = nearestFullMoon(paris(10, 17, 19));
    const night = await createEvent(structureId, {
      format: "night",
      startsAt: moon,
      endsAt: new Date(moon.getTime() + 3 * 3_600_000),
    });
    clock.set(new Date(moon.getTime() - 7 * 86_400_000));
    const marc = await enroll(night.id, p.marc.u, p.marc.v);
    await checkin({ ...p.marc, ...marc }, new Date(moon.getTime() + 600_000), night.id);
    clock.set(new Date(moon.getTime() + 3 * 3_600_000 + 48 * 3_600_000));
    await pointsService.settleEvent(night.id);
    expect((await stampsOf(p.marc.u.id, night.id)).map((s) => s.kind).sort()).toEqual([
      "first_outing",
      "full_moon",
      "participation",
    ]);
    const passport = (await call(p.marc.u, "GET", "/me/passport")).json;
    expect(passport).toMatchObject({ total: 3, rare: 2 });
  });
});

describe("passeport : contestation", () => {
  it("malus contesté puis accepté avec entrée : le tampon de participation arrive après le règlement", async () => {
    clock.set(SETTLE);
    await pointsService.settleEvent(eventId);
    expect(await stampsOf(p.marc.u.id)).toHaveLength(0);
    const contest = await pointsService.contest(p.marc.v, p.marc.applicationId, "J'étais là, le QR ne passait pas.");
    await pointsService.decide(orgaV, contest.id, { decision: "accept", note: null, checkin: true });
    // Les rares sont réévalués : c'est sa première sortie.
    expect((await stampsOf(p.marc.u.id)).map((s) => s.kind).sort()).toEqual(["first_outing", "participation"]);
  });
});

describe("prix du public", () => {
  it("qui peut voter : pointé, billet, staff présent ; une voix modifiable ; pas pour soi ; fenêtre", async () => {
    clock.set(paris(10, 17, 18, 30));
    await staffService.setPresence(julieV, eventId, true);
    // Avant le premier pointage : pas encore ouvert.
    expect((await vote(julie, p.kenji.applicationId)).json.error.code).toBe("vote_not_open");
    await checkin(p.kenji, paris(10, 17, 19, 2));
    // Un seul véhicule pointé : on ne peut pas choisir.
    expect((await vote(julie, p.kenji.applicationId)).status).toBe(409);
    await checkin(p.lea, paris(10, 17, 19, 10));
    clock.set(paris(10, 17, 20));
    // Nina, retenue mais pas (encore) pointée : pas de voix.
    const refused = await vote(p.nina.u, p.lea.applicationId);
    expect(refused.status).toBe(403);
    expect(refused.json.error.code).toBe("not_checked_in");
    // Pas pour soi-même.
    const own = await vote(p.kenji.u, p.kenji.applicationId);
    expect(own.status).toBe(400);
    expect(own.json.error.code).toBe("own_vehicle");
    // Un véhicule non pointé ne peut pas recevoir de voix.
    expect((await vote(p.kenji.u, p.nina.applicationId)).status).toBe(400);

    const ws = listen(`event:${eventId}:votes`);
    const ok = await vote(p.kenji.u, p.lea.applicationId);
    expect(ok.status).toBe(200);
    expect(ok.json).toMatchObject({ canVote: true, votedFor: p.lea.applicationId, open: true });
    expect(ws.messages.at(-1)).toMatchObject({
      type: "votes.changed",
      payload: {
        total: 1,
        top3: [
          { applicationId: p.lea.applicationId, votes: 1, rank: 1 },
          { applicationId: p.kenji.applicationId, votes: 0, rank: 2 },
        ],
      },
    });
    ws.stop();
    // Une voix, une seule : elle se déplace (Lea vote pour Kenji, puis Julie aussi).
    expect((await vote(p.lea.u, p.kenji.applicationId)).status).toBe(200);
    expect((await vote(julie, p.lea.applicationId)).status).toBe(200);
    expect((await vote(julie, p.kenji.applicationId)).status).toBe(200);
    expect(await db.query.audienceVotes.findMany({ where: eq(audienceVotes.eventId, eventId) })).toHaveLength(3);

    const mine = (await call(p.kenji.u, "GET", `/events/${eventId}/audience-prize/mine`)).json;
    expect(mine).toMatchObject({
      canVote: true,
      reason: null,
      checkedInAt: paris(10, 17, 19, 2).toISOString(),
      votedFor: p.lea.applicationId,
      ownApplicationIds: [p.kenji.applicationId],
      closesAt: ENDS.toISOString(),
    });
    const board = (await call(p.marc.u, "GET", `/events/${eventId}/audience-prize`)).json;
    expect(board).toMatchObject({ open: true, settled: false, total: 3, vehicles: 2, winnerPoints: 50, winner: null });
    expect(board.entries).toMatchObject([
      { applicationId: p.kenji.applicationId, votes: 2, rank: 1, vehicleLabel: "BMW Série 3 E36", pseudo: "Kenji_66" },
      { applicationId: p.lea.applicationId, votes: 1, rank: 2 },
    ]);
    expect(board.entries[0].photoUrl).toContain("test/");
    expect((await call(null, "GET", `/events/${eventId}/audience-prize`)).status).toBe(401);

    // Fin de l'événement : vote clos.
    clock.set(ENDS);
    const closed = await vote(p.kenji.u, p.lea.applicationId);
    expect(closed.status).toBe(409);
    expect(closed.json.error.code).toBe("vote_closed");
  });

  it("150 pointés (cas terrain) : la grille du vote les liste tous, par pages, sans voix ; le classement reste limité à 100", async () => {
    const at = paris(10, 17, 19);
    for (let i = 0; i < 150; i++) {
      const vehicle = await createVehicle(p.marc.u.id, ref);
      const [app] = await db
        .insert(applications)
        .values({
          eventId,
          userId: p.marc.u.id,
          vehicleId: vehicle.id,
          status: "accepted",
          rulesAcceptedAt: at,
          followStructure: false,
        })
        .returning();
      await db
        .insert(checkins)
        .values({ applicationId: app!.id, eventId, method: "scan", checkedInAt: new Date(at.getTime() + i * 1000) });
    }
    await checkin(p.lea, paris(10, 17, 19, 5));
    clock.set(paris(10, 17, 20));
    const url = `/events/${eventId}/audience-prize/candidates`;
    const first = (await call(p.kenji.u, "GET", url)).json;
    const second = (await call(p.kenji.u, "GET", `${url}?cursor=${first.next}`)).json;
    expect(first.items).toHaveLength(100);
    expect(first.next).toBe(100);
    expect(second.items).toHaveLength(51);
    expect(second.next).toBeNull();
    const ids = new Set([...first.items, ...second.items].map((c: { applicationId: string }) => c.applicationId));
    expect(ids.size).toBe(151);
    // Aucune voix dans la grille (pas de fuite du classement) ; le classement garde ses 100 lignes.
    expect(Object.keys(first.items[0]).sort()).toEqual(["applicationId", "photoUrl", "pseudo", "vehicleLabel"]);
    const board = (await call(p.kenji.u, "GET", `/events/${eventId}/audience-prize`)).json;
    expect(board.entries).toHaveLength(100);
    expect(board.vehicles).toBe(151);
    // Voter pour une voiture au-delà de la centième de la grille est possible (la 101e pointée).
    const last = second.items[0].applicationId;
    expect((await vote(p.lea.u, last)).status).toBe(200);
    expect((await call(p.kenji.u, "GET", `${url}?cursor=-1`)).status).toBe(400);
  });

  it("égalité : le premier pointé passe devant", async () => {
    await checkin(p.lea, paris(10, 17, 19, 10));
    await checkin(p.kenji, paris(10, 17, 19, 2));
    await checkin(p.nina, paris(10, 17, 19, 20));
    clock.set(paris(10, 17, 20));
    await vote(p.nina.u, p.lea.applicationId);
    await vote(p.lea.u, p.kenji.applicationId);
    const board = (await call(p.marc.u, "GET", `/events/${eventId}/audience-prize`)).json;
    expect(board.entries.map((e: { applicationId: string; rank: number }) => [e.applicationId, e.rank])).toEqual([
      [p.kenji.applicationId, 1],
      [p.lea.applicationId, 2],
      [p.nina.applicationId, 3],
    ]);
  });

  it("au règlement : gagnant (points, compteur, tampon rare, notification), résultats, rejoué sans doublon", async () => {
    await checkin(p.kenji, paris(10, 17, 19, 2));
    await checkin(p.lea, paris(10, 17, 19, 10));
    await checkin(p.nina, paris(10, 17, 19, 20));
    clock.set(paris(10, 17, 20));
    await vote(p.kenji.u, p.lea.applicationId);
    await vote(p.nina.u, p.lea.applicationId);
    await vote(p.lea.u, p.kenji.applicationId);
    clock.set(SETTLE);
    expect(await pointsService.settleEvent(eventId)).toBe(true);
    const prize = await db.query.pointEntries.findFirst({
      where: and(eq(pointEntries.userId, p.lea.u.id), eq(pointEntries.kind, "audience_prize")),
    });
    expect(prize).toMatchObject({ points: 50, eventId, applicationId: p.lea.applicationId });
    const lea = await db.query.profiles.findFirst({ where: eq(profiles.userId, p.lea.u.id) });
    expect(lea?.pointsSeason).toBe(70); // participation 20 + prix 50
    const vehicle = await db.query.vehicles.findFirst({ where: eq(vehicles.id, p.lea.vehicleId) });
    expect(vehicle?.audiencePrizes).toBe(1);
    expect((await stampsOf(p.lea.u.id)).find((s) => s.kind === "audience_prize")).toMatchObject({ rare: true });
    const won = await db.query.notifications.findFirst({
      where: and(eq(notifications.userId, p.lea.u.id), eq(notifications.type, "audience_prize_won")),
    });
    expect(won?.body).toContain("+50 points");
    const results = await db.query.audiencePrizeResults.findMany({
      where: eq(audiencePrizeResults.eventId, eventId),
    });
    expect(results.map((r) => [r.rank, r.votes, r.winner])).toEqual([
      [1, 2, true],
      [2, 1, false],
    ]);
    const board = (await call(p.marc.u, "GET", `/events/${eventId}/audience-prize`)).json;
    expect(board).toMatchObject({ settled: true, open: false, winner: { applicationId: p.lea.applicationId } });

    await db.update(events).set({ settledAt: null }).where(eq(events.id, eventId));
    await pointsService.settleEvent(eventId);
    expect((await db.query.vehicles.findFirst({ where: eq(vehicles.id, p.lea.vehicleId) }))?.audiencePrizes).toBe(1);
    expect(
      await db.query.pointEntries.findMany({
        where: and(eq(pointEntries.eventId, eventId), eq(pointEntries.kind, "audience_prize")),
      }),
    ).toHaveLength(1);
  });

  it("pas de prix sous trois voix ; points réglables par l'administration", async () => {
    await checkin(p.kenji, paris(10, 17, 19, 2));
    await checkin(p.lea, paris(10, 17, 19, 10));
    clock.set(paris(10, 17, 20));
    await vote(p.kenji.u, p.lea.applicationId);
    await vote(p.lea.u, p.kenji.applicationId);
    clock.set(SETTLE);
    await pointsService.settleEvent(eventId);
    expect(await db.query.pointEntries.findMany({ where: eq(pointEntries.kind, "audience_prize") })).toHaveLength(0);
    expect(
      (await db.query.audiencePrizeResults.findMany({ where: eq(audiencePrizeResults.eventId, eventId) })).some(
        (r) => r.winner,
      ),
    ).toBe(false);

    // Réglage à 80 points (lot 33, `points.audience_prize`).
    await db.insert(platformSettings).values({ key: "points.audience_prize", value: 80 });
    settingsStore.invalidate();
    const other = await createEvent(structureId, { startsAt: paris(11, 7, 19), endsAt: paris(11, 7, 23) });
    clock.set(paris(10, 20, 12));
    const apps = {
      kenji: await enroll(other.id, p.kenji.u, p.kenji.v),
      lea: await enroll(other.id, p.lea.u, p.lea.v),
      nina: await enroll(other.id, p.nina.u, p.nina.v),
    };
    await checkin({ ...p.kenji, ...apps.kenji }, paris(11, 7, 19, 5), other.id);
    await checkin({ ...p.lea, ...apps.lea }, paris(11, 7, 19, 6), other.id);
    await checkin({ ...p.nina, ...apps.nina }, paris(11, 7, 19, 7), other.id);
    clock.set(paris(11, 7, 21));
    expect((await call(p.kenji.u, "GET", `/events/${other.id}/audience-prize`)).json.winnerPoints).toBe(80);
    await vote(p.lea.u, apps.kenji.applicationId, other.id);
    await vote(p.nina.u, apps.kenji.applicationId, other.id);
    await vote(p.kenji.u, apps.lea.applicationId, other.id);
    clock.set(paris(11, 9, 23));
    await pointsService.settleEvent(other.id);
    const prize = await db.query.pointEntries.findFirst({
      where: and(eq(pointEntries.eventId, other.id), eq(pointEntries.kind, "audience_prize")),
    });
    expect(prize).toMatchObject({ userId: p.kenji.u.id, points: 80 });
  });
});

describe("récap", () => {
  it("tâche event.recap planifiée à J+1 10 h, replanifiée quand la date change ; l'ancienne ne fait rien", async () => {
    const e = (await db.query.events.findFirst({ where: eq(events.id, eventId) }))!;
    await scheduleEventJobs(e);
    expect(clock.jobs.jobs.find((j) => j.name === "event.recap")).toMatchObject({
      data: { eventId, at: RECAP.toISOString() },
      startAfter: RECAP,
    });
    const moved = await call(orga, "PATCH", `/events/${eventId}`, {
      startsAt: paris(10, 24, 19).toISOString(),
      endsAt: paris(10, 24, 22, 30).toISOString(),
    });
    expect(moved.status).toBe(200);
    const recaps = clock.jobs.jobs.filter((j) => j.name === "event.recap");
    expect(recaps.at(-1)).toMatchObject({ startAfter: paris(10, 25, 10) });
    await checkin(p.kenji, paris(10, 24, 19, 5));
    clock.set(RECAP);
    expect(await recapService.notifyReady({ eventId, at: RECAP.toISOString() })).toBe(0);
  });

  it("404 sans pointage ; liste des récaps", async () => {
    await checkin(p.kenji, paris(10, 17, 19, 2));
    clock.set(paris(10, 17, 21));
    expect((await call(p.kenji.u, "GET", `/me/recaps/${eventId}`)).status).toBe(404); // pas encore fini
    clock.set(RECAP);
    expect((await call(p.marc.u, "GET", `/me/recaps/${eventId}`)).status).toBe(404);
    const list = (await call(p.kenji.u, "GET", "/me/recaps")).json;
    expect(list).toMatchObject([{ eventId, title: "Béziers Night", readyAt: RECAP.toISOString() }]);
    expect((await call(p.marc.u, "GET", "/me/recaps")).json).toEqual([]);
  });

  it("anonymisation : tampons et voix conservés ; le compte supprimé sort du classement et du prix", async () => {
    await checkin(p.kenji, paris(10, 17, 19, 2));
    await checkin(p.lea, paris(10, 17, 19, 10));
    await checkin(p.nina, paris(10, 17, 19, 20));
    clock.set(paris(10, 17, 20));
    await vote(p.lea.u, p.kenji.applicationId);
    await vote(p.nina.u, p.kenji.applicationId);
    await vote(p.kenji.u, p.lea.applicationId);
    clock.set(paris(10, 18, 12));
    await accountService.anonymize(p.kenji.u.id, null);
    expect(await stampsOf(p.kenji.u.id)).toHaveLength(1);
    expect(await db.query.audienceVotes.findFirst({ where: eq(audienceVotes.voterUserId, p.kenji.u.id) })).toBeTruthy();
    const board = (await call(p.lea.u, "GET", `/events/${eventId}/audience-prize`)).json;
    expect(board.entries.find((e: { applicationId: string }) => e.applicationId === p.kenji.applicationId)).toBe(
      undefined,
    );
    expect(board).toMatchObject({ total: 1, vehicles: 2 });
    clock.set(SETTLE);
    await pointsService.settleEvent(eventId);
    expect(await db.query.pointEntries.findMany({ where: eq(pointEntries.kind, "audience_prize") })).toHaveLength(0);
    expect(await db.query.notifications.findMany({ where: eq(notifications.type, "audience_prize_won") })).toHaveLength(
      0,
    );
  });
});

describe("relecture : accès, robustesse, concurrence", () => {
  it("événement privé : classement, voix et canal refusés à un tiers (403 invite_only), ouverts aux ayants droit", async () => {
    await db.update(events).set({ admission: "invite_only" }).where(eq(events.id, eventId));
    const stranger = await signUp("Inconnu_66");
    for (const path of [`/events/${eventId}/audience-prize`, `/events/${eventId}/audience-prize/mine`]) {
      const r = await call(stranger, "GET", path);
      expect(r.status).toBe(403);
      expect(r.json.error.code).toBe("invite_only");
      expect(r.text).not.toContain("Béziers");
    }
    expect((await vote(stranger, p.kenji.applicationId)).status).toBe(403);
    expect(await audiencePrizeService.canSubscribe(stranger.id, `event:${eventId}:votes`)).toBe(false);
    // Retenu (candidature active) et organisateur : oui.
    expect((await call(p.kenji.u, "GET", `/events/${eventId}/audience-prize`)).status).toBe(200);
    expect(await audiencePrizeService.canSubscribe(p.kenji.u.id, `event:${eventId}:votes`)).toBe(true);
    expect(await audiencePrizeService.canSubscribe(orga.id, `event:${eventId}:votes`)).toBe(true);
  });

  it("vote sur un événement annulé : 409 vote_closed", async () => {
    await checkin(p.kenji, paris(10, 17, 19, 2));
    await checkin(p.lea, paris(10, 17, 19, 10));
    await db.update(events).set({ status: "cancelled" }).where(eq(events.id, eventId));
    clock.set(paris(10, 17, 20));
    const r = await vote(p.kenji.u, p.lea.applicationId);
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe("vote_closed");
  });

  it("deux voix simultanées de la même personne : une seule ligne, la voix tient", async () => {
    await checkin(p.kenji, paris(10, 17, 19, 2));
    await checkin(p.lea, paris(10, 17, 19, 10));
    await checkin(p.nina, paris(10, 17, 19, 20));
    clock.set(paris(10, 17, 20));
    const [a, b] = await Promise.all([vote(p.kenji.u, p.lea.applicationId), vote(p.kenji.u, p.nina.applicationId)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    const rows = await db.query.audienceVotes.findMany({ where: eq(audienceVotes.voterUserId, p.kenji.u.id) });
    expect(rows).toHaveLength(1);
    expect([p.lea.applicationId, p.nina.applicationId]).toContain(rows[0]!.applicationId);
  });

  it("tampon par plaque et par lot hors ligne (heure du scan) ; publié une seule fois, au premier pointage", async () => {
    const ws = listen(`user:${p.kenji.u.id}`);
    clock.set(paris(10, 17, 19, 30));
    const plates = await db.query.vehicles.findFirst({ where: eq(vehicles.id, p.lea.vehicleId) });
    await checkinsService.byPlates(julieV, eventId, [plates!.plate!]);
    expect((await stampsOf(p.lea.u.id)).map((s) => s.kind)).toEqual(["participation"]);
    const [device] = await db.insert(devices).values({ userId: julie.id, platform: "android" }).returning();
    const item = () => ({
      kind: "manual" as const,
      id: randomUUID(),
      applicationId: p.kenji.applicationId,
      note: null,
      scannedAt: paris(10, 17, 19, 5),
    });
    clock.set(paris(10, 17, 19, 40));
    await checkinsService.receiveBatch(julieV, eventId, { deviceId: device!.id, items: [item()] });
    await checkinsService.receiveBatch(julieV, eventId, { deviceId: device!.id, items: [item()] });
    expect(ws.messages.filter((m) => m.type === "passport.stamped")).toHaveLength(1);
    ws.stop();
    expect((await stampsOf(p.kenji.u.id))[0]?.stampedAt).toEqual(paris(10, 17, 19, 5));
  });

  it("une erreur du tampon ne fait jamais échouer le pointage (liste et lot) ; le règlement rattrape", async () => {
    const original = notificationsService.notify.bind(notificationsService);
    const spy = vi
      .spyOn(notificationsService, "notify")
      .mockImplementation((ex, userId, type, input) =>
        type === "stamp_received"
          ? Promise.reject(new Error("panne simulée du tampon"))
          : original(ex, userId, type, input),
      );
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const created = await checkin(p.kenji, paris(10, 17, 19, 2));
      expect(created.created).toBe(true);
      const [device] = await db.insert(devices).values({ userId: julie.id, platform: "android" }).returning();
      const r = await checkinsService.receiveBatch(julieV, eventId, {
        deviceId: device!.id,
        items: [
          {
            kind: "manual",
            id: randomUUID(),
            applicationId: p.lea.applicationId,
            note: null,
            scannedAt: paris(10, 17, 19, 10),
          },
        ],
      });
      expect(r.results[0]).toMatchObject({ result: "accepted" });
      expect(await stampsOf(p.kenji.u.id)).toHaveLength(0);
      expect(await stampsOf(p.lea.u.id)).toHaveLength(0);
    } finally {
      spy.mockRestore();
      quiet.mockRestore();
    }
    expect(await db.query.checkins.findMany({ where: eq(checkins.eventId, eventId) })).toHaveLength(2);
    clock.set(SETTLE);
    await pointsService.settleEvent(eventId);
    expect((await stampsOf(p.kenji.u.id)).map((s) => s.kind)).toContain("participation");
    expect((await stampsOf(p.lea.u.id)).map((s) => s.kind)).toContain("participation");
  });

  it("tâche event.recap : singletonKey recap:<id>:<instant>", async () => {
    const e = (await db.query.events.findFirst({ where: eq(events.id, eventId) }))!;
    await scheduleEventJobs(e);
    expect(clock.jobs.jobs.find((j) => j.name === "event.recap")?.options).toEqual({
      singletonKey: `recap:${eventId}:${RECAP.toISOString()}`,
    });
  });
});

describe("scénario avec l'horloge simulée", () => {
  it("pointage → tampon + WS ; vote → classement ; J+1 10 h → récap projeté ; J+2 → points acquis, gagnant, rare", async () => {
    const ws = listen(`user:${p.lea.u.id}`);
    await checkin(p.kenji, paris(10, 17, 19, 2));
    await checkin(p.lea, paris(10, 17, 19, 10));
    await checkin(p.nina, paris(10, 17, 19, 30));
    expect(ws.messages.filter((m) => m.type === "passport.stamped")).toHaveLength(1);
    ws.stop();

    clock.set(paris(10, 17, 21));
    await vote(p.kenji.u, p.lea.applicationId);
    await vote(p.nina.u, p.lea.applicationId);
    await vote(p.lea.u, p.nina.applicationId);
    expect((await call(p.marc.u, "GET", `/events/${eventId}/audience-prize`)).json.entries[0]).toMatchObject({
      applicationId: p.lea.applicationId,
      votes: 2,
      rank: 1,
    });

    // Dimanche 10:00 : la tâche du récap prévient les trois pointés, une seule fois.
    clock.set(RECAP);
    expect(await recapService.notifyReady({ eventId, at: RECAP.toISOString() })).toBe(3);
    expect(await recapService.notifyReady({ eventId, at: RECAP.toISOString() })).toBe(0);
    const ready = await db.query.notifications.findFirst({
      where: and(eq(notifications.userId, p.lea.u.id), eq(notifications.type, "event_recap_ready")),
    });
    expect(ready).toMatchObject({ title: "Ton récap de Béziers Night est arrivé", family: "event" });
    expect(
      await db.query.notifications.findFirst({
        where: and(eq(notifications.userId, p.marc.u.id), eq(notifications.type, "event_recap_ready")),
      }),
    ).toBeUndefined();

    const projected = (await call(p.lea.u, "GET", `/me/recaps/${eventId}`)).json;
    expect(projected).toMatchObject({
      vehiclesCount: 3,
      myArrival: paris(10, 17, 19, 10).toISOString(),
      myDuration: 200,
      audienceRank: { rank: 1, of: 3, votes: 2, winner: true },
      points: {
        status: "projected",
        total: 70,
        detail: [
          { kind: "participation", points: 20, label: "Présent à un événement" },
          { kind: "audience_prize", points: 50, label: "Prix du public" },
        ],
      },
      nextGradeIn: { grade: "route", points: 30 },
      stamp: {
        kind: "participation",
        shape: "octagon",
        sentence: "Nouveau tampon de nuit dans ton passeport, encre sang et or du 66.",
      },
      reviewDeadline: paris(10, 24, 22, 30).toISOString(),
      reviewApplicationId: p.lea.applicationId,
      photos: [],
    });
    expect(projected.shareText).toBe("J'étais à Béziers Night : 3 véhicules, 1er au prix du public. Sur Orasso.");

    // Lundi 22:30 : règlement de J+2, les points sont acquis, le gagnant a son tampon rare.
    clock.set(SETTLE);
    expect(await pointsService.settleEvent(eventId)).toBe(true);
    const settled = (await call(p.lea.u, "GET", `/me/recaps/${eventId}`)).json;
    expect(settled.points.status).toBe("settled");
    expect(settled.points.total).toBe(70);
    expect(settled.points.detail.map((d: { kind: string }) => d.kind).sort()).toEqual([
      "audience_prize",
      "participation",
    ]);
    expect(settled.nextGradeIn).toEqual({ grade: "route", points: 30 });
    expect(settled.stamp).toMatchObject({ rare: true });
    const kenji = (await call(p.kenji.u, "GET", `/me/recaps/${eventId}`)).json;
    expect(kenji.audienceRank).toMatchObject({ rank: 3, of: 3, votes: 0, winner: false });
  });
});
