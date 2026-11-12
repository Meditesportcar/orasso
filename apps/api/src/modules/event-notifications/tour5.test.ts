// Lot R8n1, tour 5 : la liste interne du résumé ne part pas dans le push, et le dédoublonnage remonte jusqu'au curseur.
import { DAY, fromWallTime, HOUR } from "@orasso/shared";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";

import {
  call,
  createEvent,
  quietHours,
  resetDb,
  seedReference,
  signUp,
  type TestUser,
  useClock,
} from "../../../test/helpers";
import { db, pool } from "../../db/client";
import { notifications } from "../../db/schema";
import { push } from "../../lib/push";
import { notificationsService } from "../notifications/service";
import { eventNewsDigest } from "./digest";
import { apply, organizerPost, organizerWithEvent, setPrefs } from "./testkit";

afterAll(async () => {
  await pool.end();
});

const AT = fromWallTime({ year: 2026, month: 11, day: 10, hour: 18, minute: 0 });
const MIN = 60_000;

let ref: Awaited<ReturnType<typeof seedReference>>;
let owner: TestUser;
let structureId: string;
let eventId: string;
let sent: MockInstance<typeof push.send>;

beforeEach(async () => {
  await resetDb();
  quietHours(false);
  useClock(AT);
  ref = await seedReference();
  const made = await organizerWithEvent(new Date(AT.getTime() + 8 * DAY), { title: "Nocturne de Canet" });
  owner = made.owner;
  structureId = made.structure.id;
  eventId = made.event.id;
  await notificationsService.flush();
  sent = vi.spyOn(push, "send").mockResolvedValue(1);
});

afterEach(() => {
  sent.mockRestore();
});

describe("le résumé de nombreux événements", () => {
  it("20 événements aux titres et slugs de longueur maximale : le push reste sous 4 096 octets, sans liste interne", async () => {
    const u = await signUp("Alice");
    const res = await call(u, "POST", "/me/devices", {
      platform: "android",
      expoPushToken: "ExponentPushToken[Alice]",
    });
    expect(res.status).toBeLessThan(300);
    await setPrefs(u, { application: true, event: true, social: true, grade: true });
    for (let i = 0; i < 20; i++) {
      const e = await createEvent(structureId, {
        title: `${i}`.padStart(2, "0") + "T".repeat(118),
        slug: `${i}`.padStart(2, "0") + "s".repeat(78),
        startsAt: new Date(AT.getTime() + (9 + i) * DAY),
      });
      await apply(u, e.id, ref, "accepted");
      await organizerPost(owner, structureId, e.id, new Date(AT.getTime() - HOUR));
    }
    await eventNewsDigest.run(AT);
    await notificationsService.flush();
    await notificationsService.deliverDue();
    const messages = sent.mock.calls.flatMap((c) => c[0] as object[]);
    expect(messages).toHaveLength(1);
    expect(Buffer.byteLength(JSON.stringify(messages[0]))).toBeLessThan(4096);
    const data = (messages[0] as { data: Record<string, unknown> }).data;
    expect(Object.keys(data)).not.toContain("events");
    expect(Object.keys(data)).not.toContain("_events");
    expect(Object.keys(data)).not.toContain("_postIds");
    const list = await call(u, "GET", "/me/notifications");
    expect(list.status).toBe(200);
    expect(JSON.stringify(list.json)).not.toContain('"events"');
    expect(JSON.stringify(list.json)).not.toContain("_events");
    expect(JSON.stringify(list.json)).not.toContain("_postIds");
  });
});

describe("dédoublonnage après une longue absence", () => {
  it("résumé, 4 jours sans passage pour ce compte, publication de l'heure précédant l'ancien résumé : pas reprise", async () => {
    const u = await signUp("Passionne");
    await apply(u, eventId, ref, "accepted");
    await organizerPost(owner, structureId, eventId, new Date(AT.getTime() - 30 * MIN));
    await eventNewsDigest.run(AT);
    await notificationsService.flush();
    // La date de création du résumé suit l'horloge simulée (la base écrit l'heure réelle).
    await db.update(notifications).set({ createdAt: AT }).where(eq(notifications.userId, u.id));
    await eventNewsDigest.run(new Date(AT.getTime() + 4 * DAY));
    await notificationsService.flush();
    const rows = await db.select().from(notifications).where(eq(notifications.type, "event_news_digest"));
    expect(rows.filter((r) => r.userId === u.id)).toHaveLength(1);
  });
});
