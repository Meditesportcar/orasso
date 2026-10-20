// Lot 52 : historique de l'équipe (bulles de l'onglet Équipe). « Événements tenus » = événements publiés de la structure,
// commencés, où le membre n'a pas déclaré son absence ; un événement à venir ne compte pas ; accès réservé aux
// organisateurs de la structure ; routes essayées en cookie ET en porteur.
import { fromWallTime } from "@orasso/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  addMember,
  createEvent,
  createStructure,
  resetDb,
  signUp,
  type TestUser,
  useClock,
} from "../../../test/helpers";
import { app } from "../../app";
import { db, pool } from "../../db/client";
import { eventStaff } from "../../db/schema";
import { notificationsService } from "../notifications/service";

afterAll(async () => {
  await notificationsService.flush();
  await pool.end();
});

const ORIGIN = process.env.PUBLIC_URL ?? "http://localhost:5173";
const paris = (month: number, day: number, hour: number, minute = 0) =>
  fromWallTime({ year: 2026, month, day, hour, minute });

const bearerOf = (cookie: string) => {
  const raw = cookie
    .split("; ")
    .find((c) => c.startsWith("better-auth.session_token="))
    ?.slice("better-auth.session_token=".length);
  return raw ? decodeURIComponent(raw) : "";
};

async function history(u: TestUser, structureId: string, mode: "cookie" | "bearer" = "cookie") {
  const res = await app.request(`/api/structures/${structureId}/team-history`, {
    headers: {
      origin: ORIGIN,
      ...(mode === "cookie" ? { cookie: u.cookie } : { authorization: `Bearer ${bearerOf(u.cookie)}` }),
    },
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

let clock: ReturnType<typeof useClock>;
let orga: TestUser;
let julie: TestUser;
let marc: TestUser;
let structureId: string;
const events: string[] = [];

beforeEach(async () => {
  await resetDb();
  clock = useClock(paris(10, 20, 12));
  orga = await signUp("Damien_66", { twoFactor: true });
  structureId = (await createStructure(orga.id)).id;
  julie = await signUp("Julie_66");
  marc = await signUp("Marc_66");
  await addMember(structureId, julie.id, "staff", ["scan"]);
  await addMember(structureId, marc.id, "staff", ["shop"]);
  events.length = 0;
  // Deux événements passés, un en cours de semaine prochaine (à venir).
  for (const [day, title] of [
    [3, "Passé un"],
    [10, "Passé deux"],
    [30, "À venir"],
  ] as const) {
    const e = await createEvent(structureId, {
      title,
      startsAt: paris(10, day, 10),
      endsAt: paris(10, day, 18),
    });
    events.push(e.id);
  }
});

const put = (eventId: string, userId: string, values: Partial<typeof eventStaff.$inferInsert> = {}) =>
  db.insert(eventStaff).values({ eventId, userId, ...values });

describe("historique de l'équipe", () => {
  it("compte les événements commencés sans absence, pas les événements à venir", async () => {
    await put(events[0] as string, julie.id, { presence: "present" });
    await put(events[1] as string, julie.id, { presence: "unknown" });
    await put(events[2] as string, julie.id, { presence: "present" });
    await put(events[0] as string, marc.id, { presence: "absent" });
    for (const mode of ["cookie", "bearer"] as const) {
      const res = await history(orga, structureId, mode);
      expect(res.status).toBe(200);
      const j = res.json.find((h: { userId: string }) => h.userId === julie.id);
      expect(j.eventsHeld).toBe(2);
      expect(j.events.map((e: { title: string }) => e.title)).toEqual(["Passé deux", "Passé un"]);
      const m = res.json.find((h: { userId: string }) => h.userId === marc.id);
      expect(m.eventsHeld).toBe(0);
      expect(m.events).toHaveLength(1);
      expect(m.events[0].presence).toBe("absent");
    }
  });

  it("les rôles d'un événement priment sur ceux de la structure", async () => {
    await put(events[0] as string, julie.id, { presence: "present", roles: ["placement", "filtering"] });
    await put(events[1] as string, julie.id, { presence: "present" });
    const res = await history(orga, structureId);
    const j = res.json.find((h: { userId: string }) => h.userId === julie.id);
    expect(j.events[0].roles).toEqual(["scan"]);
    expect(j.events[1].roles).toEqual(["placement", "filtering"]);
  });

  it("un membre sans événement tenu a un historique vide", async () => {
    const res = await history(orga, structureId);
    const m = res.json.find((h: { userId: string }) => h.userId === marc.id);
    expect(m).toEqual({ userId: marc.id, eventsHeld: 0, events: [] });
    expect(clock).toBeDefined();
  });

  it("refuse le staff, un inconnu et un visiteur", async () => {
    expect((await history(julie, structureId)).status).toBe(403);
    expect((await history(await signUp("Visiteur_66"), structureId)).status).toBe(403);
    const res = await app.request(`/api/structures/${structureId}/team-history`, { headers: { origin: ORIGIN } });
    expect(res.status).toBe(401);
  });

  it("ne lit rien d'une autre structure", async () => {
    const other = await signUp("Autre_66", { twoFactor: true });
    expect((await history(other, structureId)).status).toBe(403);
    await db.delete(eventStaff).where(eq(eventStaff.userId, julie.id));
  });
});
