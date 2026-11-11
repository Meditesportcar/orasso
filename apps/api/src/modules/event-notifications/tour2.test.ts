// Lot R8n1, tour 2 : annulation livrée sans place (vraie annulation), billet scanné, résumé revérifié à la livraison, ligne
// verrouillée, heures calmes de l'Essentiel urgent et du résumé.
import { DAY, fromWallTime, HOUR } from "@orasso/shared";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";

import { call, quietHours, resetDb, seedReference, signUp, type TestUser, useClock } from "../../../test/helpers";
import { db, pool } from "../../db/client";
import { events, notifications } from "../../db/schema";
import { env } from "../../env";
import { push } from "../../lib/push";
import { notificationsService } from "../notifications/service";
import { eventNewsDigest } from "./digest";
import { apply, muteNews, organizerPost, organizerWithEvent, setPrefs, ticket } from "./testkit";

afterAll(async () => {
  await pool.end();
});

const AT = fromWallTime({ year: 2026, month: 11, day: 10, hour: 18, minute: 0 });
const coupe = { application: false, event: false, social: false, grade: false };
const toutActif = { application: true, event: true, social: true, grade: true };

let ref: Awaited<ReturnType<typeof seedReference>>;
let clock: ReturnType<typeof useClock>;
let owner: TestUser;
let structureId: string;
let eventId: string;
let startsAt: Date;
let sent: MockInstance<typeof push.send>;

beforeEach(async () => {
  await resetDb();
  quietHours(false);
  clock = useClock(AT);
  ref = await seedReference();
  startsAt = new Date(AT.getTime() + 8 * DAY);
  const made = await organizerWithEvent(startsAt, { title: "Nocturne de Canet" });
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
const pushed = () => sent.mock.calls.flatMap((c) => c[0] as unknown[]).length;
const digests = async () => {
  await notificationsService.flush();
  return db.select().from(notifications).where(eq(notifications.type, "event_news_digest"));
};
const post = (createdAt: Date) => organizerPost(owner, structureId, eventId, createdAt);

describe("annulation", () => {
  it("la vraie annulation, notifications coupées : livrée au candidat retenu et au porteur de billet", async () => {
    const a = await withDevice("Retenu");
    const v = await withDevice("Visiteur");
    await apply(a, eventId, ref, "accepted");
    await ticket(v, eventId, "valid");
    await setPrefs(a, coupe, ["event_cancelled"]);
    await setPrefs(v, coupe, ["event_cancelled"]);
    sent.mockClear();
    const res = await call(owner, "POST", `/events/${eventId}/cancel`);
    expect(res.status).toBe(200);
    await notificationsService.deliverDue();
    expect(pushed()).toBe(2);
  });
});

describe("heures calmes de l'Essentiel urgent", () => {
  async function at23(
    type: "event_cancelled" | "event_updated" | "event_important" | "event_reminder_eve",
    startsInMs: number,
  ) {
    quietHours(true);
    clock.set(fromWallTime({ year: 2026, month: 11, day: 10, hour: 23, minute: 0 }));
    const u = await withDevice(`Nuit${type}${startsInMs}`);
    await apply(u, eventId, ref, "accepted");
    sent.mockClear();
    await notificationsService.notify(db, u.id, type, {
      title: "T",
      body: "C",
      eventId,
      eventStartsAt: new Date(clock.now.getTime() + startsInMs),
    });
    await notificationsService.deliverDue();
    return pushed();
  }

  it.each(["event_cancelled", "event_updated", "event_important"] as const)(
    "« %s » à 23 h : début dans 8 h, livré ; dans 3 jours, reporté",
    async (type) => {
      expect(await at23(type, 8 * HOUR)).toBe(1);
      expect(await at23(type, 3 * DAY)).toBe(0);
    },
  );

  it("le rappel de la veille reste soumis aux heures calmes", async () => {
    expect(await at23("event_reminder_eve", 8 * HOUR + DAY)).toBe(0);
  });
});

describe("résumé", () => {
  it("un billet déjà scanné (used) reste une place, événement commencé sur plusieurs jours", async () => {
    const u = await signUp("Visiteur");
    await ticket(u, eventId, "used");
    await db
      .update(events)
      .set({ startsAt: new Date(AT.getTime() - DAY), endsAt: new Date(AT.getTime() + DAY) })
      .where(eq(events.id, eventId));
    await post(new Date(AT.getTime() - HOUR));
    await eventNewsDigest.run(AT);
    expect(await digests()).toHaveLength(1);
  });

  it("Nouveautés coupées entre la préparation et la livraison : rien ne part (réglage général, puis par événement)", async () => {
    const a = await withDevice("Alice");
    const b = await withDevice("Bruno");
    await apply(a, eventId, ref, "accepted");
    await apply(b, eventId, ref, "accepted");
    await setPrefs(a, toutActif);
    await setPrefs(b, toutActif);
    await post(new Date(AT.getTime() - HOUR));
    await eventNewsDigest.run(AT);
    expect(await digests()).toHaveLength(2);
    await db.update(notifications).set({ deliveredAt: null }).where(eq(notifications.type, "event_news_digest"));
    await setPrefs(a, { ...toutActif, eventNews: false });
    await muteNews(b, eventId);
    sent.mockClear();
    await notificationsService.deliverDue();
    expect(pushed()).toBe(0);
  });

  it("préparé et toujours voulu : il part", async () => {
    const a = await withDevice("Alice");
    await apply(a, eventId, ref, "accepted");
    await post(new Date(AT.getTime() - HOUR));
    await eventNewsDigest.run(AT);
    await notificationsService.flush();
    await notificationsService.deliverDue();
    expect(pushed()).toBe(1);
  });

  it("une ligne de profil verrouillée pendant le passage : la personne est servie quand elle se libère", async () => {
    const u = await signUp("Verrouille");
    await apply(u, eventId, ref, "accepted");
    await post(new Date(AT.getTime() - HOUR));
    const client = await pool.connect();
    await client.query("begin");
    await client.query("select 1 from profiles where user_id = $1 for update", [u.id]);
    const running = eventNewsDigest.run(AT);
    await new Promise((r) => setTimeout(r, 600));
    await client.query("commit");
    client.release();
    await running;
    expect((await digests()).filter((d) => d.userId === u.id)).toHaveLength(1);
  });

  it("heures calmes : pas préparé ni réservé ; un résumé livré en retard est abandonné", async () => {
    const u = await signUp("Nuit");
    await apply(u, eventId, ref, "accepted");
    await post(new Date(AT.getTime() - HOUR));
    const night = fromWallTime({ year: 2026, month: 11, day: 10, hour: 22, minute: 30 });
    const saved = env.NOTIFY_QUIET_HOURS;
    try {
      env.NOTIFY_QUIET_HOURS = true;
      expect(await eventNewsDigest.run(night)).toEqual({ accounts: 0, sent: 0 });
      expect(await digests()).toHaveLength(0);
      env.NOTIFY_QUIET_HOURS = false;
      await eventNewsDigest.run(AT);
      expect(await digests()).toHaveLength(1);
      env.NOTIFY_QUIET_HOURS = true;
      clock.set(night);
      await db.update(notifications).set({ deliveredAt: null });
      await notificationsService.deliverDue();
      expect(await digests()).toHaveLength(0);
    } finally {
      env.NOTIFY_QUIET_HOURS = saved;
    }
  });
});
