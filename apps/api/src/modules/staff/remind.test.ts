// Lot 22 : relance à la demande d'un membre du staff (bouton « Relancer » de la casquette Organisateur de l'appli).
// Routes essayées en cookie ET en porteur ; accès (organisateur avec 2FA seulement), délais, jour J, déjà répondu.
import { fromWallTime } from "@orasso/shared";
import { and, eq } from "drizzle-orm";
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
import { eventStaff, notifications } from "../../db/schema";
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

async function req(u: TestUser, method: string, path: string, mode: "cookie" | "bearer" = "cookie") {
  const res = await app.request(`/api${path}`, {
    method,
    headers: {
      origin: ORIGIN,
      ...(mode === "cookie" ? { cookie: u.cookie } : { authorization: `Bearer ${bearerOf(u.cookie)}` }),
    },
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

let clock: ReturnType<typeof useClock>;
let orga: TestUser;
let julie: TestUser;
let theo: TestUser;
let eventId: string;
let structureId: string;

beforeEach(async () => {
  await resetDb();
  clock = useClock(paris(10, 10, 12));
  orga = await signUp("Damien_66", { twoFactor: true });
  structureId = (await createStructure(orga.id)).id;
  julie = await signUp("Julie_66");
  theo = await signUp("Theo_66");
  await addMember(structureId, julie.id, "staff", ["scan"]);
  await addMember(structureId, theo.id, "staff", ["scan"]);
  eventId = (await createEvent(structureId, { startsAt: paris(10, 17, 10), endsAt: paris(10, 17, 18) })).id;
  // Les lignes `event_staff` naissent à la première lecture de la liste.
  await req(orga, "GET", `/events/${eventId}/staff`);
});

const remindedCount = async (userId: string) =>
  (
    await db.query.notifications.findMany({
      where: and(eq(notifications.userId, userId), eq(notifications.type, "staff_presence_reminder")),
    })
  ).length;

describe("relance à la demande du staff", () => {
  it("relance un membre sans réponse (cookie et porteur), au plus une fois par heure", async () => {
    const first = await req(orga, "POST", `/events/${eventId}/staff/${julie.id}/remind`);
    expect(first.status).toBe(200);
    expect(first.json).toEqual({ reminded: true });
    expect(await remindedCount(julie.id)).toBe(1);

    const again = await req(orga, "POST", `/events/${eventId}/staff/${julie.id}/remind`, "bearer");
    expect(again.status).toBe(429);
    expect(await remindedCount(julie.id)).toBe(1);

    clock.set(paris(10, 10, 13, 5));
    const later = await req(orga, "POST", `/events/${eventId}/staff/${julie.id}/remind`, "bearer");
    expect(later.status).toBe(200);
    expect(await remindedCount(julie.id)).toBe(2);

    const staff = (await req(orga, "GET", `/events/${eventId}/staff`, "bearer")).json;
    expect(staff.find((m: { pseudo: string }) => m.pseudo === "Julie_66")).toMatchObject({ reminderCount: 2 });
    expect(staff.find((m: { pseudo: string }) => m.pseudo === "Theo_66")).toMatchObject({ reminderCount: 0 });
  });

  it("refuse le staff simple, un inconnu et un organisateur sans la preuve de la 2FA", async () => {
    for (const mode of ["cookie", "bearer"] as const) {
      expect((await req(julie, "POST", `/events/${eventId}/staff/${theo.id}/remind`, mode)).status).toBe(403);
    }
    const stranger = await signUp("Marc_11");
    expect((await req(stranger, "POST", `/events/${eventId}/staff/${theo.id}/remind`)).status).toBe(403);
    expect((await req(orga, "POST", `/events/${eventId}/staff/${stranger.id}/remind`)).status).toBe(404);
    expect(await remindedCount(theo.id)).toBe(0);
  });

  it("exige la double authentification prouvée par la session", async () => {
    const paul = await signUp("Paul_66");
    await addMember(structureId, paul.id, "co_organizer");
    for (const mode of ["cookie", "bearer"] as const) {
      const r = await req(paul, "POST", `/events/${eventId}/staff/${theo.id}/remind`, mode);
      expect(r.status).toBe(403);
      expect(r.json.error.code).toBe("two_factor_required");
    }
    expect(await remindedCount(theo.id)).toBe(0);
  });

  it("pas de relance à qui a répondu, ni le jour J", async () => {
    await db.update(eventStaff).set({ presence: "present" }).where(eq(eventStaff.userId, julie.id));
    const answered = await req(orga, "POST", `/events/${eventId}/staff/${julie.id}/remind`);
    expect(answered.status).toBe(409);

    clock.set(paris(10, 17, 7));
    const dayOf = await req(orga, "POST", `/events/${eventId}/staff/${theo.id}/remind`, "bearer");
    expect(dayOf.status).toBe(409);
    expect(await remindedCount(theo.id)).toBe(0);
  });
});
