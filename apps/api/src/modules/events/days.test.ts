// Événements sur plusieurs jours (lot 26) : route des jours (droits, validation, retour à un jour), modes d'accès,
// capacité et liste d'attente par jour, crew et invitation, tri et compteurs par jour, duplication. Le scénario complet
// du critère de fin est dans `test/scenario-multi-jours.test.ts`.
import { randomUUID } from "node:crypto";
import { fromWallTime } from "@orasso/shared";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  addMember,
  createEvent,
  createStructure,
  createVehicle,
  resetDb,
  seedReference,
  signUp,
  type TestUser,
  useClock,
} from "../../../test/helpers";
import { app } from "../../app";
import { db, pool } from "../../db/client";
import { applications, eventDays, notifications, profiles, structures } from "../../db/schema";
import { notificationsService } from "../notifications/service";

type Mode = "cookie" | "bearer";
const MODES: Mode[] = ["cookie", "bearer"];
const ORIGIN = process.env.PUBLIC_URL ?? "http://localhost:5173";

const paris = (month: number, day: number, hour: number, minute = 0) =>
  fromWallTime({ year: 2027, month, day, hour, minute });

let ref: Awaited<ReturnType<typeof seedReference>>;

beforeAll(async () => {
  await resetDb();
});

beforeEach(async () => {
  await resetDb();
  useClock(paris(3, 1, 10));
  ref = await seedReference();
});

afterAll(async () => {
  await notificationsService.flush();
  await pool.end();
});

const bearerOf = (cookie: string) => {
  const raw = cookie
    .split("; ")
    .find((c) => c.startsWith("better-auth.session_token="))
    ?.slice("better-auth.session_token=".length);
  return raw ? decodeURIComponent(raw) : "";
};

async function req(u: TestUser | null, method: string, path: string, body?: unknown, mode: Mode = "cookie") {
  const res = await app.request(`/api${path}`, {
    method,
    headers: {
      origin: ORIGIN,
      ...(u && mode === "cookie" ? { cookie: u.cookie } : {}),
      ...(u && mode === "bearer" ? { authorization: `Bearer ${bearerOf(u.cookie)}` } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  // biome-ignore lint/suspicious/noExplicitAny: réponses JSON lues librement dans les tests
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

const threeDays = (capacity: (number | null)[] = [null, null, null]) => [
  { date: "2027-03-14", startTime: "09:00", endTime: "18:00", capacity: capacity[0] ?? null },
  { date: "2027-03-15", startTime: "09:00", endTime: "18:00", capacity: capacity[1] ?? null },
  { date: "2027-03-16", startTime: "09:00", endTime: "18:00", capacity: capacity[2] ?? null },
];

async function setup(overrides: Parameters<typeof createEvent>[1] = {}) {
  const owner = await signUp("Damien", { twoFactor: true });
  const structure = await createStructure(owner.id);
  const event = await createEvent(structure.id, {
    startsAt: paris(3, 14, 9),
    endsAt: paris(3, 14, 18),
    capacity: 2,
    ...overrides,
  });
  return { owner, structure, event };
}

async function setDays(
  u: TestUser,
  eventId: string,
  dayAccess: "whole" | "per_day" | "both",
  capacity?: (number | null)[],
  mode: Mode = "cookie",
) {
  const r = await req(u, "PUT", `/events/${eventId}/days`, { dayAccess, days: threeDays(capacity) }, mode);
  expect(r.status).toBe(200);
  return r.json.days as { id: string; date: string; remaining: number | null }[];
}

async function candidate(pseudo: string) {
  const u = await signUp(pseudo);
  const v = await createVehicle(u.id, ref);
  return { u, v };
}

const apply = (c: { u: TestUser; v: { id: string } }, eventId: string, eventDayId?: string | null, mode?: Mode) =>
  req(c.u, "POST", `/events/${eventId}/applications`, { vehicleIds: [c.v.id], rulesAccepted: true, eventDayId }, mode);

describe("route des jours : droits", () => {
  for (const mode of MODES) {
    it(`propriétaire et co-organisateur seulement, double authentification, structure non suspendue (${mode})`, async () => {
      const { owner, structure, event } = await setup();
      const co = await signUp("CoOrga", { twoFactor: true });
      await addMember(structure.id, co.id, "co_organizer");
      const staff = await signUp("Julie");
      await addMember(structure.id, staff.id, "staff", ["scan", "filtering"], true);
      const outsider = await signUp("Paul", { twoFactor: true });
      const body = { dayAccess: "both", days: threeDays() };

      expect((await req(null, "PUT", `/events/${event.id}/days`, body, mode)).status).toBe(401);
      expect((await req(staff, "PUT", `/events/${event.id}/days`, body, mode)).status).toBe(403);
      expect((await req(outsider, "PUT", `/events/${event.id}/days`, body, mode)).status).toBe(403);
      expect((await req(co, "PUT", `/events/${event.id}/days`, body, mode)).status).toBe(200);
      expect((await req(owner, "PUT", `/events/${event.id}/days`, body, mode)).status).toBe(200);

      // Organisateur sans double authentification prouvée : refusé.
      const noTotp = await signUp("SansTotp");
      await addMember(structure.id, noTotp.id, "co_organizer");
      expect((await req(noTotp, "PUT", `/events/${event.id}/days`, body, mode)).status).toBe(403);

      // Structure suspendue : plus d'écriture des jours.
      await db.update(structures).set({ verification: "suspended" }).where(eq(structures.id, structure.id));
      expect((await req(owner, "PUT", `/events/${event.id}/days`, body, mode)).status).toBe(403);
    });
  }

  it("compte suspendu : écriture refusée", async () => {
    const { owner, event } = await setup();
    await db
      .update(profiles)
      .set({ suspendedUntil: paris(3, 20, 0) })
      .where(eq(profiles.userId, owner.id));
    const r = await req(owner, "PUT", `/events/${event.id}/days`, { dayAccess: "both", days: threeDays() });
    expect(r.status).toBe(403);
    expect(r.json.error.code).toBe("suspended");
  });
});

describe("route des jours : validation et retour à un jour", () => {
  it("un seul jour, chevauchement, doublon refusés ; liste vide = un jour, dates gardées", async () => {
    const { owner, event } = await setup();
    const one = await req(owner, "PUT", `/events/${event.id}/days`, { days: threeDays().slice(0, 1) });
    expect(one.status).toBe(400);
    const overlap = await req(owner, "PUT", `/events/${event.id}/days`, {
      days: [
        { date: "2027-03-14", startTime: "20:00", endTime: "10:00" },
        { date: "2027-03-15", startTime: "09:00", endTime: "18:00" },
      ],
    });
    expect(overlap.status).toBe(400);
    const dup = await req(owner, "PUT", `/events/${event.id}/days`, { days: [threeDays()[0], threeDays()[0]] });
    expect(dup.status).toBe(400);

    await setDays(owner, event.id, "per_day");
    const back = await req(owner, "PUT", `/events/${event.id}/days`, { days: [] });
    expect(back.status).toBe(200);
    expect(back.json).toMatchObject({ days: [], dayAccess: "whole" });
    expect(back.json.startsAt).toBe(paris(3, 14, 9).toISOString());
    expect(back.json.endsAt).toBe(paris(3, 16, 18).toISOString());
  });

  it("un jour qui a des candidatures ne se retire pas ; horaires et capacité se modifient", async () => {
    const { owner, event } = await setup();
    const days = await setDays(owner, event.id, "per_day");
    const k = await candidate("Kenji");
    expect((await apply(k, event.id, days[2]?.id)).status).toBe(201);
    const removed = await req(owner, "PUT", `/events/${event.id}/days`, { days: threeDays().slice(0, 2) });
    expect(removed.status).toBe(409);
    expect(removed.json.error.code).toBe("day_in_use");
    expect((await req(owner, "PUT", `/events/${event.id}/days`, { days: [] })).status).toBe(409);
    // Même date, autres horaires et capacité : le jour garde son identifiant (la candidature aussi).
    const moved = await req(owner, "PUT", `/events/${event.id}/days`, {
      days: [...threeDays().slice(0, 2), { date: "2027-03-16", startTime: "10:00", endTime: "17:00", capacity: 5 }],
    });
    expect(moved.status).toBe(200);
    expect(moved.json.days[2]).toMatchObject({ id: days[2]?.id, capacity: 5 });
    expect(moved.json.endsAt).toBe(paris(3, 16, 17).toISOString());
  });

  it("publié : inscrits prévenus d'un changement de jours, rappels replanifiés ; plus rien une fois commencé", async () => {
    const clock = useClock(paris(3, 1, 10));
    const { owner, event } = await setup();
    const days = await setDays(owner, event.id, "both");
    const k = await candidate("Kenji");
    expect((await apply(k, event.id, days[1]?.id)).status).toBe(201);
    const before = clock.jobs.jobs.length;
    const r = await req(owner, "PUT", `/events/${event.id}/days`, {
      days: [...threeDays(), { date: "2027-03-17", startTime: "09:00", endTime: "12:00" }],
    });
    expect(r.status).toBe(200);
    const notes = await db.query.notifications.findMany({
      where: and(eq(notifications.userId, k.u.id), eq(notifications.type, "event_updated")),
    });
    expect(notes).toHaveLength(1);
    expect(clock.jobs.jobs.slice(before).filter((j) => j.name === "event.reminder-eve" && j.data.dayId)).toHaveLength(
      3,
    );
    clock.set(paris(3, 14, 10));
    expect((await req(owner, "PUT", `/events/${event.id}/days`, { days: threeDays() })).status).toBe(423);
  });
});

describe("modes d'accès", () => {
  it("par jour : jour obligatoire ; tout l'événement : pas de jour ; événement d'un jour : jamais de jour", async () => {
    const { owner, event } = await setup();
    const single = await candidate("Single");
    expect((await apply(single, event.id, randomUUID())).status).toBe(400);
    expect((await apply(single, event.id)).status).toBe(201);

    const days = await setDays(owner, event.id, "per_day");
    const k = await candidate("Kenji");
    const missing = await apply(k, event.id);
    expect(missing.status).toBe(400);
    expect(missing.json.error.details.reason).toBe("day_required");
    expect((await apply(k, event.id, days[0]?.id)).status).toBe(201);

    await req(owner, "PATCH", `/events/${event.id}`, { dayAccess: "whole" });
    const l = await candidate("Lea");
    expect((await apply(l, event.id, days[0]?.id)).json.error.details.reason).toBe("day_not_allowed");
    expect((await apply(l, event.id)).status).toBe(201);
  });

  it("limite de véhicules : un même véhicule sur deux jours compte une fois", async () => {
    const { owner, event } = await setup({ capacity: null, maxVehiclesPerUser: 1 });
    const days = await setDays(owner, event.id, "per_day");
    const k = await candidate("Kenji");
    expect((await apply(k, event.id, days[0]?.id)).status).toBe(201);
    expect((await apply(k, event.id, days[1]?.id)).status).toBe(201);
    const other = await createVehicle(k.u.id, ref);
    const r = await req(k.u, "POST", `/events/${event.id}/applications`, {
      vehicleIds: [other.id],
      rulesAccepted: true,
      eventDayId: days[2]?.id,
    });
    expect(r.status).toBe(409);
  });
});

describe("capacité et liste d'attente par jour", () => {
  it("capacité propre d'un jour ; « tout l'événement » attend une place chaque jour ; jour agrandi → offre", async () => {
    const { owner, event } = await setup({ capacity: 1, admission: "open" });
    // Jour 2 : 2 places ; les autres : la capacité de l'événement (1).
    const days = await setDays(owner, event.id, "both", [null, 2, null]);
    const a = await candidate("Alice");
    const b = await candidate("Bruno");
    const w = await candidate("Whole");
    // Admission libre : retenue d'office s'il reste une place le jour choisi.
    expect((await apply(a, event.id, days[0]?.id)).json[0].status).toBe("accepted");
    expect((await apply(b, event.id, days[1]?.id)).json[0].status).toBe("accepted");
    // Tout l'événement : jour 1 complet → liste d'attente (même si les jours 2 et 3 ont de la place).
    const whole = await apply(w, event.id);
    expect(whole.json[0].status).toBe("waitlisted");
    const page = await req(null, "GET", `/events/by-slug/${event.slug}`);
    expect(page.json.days.map((d: { remaining: number }) => d.remaining)).toEqual([0, 1, 1]);
    expect(page.json.remaining).toBe(1);
    // Jour 1 agrandi à 2 places : la place offerte à « tout l'événement » (libre chaque jour).
    await setDays(owner, event.id, "both", [2, 2, null]);
    const card = await req(w.u, "GET", `/applications/${whole.json[0].id}`);
    expect(card.json.status).toBe("offered");
  });

  it("offre par jour : une place du jour 2 va au premier de la liste qui vise le jour 2", async () => {
    const { owner, event } = await setup({ capacity: 1, admission: "open" });
    const days = await setDays(owner, event.id, "per_day");
    const [a, b, c, d] = await Promise.all(["A1", "B2", "C1", "D2"].map(candidate));
    expect((await apply(a!, event.id, days[0]?.id)).json[0].status).toBe("accepted");
    const bApp = await apply(b!, event.id, days[1]?.id);
    expect(bApp.json[0].status).toBe("accepted");
    const cApp = await apply(c!, event.id, days[0]?.id);
    const dApp = await apply(d!, event.id, days[1]?.id);
    expect([cApp.json[0].status, dApp.json[0].status]).toEqual(["waitlisted", "waitlisted"]);
    // D est 1er de la file du jour 2 (C, devant lui, vise le jour 1).
    expect(dApp.json[0].waitlistRank).toBe(1);
    await req(b!.u, "POST", `/applications/${bApp.json[0].id}/withdraw`);
    expect((await req(d!.u, "GET", `/applications/${dApp.json[0].id}`)).json.status).toBe("offered");
    expect((await req(c!.u, "GET", `/applications/${cApp.json[0].id}`)).json.status).toBe("waitlisted");
  });
});

describe("tri, compteurs et accès par jour", () => {
  for (const mode of MODES) {
    it(`filtre du tri par jour, compteurs d'un jour, jour d'un autre événement introuvable (${mode})`, async () => {
      const { owner, structure, event } = await setup({ capacity: 3 });
      const days = await setDays(owner, event.id, "both", undefined, mode);
      const other = await createEvent(structure.id, { startsAt: paris(4, 1, 9), endsAt: paris(4, 1, 18) });
      const otherDays = await setDays(owner, other.id, "both", undefined, mode);
      const [a, b] = await Promise.all(["Alice", "Bruno"].map(candidate));
      await apply(a!, event.id, null, mode);
      await apply(b!, event.id, days[1]?.id, mode);
      const list = await req(owner, "GET", `/events/${event.id}/applications?dayId=${days[1]?.id}`, undefined, mode);
      expect(list.json.items.map((i: { day: { date: string } | null }) => i.day?.date)).toEqual(["2027-03-15"]);
      const whole = await req(owner, "GET", `/events/${event.id}/applications?dayId=whole`, undefined, mode);
      expect(whole.json.items).toHaveLength(1);
      expect(whole.json.items[0].day).toBeNull();
      const counters = await req(owner, "GET", `/events/${event.id}/counters?dayId=${days[1]?.id}`, undefined, mode);
      expect(counters.json).toMatchObject({ pending: 2 });
      const counters1 = await req(owner, "GET", `/events/${event.id}/counters?dayId=${days[0]?.id}`, undefined, mode);
      expect(counters1.json).toMatchObject({ pending: 1 });
      expect(
        (await req(owner, "GET", `/events/${event.id}/counters?dayId=${otherDays[0]?.id}`, undefined, mode)).status,
      ).toBe(404);
      // Candidater avec le jour d'un autre événement.
      const c = await candidate("Chloe");
      expect((await apply(c, event.id, otherDays[0]?.id, mode)).status).toBe(400);
      // Accès : le jour sur la carte.
      const mine = await req(b!.u, "GET", "/me/applications", undefined, mode);
      expect(mine.json[0].day).toMatchObject({ date: "2027-03-15" });
    });
  }
});

describe("crew et invitation : le jour choisi", () => {
  it("inscription en crew : le jour du chef pour tout le crew ; invitation : le jour de l'invité", async () => {
    const { owner, event } = await setup({ capacity: 10 });
    const days = await setDays(owner, event.id, "per_day");
    const kenji = await signUp("Kenji");
    const lea = await signUp("Lea");
    const [vk, vl] = await Promise.all([kenji, lea].map((u) => createVehicle(u.id, ref)));
    const crew = await req(kenji, "POST", "/crews", { name: "Crew des jours", department: "66" });
    expect(crew.status).toBe(201);
    expect((await req(lea, "POST", `/crews/${crew.json.id}/requests`, { message: null })).status).toBe(201);
    expect((await req(kenji, "POST", `/crews/${crew.json.id}/requests/${lea.id}/accept`)).status).toBe(204);
    const body = {
      crewId: crew.json.id,
      members: [
        { userId: kenji.id, vehicleId: vk!.id },
        { userId: lea.id, vehicleId: vl!.id },
      ],
      rulesAccepted: true,
    };
    expect((await req(kenji, "POST", `/events/${event.id}/crew-applications`, body)).status).toBe(400);
    const reg = await req(kenji, "POST", `/events/${event.id}/crew-applications`, { ...body, eventDayId: days[1]?.id });
    expect(reg.status).toBe(201);
    const rows = await db.query.applications.findMany({ where: eq(applications.eventId, event.id) });
    expect(rows.map((r) => r.eventDayId)).toEqual([days[1]?.id, days[1]?.id]);

    const nina = await signUp("Nina");
    const vn = await createVehicle(nina.id, ref);
    expect((await req(owner, "POST", `/events/${event.id}/invitations`, { vehicleIds: [vn.id] })).status).toBe(201);
    const inv = (await req(nina, "GET", "/me/event-invitations")).json[0];
    expect((await req(nina, "POST", `/event-invitations/${inv.id}/accept`, {})).status).toBe(400);
    const ok = await req(nina, "POST", `/event-invitations/${inv.id}/accept`, { eventDayId: days[2]?.id });
    expect(ok.status).toBe(200);
    const row = await db.query.applications.findFirst({ where: eq(applications.id, ok.json.applicationId) });
    expect(row).toMatchObject({ status: "accepted", eventDayId: days[2]?.id });
  });
});

describe("duplication", () => {
  it("la copie garde ses jours, décalés d'un an (même jour de la semaine, mêmes heures)", async () => {
    const { owner, event } = await setup();
    await setDays(owner, event.id, "both", [null, 3, null]);
    const copy = await req(owner, "POST", `/events/${event.id}/duplicate`);
    expect(copy.status).toBe(201);
    expect(copy.json.days.map((d: { date: string }) => d.date)).toEqual(["2028-03-12", "2028-03-13", "2028-03-14"]);
    expect(copy.json.days[1].capacity).toBe(3);
    expect(copy.json.dayAccess).toBe("both");
    const rows = await db.query.eventDays.findMany({ where: eq(eventDays.eventId, copy.json.id) });
    expect(rows).toHaveLength(3);
    expect(copy.json.startsAt).toBe(fromWallTime({ year: 2028, month: 3, day: 12, hour: 9, minute: 0 }).toISOString());
  });
});
