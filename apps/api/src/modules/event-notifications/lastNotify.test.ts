// Lot R8n2, tour 3 : la réponse de l'organisateur porte l'échéance décidée par l'API pour le dernier changement annoncé
// (`lastNotify`), pour que l'assistant dise « à 8 h » d'après elle et non d'un calcul local.
import { DAY, fromWallTime, HOUR } from "@orasso/shared";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { call, quietHours, resetDb, seedReference, signUp, type TestUser, useClock } from "../../../test/helpers";
import { pool } from "../../db/client";
import { notificationsService } from "../notifications/service";
import { apply, organizerWithEvent } from "./testkit";

afterAll(async () => {
  await pool.end();
});

type View = { lastNotify: { id: string; deferred: boolean } | null; startsAt: string };

let clock: ReturnType<typeof useClock>;
let owner: TestUser;
let eventId: string;
let startsAt: Date;

beforeEach(async () => {
  await resetDb();
  quietHours(true);
  const day = fromWallTime({ year: 2026, month: 11, day: 10, hour: 14, minute: 0 });
  clock = useClock(day);
  const ref = await seedReference();
  startsAt = new Date(day.getTime() + 10 * DAY);
  const made = await organizerWithEvent(startsAt, { title: "Nocturne de Canet" });
  owner = made.owner;
  eventId = made.event.id;
  await apply(await signUp("Inscrit"), eventId, ref, "accepted");
  await notificationsService.flush();
});

const move = (by: number) =>
  call(owner, "PATCH", `/events/${eventId}`, {
    startsAt: new Date(startsAt.getTime() + by).toISOString(),
    endsAt: new Date(startsAt.getTime() + by + 4 * HOUR).toISOString(),
  });

describe("lastNotify", () => {
  it("de jour : annoncé tout de suite (non différé)", async () => {
    const res = await move(2 * HOUR);
    expect(res.status).toBe(200);
    expect(res.json.lastNotify?.deferred).toBe(false);
  });

  it("la nuit, début lointain : différé (à 8 h) ; la même décision que celle de la notification", async () => {
    clock.set(fromWallTime({ year: 2026, month: 11, day: 10, hour: 23, minute: 0 }));
    const res = await move(2 * HOUR);
    expect(res.status).toBe(200);
    expect(res.json.lastNotify?.deferred).toBe(true);
  });

  it("un changement qui ne prévient personne (titre) ne change pas lastNotify", async () => {
    const first = await move(2 * HOUR);
    const res = await call(owner, "PATCH", `/events/${eventId}`, { title: "Autre titre" });
    expect(res.status).toBe(200);
    expect(res.json.lastNotify?.id).toBe(first.json.lastNotify?.id);
  });
});
