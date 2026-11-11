// Lot R8n1, tour 4 (Codex) : publication validée après le curseur, Essentiel urgent d'un événement fini, visibilité du Journal,
// résumé recomposé après une coupure, aperçu égal à l'envoi.
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
import { feedPostPhotos, notifications, profiles, structures } from "../../db/schema";
import { push } from "../../lib/push";
import { notificationsService } from "../notifications/service";
import { eventNewsDigest } from "./digest";
import { apply, muteNews, organizerPost, organizerWithEvent, setPrefs } from "./testkit";

afterAll(async () => {
  await pool.end();
});

const AT = fromWallTime({ year: 2026, month: 11, day: 10, hour: 18, minute: 0 });
const MIN = 60_000;
const coupe = { application: false, event: false, social: false, grade: false };

let ref: Awaited<ReturnType<typeof seedReference>>;
let clock: ReturnType<typeof useClock>;
let owner: TestUser;
let structureId: string;
let eventId: string;
let sent: MockInstance<typeof push.send>;

beforeEach(async () => {
  await resetDb();
  quietHours(false);
  clock = useClock(AT);
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

async function withDevice(pseudo: string) {
  const u = await signUp(pseudo);
  const res = await call(u, "POST", "/me/devices", {
    platform: "android",
    expoPushToken: `ExponentPushToken[${pseudo}]`,
  });
  expect(res.status).toBeLessThan(300);
  return u;
}
const pushes = () => sent.mock.calls.flatMap((c) => c[0] as { body: string; title: string }[]);
const digests = async (u?: TestUser) => {
  await notificationsService.flush();
  const rows = await db.select().from(notifications).where(eq(notifications.type, "event_news_digest"));
  return u ? rows.filter((r) => r.userId === u.id) : rows;
};
const post = (createdAt: Date, id = eventId, over = {}) => organizerPost(owner, structureId, id, createdAt, over);

describe("publication validée après le curseur du résumé", () => {
  it("créée avant le passage mais validée après : reprise au passage suivant, une seule fois", async () => {
    const u = await signUp("Passionne");
    await apply(u, eventId, ref, "accepted");
    const early = await post(new Date(AT.getTime() - 2 * HOUR));
    await eventNewsDigest.run(AT);
    expect((await digests(u))[0]?.title).toBe("1 nouveauté pour tes sorties");
    // Une transaction commencée à 17 h 50 se valide à 18 h 05 : sa date précède le curseur.
    const late = await post(new Date(AT.getTime() - 10 * MIN));
    const day2 = new Date(AT.getTime() + DAY);
    await eventNewsDigest.run(day2);
    const rows = await digests(u);
    expect(rows).toHaveLength(2);
    const second = rows.find((r) => (r.data as { postIds?: string[] }).postIds?.includes(late));
    expect(second?.title).toBe("1 nouveauté pour tes sorties");
    expect((second?.data as { postIds: string[] }).postIds).not.toContain(early);
    // Jour 3 : ni l'une ni l'autre ne reviennent.
    await eventNewsDigest.run(new Date(AT.getTime() + 2 * DAY));
    expect(await digests(u)).toHaveLength(2);
  });
});

describe("Essentiel urgent d'un événement fini", () => {
  it("une Info importante à 23 h, dix jours après la fin : soumise aux heures calmes ; événement en cours : tout de suite", async () => {
    quietHours(true);
    clock.set(fromWallTime({ year: 2026, month: 11, day: 10, hour: 23, minute: 0 }));
    const u = await withDevice("Retenu");
    await apply(u, eventId, ref, "accepted");
    const finished = await createEvent(structureId, {
      startsAt: new Date(clock.now.getTime() - 10 * DAY),
      endsAt: new Date(clock.now.getTime() - 10 * DAY + 4 * HOUR),
    });
    const running = await createEvent(structureId, {
      startsAt: new Date(clock.now.getTime() - 2 * HOUR),
      endsAt: new Date(clock.now.getTime() + 2 * HOUR),
    });
    await apply(u, finished.id, ref, "accepted");
    await apply(u, running.id, ref, "accepted");
    await setPrefs(u, coupe, ["event_important"]);
    sent.mockClear();
    await notificationsService.notifyMany(db, [u.id], "event_important", {
      title: "T",
      body: "C",
      eventId: finished.id,
      eventStartsAt: finished.startsAt,
    });
    await notificationsService.deliverDue();
    expect(pushes()).toHaveLength(0);
    await notificationsService.notifyMany(db, [u.id], "event_important", {
      title: "T",
      body: "C",
      eventId: running.id,
      eventStartsAt: running.startsAt,
    });
    await notificationsService.deliverDue();
    expect(pushes()).toHaveLength(1);
  });
});

describe("visibilité du Journal", () => {
  it("auteur banni ou structure suspendue avant le résumé : pas de nouveauté annoncée", async () => {
    const u = await signUp("Passionne");
    await apply(u, eventId, ref, "accepted");
    await post(new Date(AT.getTime() - HOUR));
    await db
      .update(profiles)
      .set({ bannedAt: new Date(AT.getTime() - 2 * HOUR) })
      .where(eq(profiles.userId, owner.id));
    await eventNewsDigest.run(AT);
    expect(await digests(u)).toHaveLength(0);
  });

  it("structure suspendue : pas de nouveauté annoncée", async () => {
    const u = await signUp("Passionne");
    await apply(u, eventId, ref, "accepted");
    await post(new Date(AT.getTime() - HOUR));
    await db.update(structures).set({ verification: "suspended" }).where(eq(structures.id, structureId));
    await eventNewsDigest.run(AT);
    expect(await digests(u)).toHaveLength(0);
  });

  it("publication sans visuel : non comptée", async () => {
    const u = await signUp("Passionne");
    await apply(u, eventId, ref, "accepted");
    const id = await post(new Date(AT.getTime() - HOUR));
    await db.delete(feedPostPhotos).where(eq(feedPostPhotos.postId, id));
    await eventNewsDigest.run(AT);
    expect(await digests(u)).toHaveLength(0);
  });
});

describe("résumé de plusieurs événements recomposé à la livraison", () => {
  it("deux événements, un seul coupé avant la livraison : le titre, le compteur, le corps et le lien suivent", async () => {
    const u = await withDevice("Alice");
    await setPrefs(u, { application: true, event: true, social: true, grade: true });
    const other = await createEvent(structureId, {
      title: "Sortie du port",
      startsAt: new Date(AT.getTime() + 9 * DAY),
    });
    await apply(u, eventId, ref, "accepted");
    await apply(u, other.id, ref, "accepted");
    await post(new Date(AT.getTime() - HOUR));
    await post(new Date(AT.getTime() - 2 * HOUR));
    await post(new Date(AT.getTime() - HOUR), other.id);
    await eventNewsDigest.run(AT);
    // Le kick() de la préparation peut avoir livré : on repart d'un résumé encore à livrer.
    await notificationsService.flush();
    sent.mockClear();
    await db.update(notifications).set({ deliveredAt: null }).where(eq(notifications.type, "event_news_digest"));
    await muteNews(u, eventId);
    await notificationsService.deliverDue();
    const [push1] = pushes();
    expect(push1?.title).toBe("1 nouveauté pour tes sorties");
    expect(push1?.body).toBe("Sortie du port");
    const [row] = await digests(u);
    expect(row?.title).toBe("1 nouveauté pour tes sorties");
    expect((row?.data as { link?: string }).link).toMatch(/^\/e\//);
  });
});

describe("aperçu égal à l'envoi", () => {
  it("un organisateur qui a aussi une place : ni compté ni prévenu d'un changement de date", async () => {
    const a = await signUp("Alice");
    const b = await signUp("Bruno");
    await apply(a, eventId, ref, "accepted");
    await apply(b, eventId, ref, "accepted");
    await apply(owner, eventId, ref, "accepted");
    const preview = await call(owner, "GET", `/events/${eventId}/notify-preview`);
    expect(preview.json).toEqual({ recipients: 2 });
    const startsAt = new Date(AT.getTime() + 8 * DAY + HOUR);
    const res = await call(owner, "PATCH", `/events/${eventId}`, {
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + 4 * HOUR).toISOString(),
    });
    expect(res.status).toBe(200);
    const rows = await db.select().from(notifications).where(eq(notifications.type, "event_updated"));
    expect(rows.map((r) => r.userId).sort()).toEqual([a.id, b.id].sort());
    expect(rows).toHaveLength(preview.json.recipients);
  });
});
