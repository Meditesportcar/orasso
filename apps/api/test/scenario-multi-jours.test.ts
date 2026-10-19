// Critère de fin du lot 26 (événements sur plusieurs jours), par l'API HTTP, horloge simulée : événement de 3 jours
// en accès « au choix », capacité 2 par jour ; A candidate pour tout l'événement, B et C pour le jour 1 (C en liste
// d'attente), D pour le jour 2 ; B se désiste → C reçoit l'offre du jour 1 ; synchro du staff (jour de chaque entrée) ;
// décision de scan hors ligne (« Autre jour », bon jour, tout l'événement puis « déjà entré ») ; direct par jour ;
// rappels de la veille par jour ; un seul verrouillage au premier jour ; règlement unique à la fin du dernier jour + 48 h.
import { randomUUID } from "node:crypto";
import { decideScan, fromWallTime, type LocalAccessEntry } from "@orasso/shared";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db, pool } from "../src/db/client";
import { checkins, devices, notifications, pointEntries } from "../src/db/schema";
import { ed25519Verify } from "../src/lib/signing";
import { applicationsService } from "../src/modules/applications/service";
import { eventJobs } from "../src/modules/events/jobs";
import { notificationsService } from "../src/modules/notifications/service";
import { pointsService } from "../src/modules/points/service";
import {
  addMember,
  call,
  createStructure,
  createVehicle,
  resetDb,
  seedReference,
  signUp,
  type TestUser,
  useClock,
} from "./helpers";

const paris = (month: number, day: number, hour: number, minute = 0) =>
  fromWallTime({ year: 2027, month, day, hour, minute });

let clock: ReturnType<typeof useClock>;
let ref: Awaited<ReturnType<typeof seedReference>>;

beforeAll(async () => {
  await resetDb();
  clock = useClock(paris(3, 1, 10));
  ref = await seedReference();
});

afterAll(async () => {
  await notificationsService.flush();
  await pool.end();
});

const verify = (message: Uint8Array, signature: Uint8Array, publicKey: Uint8Array) =>
  ed25519Verify(Buffer.from(message), Buffer.from(signature), Buffer.from(publicKey));

describe("événement sur plusieurs jours (lot 26)", () => {
  it("capacité et liste d'attente par jour, QR par jour, direct, rappels, verrouillage et règlement uniques", async () => {
    const damien = await signUp("Damien_66", { twoFactor: true });
    const structure = await createStructure(damien.id);
    const julie = await signUp("Julie_66");
    await addMember(structure.id, julie.id, "staff", ["scan"]);
    const created = await call(damien, "POST", `/structures/${structure.id}/events`, {
      title: "Salon de printemps",
      addressLine: "1 quai du Port",
      format: "show",
      startsAt: paris(3, 14, 9).toISOString(),
      endsAt: paris(3, 14, 18).toISOString(),
      city: "Perpignan",
      department: "66",
      admittedVehicleTypes: ["car"],
      capacity: 2,
      admission: "filtered",
      registrationsOpenAt: paris(3, 1, 9).toISOString(),
    });
    expect(created.status).toBe(201);
    const eventId: string = created.json.id;
    expect(created.json.days).toEqual([]);
    expect(created.json.dayAccess).toBe("whole");

    // Trois jours, accès au choix : les dates de l'événement deviennent les bornes.
    const put = await call(damien, "PUT", `/events/${eventId}/days`, {
      dayAccess: "both",
      days: [
        { date: "2027-03-16", startTime: "09:00", endTime: "18:00" },
        { date: "2027-03-14", startTime: "09:00", endTime: "18:00" },
        { date: "2027-03-15", startTime: "09:00", endTime: "18:00" },
      ],
    });
    expect(put.status).toBe(200);
    expect(put.json.startsAt).toBe(paris(3, 14, 9).toISOString());
    expect(put.json.endsAt).toBe(paris(3, 16, 18).toISOString());
    expect(put.json.dayAccess).toBe("both");
    const days: { id: string; date: string; remaining: number }[] = put.json.days;
    expect(days.map((d) => d.date)).toEqual(["2027-03-14", "2027-03-15", "2027-03-16"]);
    expect(days.map((d) => d.remaining)).toEqual([2, 2, 2]);
    const [d1, d2, d3] = days as [(typeof days)[0], (typeof days)[0], (typeof days)[0]];
    // Les dates d'un événement sur plusieurs jours se règlent jour par jour.
    const patch = await call(damien, "PATCH", `/events/${eventId}`, { endsAt: paris(3, 17, 18).toISOString() });
    expect(patch.status).toBe(400);

    expect((await call(damien, "POST", `/events/${eventId}/publish`)).status).toBe(200);
    // Un seul verrouillage (premier jour − 2 h) et un seul règlement (fin du dernier jour + 48 h) ; un rappel la veille
    // du premier jour, puis la veille de chaque jour suivant.
    const jobs = clock.jobs.jobs;
    expect(jobs.filter((j) => j.name === "event.lock").map((j) => j.startAfter)).toEqual([paris(3, 14, 7)]);
    expect(jobs.filter((j) => j.name === "event.settle").map((j) => j.startAfter)).toEqual([paris(3, 18, 18)]);
    const eves = jobs.filter((j) => j.name === "event.reminder-eve");
    expect(eves.map((j) => [j.startAfter, j.data.dayId ?? null])).toEqual([
      [paris(3, 13, 18), null],
      [paris(3, 14, 18), d2.id],
      [paris(3, 15, 18), d3.id],
    ]);

    // Candidatures : A tout l'événement, B jour 1, C jour 1, D jour 2.
    clock.set(paris(3, 2, 10));
    const people: Record<string, { u: TestUser; vehicleId: string; appId: string }> = {};
    const apply = async (pseudo: string, eventDayId: string | null) => {
      const u = await signUp(pseudo);
      const vehicle = await createVehicle(u.id, ref);
      const r = await call(u, "POST", `/events/${eventId}/applications`, {
        vehicleIds: [vehicle.id],
        rulesAccepted: true,
        ...(eventDayId ? { eventDayId } : {}),
      });
      expect(r.status).toBe(201);
      expect(r.json[0].day?.id ?? null).toBe(eventDayId);
      people[pseudo] = { u, vehicleId: vehicle.id, appId: r.json[0].id };
      return people[pseudo]!;
    };
    const decide = (appId: string, decision: "accept" | "waitlist") =>
      call(damien, "POST", `/events/${eventId}/applications/${appId}/decide`, { decision });
    const A = await apply("Alice_66", null);
    const B = await apply("Bruno_66", d1.id);
    const C = await apply("Chloe_66", d1.id);
    const D = await apply("David_66", d2.id);
    expect((await decide(A.appId, "accept")).json.status).toBe("accepted");
    expect((await decide(B.appId, "accept")).json.status).toBe("accepted");
    // Jour 1 complet (A compte chaque jour) : C passe par la liste d'attente.
    const full = await decide(C.appId, "accept");
    expect(full.status).toBe(409);
    expect(full.json.error.code).toBe("event_full");
    expect((await decide(C.appId, "waitlist")).json.status).toBe("waitlisted");
    // Jour 2 : A + D = 2, D retenu.
    expect((await decide(D.appId, "accept")).json.status).toBe("accepted");

    // Même véhicule : jour 3 accepté, doublon du jour 1 refusé, « tout l'événement » refusé.
    const b3 = await call(B.u, "POST", `/events/${eventId}/applications`, {
      vehicleIds: [B.vehicleId],
      rulesAccepted: true,
      eventDayId: d3.id,
    });
    expect(b3.status).toBe(201);
    const b1bis = await call(B.u, "POST", `/events/${eventId}/applications`, {
      vehicleIds: [B.vehicleId],
      rulesAccepted: true,
      eventDayId: d1.id,
    });
    expect(b1bis.status).toBe(409);
    const bWhole = await call(B.u, "POST", `/events/${eventId}/applications`, {
      vehicleIds: [B.vehicleId],
      rulesAccepted: true,
    });
    expect(bWhole.status).toBe(409);
    expect((await decide(b3.json[0].id, "accept")).json.status).toBe("accepted");
    // Jour d'un autre événement : refusé.
    const other = await call(A.u, "POST", `/events/${eventId}/applications`, {
      vehicleIds: [(await createVehicle(A.u.id, ref)).id],
      rulesAccepted: true,
      eventDayId: randomUUID(),
    });
    expect(other.status).toBe(400);

    // Places par jour sur la page publique : jour 1 complet, jour 2 complet, jour 3 complet (A + B).
    const page = await call(null, "GET", `/events/by-slug/${created.json.slug}`);
    expect(page.json.days.map((d: { remaining: number }) => d.remaining)).toEqual([0, 0, 0]);

    // B se désiste du jour 1 avant le verrouillage : C reçoit l'offre du jour 1.
    clock.set(paris(3, 5, 10));
    expect((await call(B.u, "POST", `/applications/${B.appId}/withdraw`)).json.status).toBe("withdrawn");
    const cCard = await call(C.u, "GET", `/applications/${C.appId}`);
    expect(cCard.json.status).toBe("offered");
    expect(cCard.json.day).toMatchObject({ id: d1.id, date: "2027-03-14" });
    expect((await call(C.u, "POST", `/applications/${C.appId}/offer/accept`)).json.status).toBe("accepted");

    // Rappels de la veille : premier jour → tout l'événement et jour 1 ; jour 2 → D seulement (une seule fois).
    clock.set(paris(3, 13, 18));
    expect(await eventJobs.reminderEve({ eventId, at: paris(3, 13, 18).toISOString() })).toBe(true);
    clock.set(paris(3, 14, 18));
    expect(await eventJobs.reminderEve({ eventId, at: paris(3, 14, 18).toISOString(), dayId: d2.id })).toBe(true);
    expect(await eventJobs.reminderEve({ eventId, at: paris(3, 14, 18).toISOString(), dayId: d2.id })).toBe(true);
    const eveOf = async (u: TestUser) =>
      (
        await db.query.notifications.findMany({
          where: and(eq(notifications.userId, u.id), eq(notifications.type, "event_reminder_eve")),
        })
      ).map((n) => (n.data as { dayId?: string }).dayId ?? null);
    expect(await eveOf(A.u)).toEqual([null]);
    expect(await eveOf(C.u)).toEqual([null]);
    expect(await eveOf(D.u)).toEqual([d2.id]);
    expect(await eveOf(B.u)).toEqual([]);

    // Verrouillage au premier jour : plus de candidature, même pour le jour 3.
    clock.set(paris(3, 14, 7, 30));
    expect(await applicationsService.lockEvent(eventId)).toBe(true);
    const late = await call(C.u, "POST", `/events/${eventId}/applications`, {
      vehicleIds: [C.vehicleId],
      rulesAccepted: true,
      eventDayId: d3.id,
    });
    expect(late.status).toBe(423);

    // Fenêtre du mode staff : veille du premier jour → fin du dernier jour + 1 jour.
    const mine = (await call(julie, "GET", "/me/staff-events")).json[0];
    expect(mine.staffModeOpensAt).toBe(paris(3, 13, 0).toISOString());
    expect(mine.staffModeClosesAt).toBe(paris(3, 17, 18).toISOString());

    // Synchro du staff : le jour de chaque entrée (null = tout l'événement).
    const sync = (await call(julie, "GET", `/events/${eventId}/staff/sync`)).json;
    expect(sync.event.days.map((d: { date: string }) => d.date)).toEqual(["2027-03-14", "2027-03-15", "2027-03-16"]);
    const byApp = new Map<string, LocalAccessEntry & { applicationId: string }>(
      sync.entries.map((e: LocalAccessEntry & { applicationId: string }) => [e.applicationId, e]),
    );
    expect(byApp.get(A.appId)?.dayDate).toBeNull();
    expect(byApp.get(D.appId)?.dayDate).toBe("2027-03-15");
    expect(byApp.get(C.appId)?.dayDate).toBe("2027-03-14");
    expect(byApp.get(B.appId)?.status).toBe("revoked");

    // Décision de scan hors ligne avec la seule liste synchronisée.
    const keys = new Map<number, Uint8Array>(
      sync.keys.map((k: { kid: number; publicKey: string }) => [
        k.kid,
        new Uint8Array(Buffer.from(k.publicKey, "base64url")),
      ]),
    );
    const payloadOf = async (p: { u: TestUser; appId: string }) =>
      (await call(p.u, "GET", `/applications/${p.appId}/pass`)).json.payload as string;
    const entries = new Map<string, LocalAccessEntry>(
      sync.entries.map((e: LocalAccessEntry) => [e.passId, e] as const),
    );
    const scan = (payload: string, now: Date, list = entries) =>
      decideScan(payload, {
        eventNo: sync.event.eventNo,
        keys,
        verify,
        findEntry: (id) => list.get(id),
        now,
        acceptLegacy: true,
      });
    const dPayload = await payloadOf(D);
    const aPayload = await payloadOf(A);
    expect(scan(dPayload, paris(3, 14, 10))).toMatchObject({
      decision: "refused",
      reason: "other_day",
      dayDate: "2027-03-15",
    });
    expect(scan(dPayload, paris(3, 15, 10))).toMatchObject({ decision: "ok" });
    expect(scan(aPayload, paris(3, 14, 10))).toMatchObject({ decision: "ok" });

    // Jour 1 : A et C entrent (scans envoyés par l'appareil de Julie).
    const [dev] = await db.insert(devices).values({ userId: julie.id, platform: "android", name: "Pixel" }).returning();
    const passOf = (appId: string) => byApp.get(appId)?.passId;
    clock.set(paris(3, 14, 10, 5));
    const day1 = await call(julie, "POST", `/events/${eventId}/scans`, {
      deviceId: dev!.id,
      items: [
        {
          kind: "scan",
          id: randomUUID(),
          passId: passOf(A.appId),
          decision: "ok",
          scannedAt: paris(3, 14, 10).toISOString(),
        },
        {
          kind: "scan",
          id: randomUUID(),
          passId: passOf(C.appId),
          decision: "ok",
          scannedAt: paris(3, 14, 10, 2).toISOString(),
        },
      ],
    });
    expect(day1.json.results.map((r: { result: string }) => r.result)).toEqual(["accepted", "accepted"]);

    // Jour 2 : la liste resynchronisée montre A déjà entré → « déjà entré » (S29), le staff laisse passer.
    clock.set(paris(3, 15, 9, 30));
    const sync2 = (await call(julie, "GET", `/events/${eventId}/staff/sync`)).json;
    const entries2 = new Map<string, LocalAccessEntry>(
      sync2.entries.map((e: LocalAccessEntry) => [e.passId, e] as const),
    );
    expect(scan(aPayload, paris(3, 15, 10), entries2)).toMatchObject({ decision: "already" });
    // Direct du jour 2 : attendus A + D ; A pas encore lu ce jour-là (son entrée date du jour 1).
    const live0 = (await call(damien, "GET", `/events/${eventId}/live?dayId=${d2.id}`)).json;
    expect(live0).toMatchObject({ dayId: d2.id, expected: 2, arrived: 0 });
    clock.set(paris(3, 15, 10, 5));
    const day2 = await call(julie, "POST", `/events/${eventId}/scans`, {
      deviceId: dev!.id,
      items: [
        {
          kind: "scan",
          id: randomUUID(),
          passId: passOf(D.appId),
          decision: "ok",
          scannedAt: paris(3, 15, 10).toISOString(),
        },
        {
          kind: "scan",
          id: randomUUID(),
          passId: passOf(A.appId),
          decision: "already",
          scannedAt: paris(3, 15, 10, 1).toISOString(),
        },
      ],
    });
    expect(day2.json.results.map((r: { result: string }) => r.result)).toEqual(["accepted", "duplicate_same_device"]);
    expect((await call(damien, "GET", `/events/${eventId}/live?dayId=${d2.id}`)).json).toMatchObject({
      expected: 2,
      arrived: 2,
    });
    // Direct d'un jour d'un autre événement : introuvable.
    expect((await call(damien, "GET", `/events/${eventId}/live?dayId=${randomUUID()}`)).status).toBe(404);

    // Règlement unique à la fin du dernier jour + 48 h : A, C et D +20 (A une seule fois malgré deux passages) ;
    // B absent le jour 3 : malus sur cette candidature-là seulement (son désistement du jour 1 était avant le verrou).
    clock.set(paris(3, 18, 17));
    expect(await pointsService.settleEvent(eventId)).toBe(false);
    clock.set(paris(3, 18, 18, 1));
    expect(await pointsService.settleEvent(eventId)).toBe(true);
    expect(await pointsService.settleEvent(eventId)).toBe(false);
    const pts = await db.query.pointEntries.findMany({ where: eq(pointEntries.eventId, eventId) });
    const sum = (u: TestUser) => pts.filter((p) => p.userId === u.id).reduce((s, p) => s + p.points, 0);
    expect(sum(A.u)).toBe(20);
    expect(sum(C.u)).toBe(20);
    expect(sum(D.u)).toBe(20);
    expect(sum(B.u)).toBe(-10);
    expect(pts.filter((p) => p.userId === A.u.id)).toHaveLength(1);

    // Bilan par jour (lot 27 + lot 26) : jour 1 A et C présents ; jour 2 D et A (lu ce jour-là) ; jour 3 personne.
    const report = (await call(damien, "GET", `/events/${eventId}/report`)).json;
    expect(
      report.report.data.byDay.map((d: { date: string; accepted: number; present: number; absent: number }) => [
        d.date,
        d.accepted,
        d.present,
        d.absent,
      ]),
    ).toEqual([
      ["2027-03-14", 2, 2, 0],
      ["2027-03-15", 2, 2, 0],
      ["2027-03-16", 2, 0, 2],
    ]);
  });

  it("pointage par plaque du jour seulement ; désistement après une entrée : la participation reste", async () => {
    clock.set(paris(4, 1, 10));
    const damien = await signUp("Damien_P", { twoFactor: true });
    const structure = await createStructure(damien.id);
    const created = await call(damien, "POST", `/structures/${structure.id}/events`, {
      title: "Salon des plaques",
      addressLine: "1 quai du Port",
      city: "Canet-en-Roussillon",
      format: "show",
      startsAt: paris(4, 10, 9).toISOString(),
      endsAt: paris(4, 10, 18).toISOString(),
      admittedVehicleTypes: ["car"],
      capacity: null,
      admission: "filtered",
      registrationsOpenAt: paris(4, 1, 9).toISOString(),
    });
    const eventId: string = created.json.id;
    const put = await call(damien, "PUT", `/events/${eventId}/days`, {
      dayAccess: "both",
      days: ["2027-04-10", "2027-04-11", "2027-04-12"].map((date) => ({ date, startTime: "09:00", endTime: "18:00" })),
    });
    const [, d2, d3] = put.json.days as { id: string }[];
    expect((await call(damien, "POST", `/events/${eventId}/publish`)).status).toBe(200);
    const accept = async (u: TestUser, vehicleId: string, eventDayId: string | null) => {
      const r = await call(u, "POST", `/events/${eventId}/applications`, {
        vehicleIds: [vehicleId],
        rulesAccepted: true,
        ...(eventDayId ? { eventDayId } : {}),
      });
      expect(r.status).toBe(201);
      const id: string = r.json[0].id;
      expect(
        (await call(damien, "POST", `/events/${eventId}/applications/${id}/decide`, { decision: "accept" })).json
          .status,
      ).toBe("accepted");
      return id;
    };
    // Nina : jour 2 et jour 3 avec la même voiture ; Willy : tout l'événement.
    const nina = await signUp("Nina_P");
    const ninaCar = await createVehicle(nina.id, ref);
    const n2 = await accept(nina, ninaCar.id, d2!.id);
    const n3 = await accept(nina, ninaCar.id, d3!.id);
    const willy = await signUp("Willy_P");
    const willyCar = await createVehicle(willy.id, ref);
    const w = await accept(willy, willyCar.id, null);

    // Jour 1 : Willy pointé par sa plaque. La plaque de Nina n'est attendue ni ce jour-là : rien de pointé.
    clock.set(paris(4, 10, 10));
    const day1 = await call(damien, "POST", `/events/${eventId}/checkins/by-plates`, {
      plates: [willyCar.plate, ninaCar.plate],
    });
    expect(day1.status).toBe(200);
    expect(day1.json.matched.map((m: { applicationId: string }) => m.applicationId)).toEqual([w]);
    expect(day1.json.unmatched).toEqual([]);
    // Jour 2 : la plaque de Nina pointe sa candidature du jour 2, pas celle du jour 3.
    clock.set(paris(4, 11, 10));
    const day2 = await call(damien, "POST", `/events/${eventId}/checkins/by-plates`, { plates: [ninaCar.plate] });
    expect(day2.json.matched.map((m: { applicationId: string }) => m.applicationId)).toEqual([n2]);
    const entries = await db.query.checkins.findMany({ where: eq(checkins.eventId, eventId) });
    expect(entries.map((c) => c.applicationId).sort()).toEqual([n2, w].sort());
    expect(entries.some((c) => c.applicationId === n3)).toBe(false);

    // Willy, entré le jour 1, se désiste le jour 2 (après le verrouillage) : la place des jours suivants se libère,
    // et le règlement lui donne sa participation, pas de malus.
    const withdrawn = await call(willy, "POST", `/applications/${w}/withdraw`);
    expect(withdrawn.json.status).toBe("withdrawn");
    clock.set(paris(4, 14, 18, 1));
    expect(await pointsService.settleEvent(eventId)).toBe(true);
    const pts = await db.query.pointEntries.findMany({ where: eq(pointEntries.eventId, eventId) });
    const of = (appId: string) => pts.filter((p) => p.applicationId === appId).map((p) => p.kind);
    expect(of(w)).toEqual(["participation"]);
    expect(of(n2)).toEqual(["participation"]);
    expect(of(n3)).toEqual(["malus"]);
  });
});
