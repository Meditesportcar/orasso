// Points et malus à J+2, contestation, grades et saisons (ARCHITECTURE.md § 2.6), horloge simulée.
import { type Decide, fromWallTime, HOUR } from "@orasso/shared";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

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
import { events, malusContests, notifications, pointEntries, profiles } from "../../db/schema";
import type { Viewer } from "../../lib/session";
import { applicationsService } from "../applications/service";
import { checkinsService } from "../checkins/service";
import { eventsService } from "../events/service";
import { notificationsService } from "../notifications/service";
import { staffService } from "../staff/service";
import { pointsService } from "./service";

afterAll(async () => {
  await notificationsService.flush();
  await pool.end();
});

const paris = (month: number, day: number, hour: number, minute = 0, year = 2026) =>
  fromWallTime({ year, month, day, hour, minute });

// Salon le samedi 17 octobre 2026, 10:00–18:00 (verrouillé à 08:00) ; règlement le lundi 19 à 18:00.
const STARTS = paris(10, 17, 10);
const ENDS = paris(10, 17, 18);
const SETTLE = paris(10, 19, 18);
const ACCEPT: Decide = { decision: "accept", sendReasons: true, note: null };

let clock: ReturnType<typeof useClock>;
let orga: TestUser;
let orgaV: Viewer;
let julie: TestUser;
let julieV: Viewer;
let eventId: string;
/** present : scanné · absent : retenu sans entrée · late : désisté après verrouillage · early : désisté avant. */
let p: Record<"present" | "absent" | "late" | "early", { u: TestUser; v: Viewer; applicationId: string }>;

async function points(userId: string) {
  return (await db.query.profiles.findFirst({ where: eq(profiles.userId, userId) }))!;
}

beforeEach(async () => {
  await resetDb();
  clock = useClock(paris(10, 10, 12));
  const ref = await seedReference();
  orga = await signUp("Damien_66", { twoFactor: true });
  orgaV = await viewerOf(orga);
  const structureId = (await createStructure(orga.id)).id;
  julie = await signUp("Julie_66");
  await addMember(structureId, julie.id, "staff", ["scan"]);
  julieV = await viewerOf(julie);
  eventId = (await createEvent(structureId, { startsAt: STARTS, endsAt: ENDS, capacity: 10 })).id;
  const entries: [keyof typeof p, string][] = [
    ["present", "Kenji_66"],
    ["absent", "Lea_11"],
    ["late", "Nina_34"],
    ["early", "Marc_66"],
  ];
  p = {} as typeof p;
  for (const [key, pseudo] of entries) {
    const u = await signUp(pseudo);
    const v = await viewerOf(u);
    const vehicle = await createVehicle(u.id, ref);
    const [app] = await applicationsService.apply(v, eventId, {
      vehicleIds: [vehicle.id],
      rulesAccepted: true,
      followStructure: true,
      newsletterOptIn: false,
      companions: 0,
      message: null,
    });
    await applicationsService.decide(orgaV, eventId, app!.id, ACCEPT);
    p[key] = { u, v, applicationId: app!.id };
  }
  // Désistement la veille (sans malus), puis le jour même après le verrouillage (malus).
  clock.set(paris(10, 16, 12));
  await applicationsService.withdraw(p.early.v, p.early.applicationId);
  await staffService.setPresence(julieV, eventId, true);
  clock.set(paris(10, 17, 9));
  await applicationsService.withdraw(p.late.v, p.late.applicationId);
  // Kenji est pointé par la liste (« entré sans scan »).
  await checkinsService.create(julieV, eventId, {
    applicationId: p.present.applicationId,
    method: "manual",
    note: null,
  });
});

describe("règlement de J+2", () => {
  it("« pointage en attente » puis points, malus et points staff ; idempotent", async () => {
    clock.set(paris(10, 18, 9));
    const card = (await call(p.absent.u, "GET", "/me/applications?scope=past")).json[0];
    expect(card).toMatchObject({ pointsPending: true, points: null, malus: null });
    expect(await pointsService.settleEvent(eventId)).toBe(false); // trop tôt
    expect(clock.jobs.jobs).toMatchObject([{ name: "event.settle", startAfter: SETTLE }]);

    clock.set(SETTLE);
    expect(await pointsService.settleEvent(eventId)).toBe(true);
    expect((await points(p.present.u.id)).pointsSeason).toBe(20);
    expect((await points(p.absent.u.id)).pointsSeason).toBe(-10);
    expect((await points(p.late.u.id)).pointsSeason).toBe(-10);
    expect((await points(p.early.u.id)).pointsSeason).toBe(0);
    expect((await points(julie.id)).pointsSeason).toBe(20);
    const malus = await db.query.notifications.findFirst({
      where: and(eq(notifications.userId, p.absent.u.id), eq(notifications.type, "malus_applied")),
    });
    expect(malus?.body).toContain("Contestable jusqu'au");

    // Rejoué (tâche + balayage) : rien de plus.
    expect(await pointsService.settleEvent(eventId)).toBe(false);
    await db.update(events).set({ settledAt: null }).where(eq(events.id, eventId));
    expect(await pointsService.settleEvent(eventId)).toBe(true);
    expect((await db.query.pointEntries.findMany()).length).toBe(4);
    expect((await points(p.present.u.id)).pointsSeason).toBe(20);

    const after = (await call(p.absent.u, "GET", "/me/applications?scope=past")).json[0];
    expect(after).toMatchObject({
      pointsPending: false,
      points: -10,
      malus: { canContest: true, contestStatus: null },
    });
    const mine = (await call(p.present.u, "GET", "/me/points")).json;
    expect(mine).toMatchObject({ pointsSeason: 20, grade: "rodage", next: { grade: "route", threshold: 100 } });
    // Fiche de tri d'un prochain événement : une absence.
    const triage = (await call(orga, "GET", `/events/${eventId}/applications?status=accepted`)).json.items;
    expect(triage.find((x: { id: string }) => x.id === p.absent.applicationId).applicant.absencesCount).toBe(1);
  });

  it("événement annulé : aucun point ni malus", async () => {
    clock.set(paris(10, 17, 9, 30));
    await eventsService.cancel(orgaV, eventId);
    clock.set(SETTLE);
    expect(await pointsService.settleEvent(eventId)).toBe(false);
    expect(await db.query.pointEntries.findMany()).toHaveLength(0);
  });

  it("le grade change avec les points (notification)", async () => {
    await db.update(profiles).set({ pointsSeason: 90 }).where(eq(profiles.userId, p.present.u.id));
    await pointsService.adjust(
      await viewerOf(await signUp("Admin", { twoFactor: true, role: "super_admin" })),
      p.present.u.id,
      90,
      "Reprise",
    );
    clock.set(SETTLE);
    await pointsService.settleEvent(eventId);
    const profile = await points(p.present.u.id);
    expect(profile).toMatchObject({ pointsSeason: 110, grade: "route" });
    const n = await db.query.notifications.findMany({
      where: and(eq(notifications.userId, p.present.u.id), eq(notifications.type, "grade_changed")),
    });
    expect(n).toHaveLength(1);
  });
});

describe("contestation d'un malus", () => {
  beforeEach(async () => {
    clock.set(SETTLE);
    await pointsService.settleEvent(eventId);
  });

  it("dans le délai, une seule fois ; l'organisateur accepte : malus annulé, présence pointée", async () => {
    clock.set(new Date(SETTLE.getTime() + 6 * 24 * HOUR));
    const res = await call(p.absent.u, "POST", `/applications/${p.absent.applicationId}/malus-contest`, {
      message: "Crevaison sur la D81, prévenu par téléphone.",
    });
    expect(res.status).toBe(201);
    expect(res.json.status).toBe("pending");
    expect(clock.jobs.jobs.some((j) => j.name === "contest.escalate")).toBe(true);
    const again = await call(p.absent.u, "POST", `/applications/${p.absent.applicationId}/malus-contest`, {
      message: "Encore",
    });
    expect(again.status).toBe(409);

    const list = (await call(orga, "GET", `/events/${eventId}/malus-contests`)).json;
    expect(list).toHaveLength(1);
    const decided = await call(orga, "POST", `/malus-contests/${list[0].id}/decide`, {
      decision: "accept",
      note: "Prévenu avant",
      checkin: true,
    });
    expect(decided.status).toBe(200);
    expect(decided.json).toMatchObject({ status: "accepted", checkedIn: true });
    expect((await points(p.absent.u.id)).pointsSeason).toBe(0);
    const card = (await call(p.absent.u, "GET", "/me/applications?scope=past")).json[0];
    expect(card).toMatchObject({ points: 0, malus: { contestStatus: "accepted", canContest: false } });
    // Déjà tranchée.
    expect(
      (await call(orga, "POST", `/malus-contests/${list[0].id}/decide`, { decision: "reject", note: null })).status,
    ).toBe(409);
  });

  it("hors délai : refusée ; refus de l'organisateur : malus maintenu", async () => {
    clock.set(new Date(SETTLE.getTime() + 7 * 24 * HOUR + 1000));
    const late = await call(p.absent.u, "POST", `/applications/${p.absent.applicationId}/malus-contest`, {
      message: "Trop tard",
    });
    expect(late.status).toBe(423);
    const res = await call(p.late.u, "POST", `/applications/${p.late.applicationId}/malus-contest`, { message: "?" });
    expect(res.status).toBe(423);
    // Un autre passionné ne conteste pas le malus d'un autre.
    clock.set(new Date(SETTLE.getTime() + HOUR));
    expect(
      (await call(p.present.u, "POST", `/applications/${p.absent.applicationId}/malus-contest`, { message: "x" }))
        .status,
    ).toBe(404);
    const ok = await call(p.late.u, "POST", `/applications/${p.late.applicationId}/malus-contest`, {
      message: "Panne",
    });
    const rejected = await call(orga, "POST", `/malus-contests/${ok.json.id}/decide`, {
      decision: "reject",
      note: "Désistement à 9 h, trop tard",
    });
    expect(rejected.json.status).toBe("rejected");
    expect((await points(p.late.u.id)).pointsSeason).toBe(-10);
  });

  it("sans réponse en 7 jours : transmise à l'administration, qui tranche", async () => {
    clock.set(new Date(SETTLE.getTime() + HOUR));
    const res = await call(p.absent.u, "POST", `/applications/${p.absent.applicationId}/malus-contest`, {
      message: "Malade",
    });
    expect(await pointsService.escalateContest(res.json.id)).toBe(false); // trop tôt
    clock.advance(7 * 24 * HOUR);
    expect(await pointsService.escalateContest(res.json.id)).toBe(true);
    const row = await db.query.malusContests.findFirst({ where: eq(malusContests.id, res.json.id) });
    expect(row?.status).toBe("escalated");
    expect(
      (await call(orga, "POST", `/malus-contests/${res.json.id}/decide`, { decision: "accept", note: null })).status,
    ).toBe(409);
    const admin = await signUp("Equipe", { twoFactor: true, role: "super_admin" });
    expect((await call(admin, "GET", "/admin/malus-contests")).json).toHaveLength(1);
    const decided = await call(admin, "POST", `/admin/malus-contests/${res.json.id}/decide`, {
      decision: "accept",
      note: "Certificat reçu",
    });
    expect(decided.json.status).toBe("accepted");
    expect((await points(p.absent.u.id)).pointsSeason).toBe(0);
  });
});

describe("fin de saison", () => {
  it("on descend d'un grade et on continue", async () => {
    const admin = await viewerOf(await signUp("Equipe", { twoFactor: true, role: "super_admin" }));
    await pointsService.adjust(admin, p.present.u.id, 340, "Saison 2026");
    expect(await points(p.present.u.id)).toMatchObject({ pointsSeason: 340, grade: "sport" });
    clock.set(paris(1, 1, 0, 10, 2027));
    expect(await pointsService.rolloverSeason()).toBe(true);
    expect(await points(p.present.u.id)).toMatchObject({ pointsSeason: 100, grade: "route" });
    expect(await pointsService.rolloverSeason()).toBe(false);
    const carry = await db.query.pointEntries.findMany({
      where: and(eq(pointEntries.userId, p.present.u.id), eq(pointEntries.kind, "season_carryover")),
    });
    expect(carry.map((c) => c.points)).toEqual([100]);
  });
});
