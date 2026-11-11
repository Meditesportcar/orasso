// Lot R8n1 : « avoir une place » (`modules/events/place.ts`, écrit par R8a1) : chaque statut de candidature et de billet.
import { fromWallTime } from "@orasso/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createEvent, resetDb, seedReference, signUp, useClock } from "../../../test/helpers";
import { db, pool } from "../../db/client";
import { profiles } from "../../db/schema";
import { eventPlaceHolderIds, hasPlace } from "../events/place";
import { apply, organizerWithEvent, ticket } from "./testkit";

afterAll(async () => {
  await pool.end();
});

let ref: Awaited<ReturnType<typeof seedReference>>;
let eventId: string;
let otherEventId: string;

beforeEach(async () => {
  await resetDb();
  const clock = useClock(fromWallTime({ year: 2026, month: 11, day: 10, hour: 15, minute: 0 }));
  ref = await seedReference();
  const { event, structure } = await organizerWithEvent(new Date(clock.now.getTime() + 8 * 86_400_000));
  eventId = event.id;
  otherEventId = (await createEvent(structure.id, { startsAt: new Date(clock.now.getTime() + 9 * 86_400_000) })).id;
});

describe("une place, c'est une candidature active ou un billet valable", () => {
  it.each([
    ["pending", true],
    ["accepted", true],
    ["waitlisted", true],
    ["offered", true],
    ["awaiting_member", true],
    ["refused", false],
    ["withdrawn", false],
    ["expired", false],
    ["cancelled", false],
  ] as const)("candidature « %s » : place = %s", async (status, expected) => {
    const u = await signUp("Passionne");
    await apply(u, eventId, ref, status);
    expect(await hasPlace(db, eventId, u.id)).toBe(expected);
    expect(await eventPlaceHolderIds(db, eventId)).toEqual(expected ? [u.id] : []);
  });

  it.each([
    ["valid", true],
    ["used", false],
    ["cancelled", false],
  ] as const)("billet « %s » : place = %s", async (status, expected) => {
    const u = await signUp("Visiteur");
    await ticket(u, eventId, status);
    expect(await hasPlace(db, eventId, u.id)).toBe(expected);
    expect(await eventPlaceHolderIds(db, eventId)).toEqual(expected ? [u.id] : []);
  });

  it("une place à un autre événement n'en est pas une ici", async () => {
    const u = await signUp("Passionne");
    await apply(u, otherEventId, ref, "accepted");
    expect(await hasPlace(db, eventId, u.id)).toBe(false);
    expect(await hasPlace(db, otherEventId, u.id)).toBe(true);
  });

  it("candidature et billet ensemble : une seule fois dans la liste", async () => {
    const u = await signUp("Les2");
    await apply(u, eventId, ref, "accepted");
    await ticket(u, eventId, "valid");
    expect(await eventPlaceHolderIds(db, eventId)).toEqual([u.id]);
  });

  it("un compte supprimé n'a plus de place ni n'est dans la liste", async () => {
    const u = await signUp("Parti");
    await apply(u, eventId, ref, "accepted");
    await db.update(profiles).set({ deletedAt: new Date() }).where(eq(profiles.userId, u.id));
    expect(await hasPlace(db, eventId, u.id)).toBe(false);
    expect(await eventPlaceHolderIds(db, eventId)).toEqual([]);
  });
});
