// Lot R8n1 : livraison des notifications selon les niveaux (Essentiel / Nouveautés / reste). Le push est réellement compté :
// `push.send` est espionné, un appareil est inscrit au compte.
import { essentialNotificationTypes, fromWallTime } from "@orasso/shared";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";

import { call, quietHours, resetDb, seedReference, signUp, type TestUser, useClock } from "../../../test/helpers";
import { db, pool } from "../../db/client";
import { notifications, profiles } from "../../db/schema";
import { push } from "../../lib/push";
import { notificationsService } from "../notifications/service";
import { apply, organizerWithEvent, setPrefs, ticket } from "./testkit";

afterAll(async () => {
  await pool.end();
});

type NotifyType = Parameters<typeof notificationsService.notify>[2];

let ref: Awaited<ReturnType<typeof seedReference>>;
let clock: ReturnType<typeof useClock>;
let eventId: string;
let startsAt: Date;
let sent: MockInstance<typeof push.send>;

beforeEach(async () => {
  await resetDb();
  quietHours(false);
  clock = useClock(fromWallTime({ year: 2026, month: 11, day: 10, hour: 15, minute: 0 }));
  ref = await seedReference();
  startsAt = new Date(clock.now.getTime() + 8 * 86_400_000);
  eventId = (await organizerWithEvent(startsAt)).event.id;
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

/** Envoie une notification de ce type à `u` (rattachée à l'événement) et rend le nombre de push partis. */
async function pushesFor(u: TestUser, type: NotifyType, withEvent = true) {
  sent.mockClear();
  await notificationsService.notify(db, u.id, type, {
    title: "Titre",
    body: "Corps",
    ...(withEvent ? { eventId, eventStartsAt: startsAt } : {}),
  });
  await notificationsService.deliverDue();
  return pushed();
}

const coupe = { application: false, event: false, social: false, grade: false };
const toutActif = { application: true, event: true, social: true, grade: true };
const eventEssentials = essentialNotificationTypes.filter(
  (t) => !t.startsWith("application_") && t !== "offer_received",
);

describe("l'Essentiel passe tant qu'on a une place", () => {
  it.each(eventEssentials)("« %s » : famille et type coupés, une candidature retenue → livré", async (type) => {
    const u = await withDevice("Retenu");
    await apply(u, eventId, ref, "accepted");
    await setPrefs(u, coupe, [type]);
    expect(await pushesFor(u, type)).toBe(1);
  });

  it("avec un billet valable (sans candidature) → livré", async () => {
    const u = await withDevice("Visiteur");
    await ticket(u, eventId, "valid");
    await setPrefs(u, coupe, ["event_updated"]);
    expect(await pushesFor(u, "event_updated")).toBe(1);
  });

  it.each(["pending", "waitlisted", "offered", "awaiting_member"] as const)(
    "candidature « %s » compte comme une place",
    async (status) => {
      const u = await withDevice(`P${status}`);
      await apply(u, eventId, ref, status);
      await setPrefs(u, coupe, ["event_cancelled"]);
      expect(await pushesFor(u, "event_cancelled")).toBe(1);
    },
  );
});

describe("sans place, la règle ordinaire s'applique", () => {
  it.each(["withdrawn", "refused", "expired", "cancelled"] as const)(
    "candidature « %s » : coupé, pas livré",
    async (status) => {
      const u = await withDevice(`S${status}`);
      await apply(u, eventId, ref, status);
      await setPrefs(u, coupe, ["event_updated"]);
      expect(await pushesFor(u, "event_updated")).toBe(0);
    },
  );

  it("billet annulé : coupé, pas livré", async () => {
    const u = await withDevice("Rembourse");
    await ticket(u, eventId, "cancelled");
    await setPrefs(u, coupe, ["event_updated"]);
    expect(await pushesFor(u, "event_updated")).toBe(0);
  });

  it("aucune candidature : famille coupée, pas livré ; rien de coupé, livré (règle ordinaire)", async () => {
    const u = await withDevice("Inconnu");
    await setPrefs(u, coupe, []);
    expect(await pushesFor(u, "event_updated")).toBe(0);
    await setPrefs(u, toutActif, []);
    expect(await pushesFor(u, "event_updated")).toBe(1);
  });

  it("sans événement rattaché, un type Essentiel coupé reste coupé", async () => {
    const u = await withDevice("SansEvent");
    await apply(u, eventId, ref, "accepted");
    await setPrefs(u, coupe, ["event_updated"]);
    expect(await pushesFor(u, "event_updated", false)).toBe(0);
  });
});

describe("décisions sur la candidature : sans condition de place", () => {
  it.each(["application_accepted", "application_waitlisted", "application_refused", "offer_received"] as const)(
    "« %s » livré même famille « application » coupée et candidature refusée",
    async (type) => {
      const u = await withDevice(`D${type}`);
      await apply(u, eventId, ref, "refused");
      await setPrefs(u, coupe, [type]);
      expect(await pushesFor(u, type)).toBe(1);
    },
  );

  it("« offer_expired » n'est pas Essentiel : coupé, il reste coupé", async () => {
    const u = await withDevice("Expire");
    await apply(u, eventId, ref, "expired");
    await setPrefs(u, coupe, ["offer_expired"]);
    expect(await pushesFor(u, "offer_expired")).toBe(0);
  });
});

describe("le reste ne change pas", () => {
  it.each(["event_announcement", "new_event_followed", "event_reminder_week", "event_news_digest"] as const)(
    "« %s » coupé reste coupé, même avec une place",
    async (type) => {
      const u = await withDevice(`R${type}`);
      await apply(u, eventId, ref, "accepted");
      await setPrefs(u, coupe, [type]);
      expect(await pushesFor(u, type)).toBe(0);
    },
  );

  it("famille coupée sans type coupé : « event_announcement » reste coupé", async () => {
    const u = await withDevice("FamilleOff");
    await apply(u, eventId, ref, "accepted");
    await setPrefs(u, coupe, []);
    expect(await pushesFor(u, "event_announcement")).toBe(0);
  });
});

describe("heures calmes, comptes en cause", () => {
  it("l'Essentiel respecte les heures calmes (22 h → 8 h), puis part", async () => {
    quietHours(true);
    clock.set(fromWallTime({ year: 2026, month: 11, day: 10, hour: 22, minute: 30 }));
    const u = await withDevice("Nuit");
    await apply(u, eventId, ref, "accepted");
    await setPrefs(u, coupe, ["event_updated"]);
    expect(await pushesFor(u, "event_updated")).toBe(0);
    const [row] = await db.select().from(notifications).where(eq(notifications.userId, u.id));
    expect(row?.deliverAfter.getTime()).toBe(
      fromWallTime({ year: 2026, month: 11, day: 11, hour: 8, minute: 0 }).getTime(),
    );
    clock.set(fromWallTime({ year: 2026, month: 11, day: 11, hour: 8, minute: 1 }));
    await notificationsService.deliverDue();
    expect(pushed()).toBe(1);
  });

  it("la règle existante du jour de l'événement lève toujours les heures calmes", async () => {
    quietHours(true);
    clock.set(fromWallTime({ year: 2026, month: 11, day: 10, hour: 22, minute: 30 }));
    const u = await withDevice("JourJ");
    await apply(u, eventId, ref, "accepted");
    await setPrefs(u, coupe, ["event_updated"]);
    sent.mockClear();
    await notificationsService.notify(db, u.id, "event_updated", {
      title: "T",
      body: "C",
      eventId,
      eventStartsAt: fromWallTime({ year: 2026, month: 11, day: 10, hour: 23, minute: 0 }),
    });
    await notificationsService.deliverDue();
    expect(pushed()).toBe(1);
  });

  it("compte banni : rien de l'Essentiel", async () => {
    const u = await withDevice("Banni");
    await apply(u, eventId, ref, "accepted");
    await setPrefs(u, coupe, ["event_updated"]);
    await db.update(profiles).set({ bannedAt: new Date() }).where(eq(profiles.userId, u.id));
    expect(await pushesFor(u, "event_updated")).toBe(0);
  });

  it("compte supprimé : rien de l'Essentiel", async () => {
    const u = await withDevice("Supprime");
    await apply(u, eventId, ref, "accepted");
    await setPrefs(u, coupe, ["event_updated"]);
    await db.update(profiles).set({ deletedAt: new Date() }).where(eq(profiles.userId, u.id));
    expect(await pushesFor(u, "event_updated")).toBe(0);
  });
});

describe("aucune requête de place dans le cas courant", () => {
  const placeQueries = (spy: MockInstance<typeof db.execute>) =>
    spy.mock.calls.filter((c) => JSON.stringify(c[0]).includes("tickets")).length;

  it("rien de coupé : la place n'est pas lue", async () => {
    const u = await withDevice("Normal");
    await apply(u, eventId, ref, "accepted");
    await setPrefs(u, toutActif, []);
    const spy = vi.spyOn(db, "execute");
    expect(await pushesFor(u, "event_updated")).toBe(1);
    expect(placeQueries(spy)).toBe(0);
    spy.mockRestore();
  });

  it("type coupé : la place est lue une fois", async () => {
    const u = await withDevice("Coupe");
    await apply(u, eventId, ref, "accepted");
    await setPrefs(u, coupe, ["event_updated"]);
    const spy = vi.spyOn(db, "execute");
    expect(await pushesFor(u, "event_updated")).toBe(1);
    expect(placeQueries(spy)).toBe(1);
    spy.mockRestore();
  });

  it("une décision n'a jamais besoin de lire la place", async () => {
    const u = await withDevice("Decision");
    await apply(u, eventId, ref, "refused");
    await setPrefs(u, coupe, ["application_refused"]);
    const spy = vi.spyOn(db, "execute");
    expect(await pushesFor(u, "application_refused")).toBe(1);
    expect(placeQueries(spy)).toBe(0);
    spy.mockRestore();
  });
});
