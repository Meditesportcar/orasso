// Lot R8n1 : préférence de notification par événement, clé `eventNews` des réglages, aperçu des destinataires et
// destinataires de `event_updated` (la même liste que l'aperçu).
import { fromWallTime } from "@orasso/shared";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  addMember,
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
import { eventNotificationPrefs, events, notifications, profiles } from "../../db/schema";
import { notificationsService } from "../notifications/service";
import { apply, organizerWithEvent, ticket } from "./testkit";

afterAll(async () => {
  await pool.end();
});

let ref: Awaited<ReturnType<typeof seedReference>>;
let clock: ReturnType<typeof useClock>;
let owner: TestUser;
let structureId: string;
let eventId: string;

beforeEach(async () => {
  await resetDb();
  quietHours(false);
  clock = useClock(fromWallTime({ year: 2026, month: 11, day: 10, hour: 15, minute: 0 }));
  ref = await seedReference();
  const made = await organizerWithEvent(new Date(clock.now.getTime() + 8 * 86_400_000));
  owner = made.owner;
  structureId = made.structure.id;
  eventId = made.event.id;
});

const prefsPath = (id = eventId) => `/me/events/${id}/notification-prefs`;

describe("GET|PUT /me/events/:id/notification-prefs", () => {
  it("sans ligne : Nouveautés activées, et on dit si on a une place", async () => {
    const u = await signUp("Passionne");
    expect((await call(u, "GET", prefsPath())).json).toEqual({ news: true, hasPlace: false });
    await apply(u, eventId, ref, "pending");
    expect((await call(u, "GET", prefsPath())).json).toEqual({ news: true, hasPlace: true });
  });

  it("avec une place : écriture puis lecture, et on peut réactiver", async () => {
    const u = await signUp("Passionne");
    await apply(u, eventId, ref, "accepted");
    const put = await call(u, "PUT", prefsPath(), { news: false });
    expect(put.status).toBe(200);
    expect(put.json).toEqual({ news: false, hasPlace: true });
    expect((await call(u, "GET", prefsPath())).json).toEqual({ news: false, hasPlace: true });
    expect((await call(u, "PUT", prefsPath(), { news: true })).json.news).toBe(true);
    expect((await call(u, "GET", prefsPath())).json.news).toBe(true);
    const rows = await db.select().from(eventNotificationPrefs).where(eq(eventNotificationPrefs.userId, u.id));
    expect(rows).toHaveLength(1);
  });

  it("un billet valable donne aussi le droit de régler", async () => {
    const u = await signUp("Visiteur");
    await ticket(u, eventId, "valid");
    expect((await call(u, "PUT", prefsPath(), { news: false })).status).toBe(200);
  });

  it.each(["withdrawn", "refused", "expired", "cancelled"] as const)(
    "sans place (candidature « %s ») : 403 no_place, rien d'écrit",
    async (status) => {
      const u = await signUp("SansPlace");
      await apply(u, eventId, ref, status);
      const res = await call(u, "PUT", prefsPath(), { news: false });
      expect(res.status).toBe(403);
      expect(res.json.error.code).toBe("no_place");
      expect(res.json.error.message).toContain("pas de place");
      expect(await db.select().from(eventNotificationPrefs)).toHaveLength(0);
    },
  );

  it("la ligne d'un autre n'est jamais touchée", async () => {
    const a = await signUp("Alice");
    const b = await signUp("Bruno");
    await apply(a, eventId, ref, "accepted");
    await apply(b, eventId, ref, "accepted");
    await call(a, "PUT", prefsPath(), { news: false });
    await call(b, "PUT", prefsPath(), { news: true });
    expect((await call(a, "GET", prefsPath())).json.news).toBe(false);
    expect((await call(b, "GET", prefsPath())).json.news).toBe(true);
    // Une autre sortie de la même personne reste à part.
    const other = await createEvent(structureId, { startsAt: new Date(clock.now.getTime() + 9 * 86_400_000) });
    await apply(a, other.id, ref, "accepted");
    expect((await call(a, "GET", prefsPath(other.id))).json.news).toBe(true);
  });

  it("liste blanche : la réponse n'a que `news` et `hasPlace`, le corps ne reçoit que `news`", async () => {
    const u = await signUp("Passionne");
    await apply(u, eventId, ref, "accepted");
    const res = await call(u, "PUT", prefsPath(), { news: false, userId: "x", hasPlace: false, essential: false });
    expect(Object.keys(res.json).sort()).toEqual(["hasPlace", "news"]);
    expect(Object.keys((await call(u, "GET", prefsPath())).json).sort()).toEqual(["hasPlace", "news"]);
    const [row] = await db.select().from(eventNotificationPrefs);
    expect(row?.userId).toBe(u.id);
  });

  it("corps invalide : refusé", async () => {
    const u = await signUp("Passionne");
    await apply(u, eventId, ref, "accepted");
    expect((await call(u, "PUT", prefsPath(), { news: "non" })).status).toBe(400);
    expect((await call(u, "PUT", prefsPath(), {})).status).toBe(400);
  });

  it("sans session : 401 ; événement inconnu ou brouillon : 404 ; annulé : permis", async () => {
    expect((await call(null, "GET", prefsPath())).status).toBe(401);
    expect((await call(null, "PUT", prefsPath(), { news: false })).status).toBe(401);
    const u = await signUp("Passionne");
    expect((await call(u, "GET", prefsPath("00000000-0000-4000-8000-000000000000"))).status).toBe(404);
    const draft = await createEvent(structureId, { status: "draft", publishedAt: null });
    expect((await call(u, "GET", prefsPath(draft.id))).status).toBe(404);
    expect((await call(u, "PUT", prefsPath(draft.id), { news: false })).status).toBe(404);
    await apply(u, eventId, ref, "accepted");
    await db.update(events).set({ status: "cancelled", cancelledAt: new Date() }).where(eq(events.id, eventId));
    expect((await call(u, "GET", prefsPath())).status).toBe(200);
  });

  it("la ligne disparaît avec l'événement (cascade)", async () => {
    const u = await signUp("Passionne");
    await apply(u, eventId, ref, "accepted");
    await call(u, "PUT", prefsPath(), { news: false });
    await db.delete(events).where(eq(events.id, eventId));
    expect(await db.select().from(eventNotificationPrefs)).toHaveLength(0);
  });
});

describe("clé eventNews des réglages", () => {
  /** Les quatre familles, comme l'envoie l'APK en ligne (le schéma les demande toujours toutes). */
  const four = { application: false, event: true, social: true, grade: true };

  it("un compte neuf la voit à vrai (réglages et profil), sans migration des anciens comptes", async () => {
    const u = await signUp("Passionne");
    expect((await call(u, "GET", "/me/settings")).json.notificationPrefs.eventNews).toBe(true);
    expect((await call(u, "GET", "/me")).json.profile.notificationPrefs.eventNews).toBe(true);
    // Un compte d'avant la vague : la clé n'existe pas en base, la lecture la complète.
    await db
      .update(profiles)
      .set({ notificationPrefs: { application: true, event: true, social: true, grade: true } })
      .where(eq(profiles.userId, u.id));
    expect((await call(u, "GET", "/me/settings")).json.notificationPrefs.eventNews).toBe(true);
  });

  it("aller et retour par les réglages et par le profil", async () => {
    const u = await signUp("Passionne");
    const off = await call(u, "PATCH", "/me/settings", { notificationPrefs: { ...four, eventNews: false } });
    expect(off.status).toBe(200);
    expect(off.json.notificationPrefs.eventNews).toBe(false);
    expect((await call(u, "GET", "/me/settings")).json.notificationPrefs.eventNews).toBe(false);
    expect((await call(u, "GET", "/me")).json.profile.notificationPrefs.eventNews).toBe(false);
    const viaProfile = await call(u, "PATCH", "/me/profile", { notificationPrefs: { ...four, eventNews: true } });
    expect(viaProfile.status).toBe(200);
    expect((await call(u, "GET", "/me/settings")).json.notificationPrefs.eventNews).toBe(true);
  });

  it("le corps à quatre clés de l'APK en ligne reste valide et garde `eventNews`", async () => {
    const u = await signUp("Passionne");
    await call(u, "PATCH", "/me/settings", { notificationPrefs: { ...four, eventNews: false } });
    const res = await call(u, "PATCH", "/me/settings", { notificationPrefs: four });
    expect(res.status).toBe(200);
    expect(res.json.notificationPrefs).toMatchObject({ ...four, eventNews: false, staff: true, account: true });
    expect((await call(u, "PATCH", "/me/profile", { notificationPrefs: four })).status).toBe(200);
    expect((await call(u, "GET", "/me/settings")).json.notificationPrefs.eventNews).toBe(false);
  });

  it("une valeur qui n'est pas un booléen est refusée", async () => {
    const u = await signUp("Passionne");
    const res = await call(u, "PATCH", "/me/settings", {
      notificationPrefs: { application: true, event: true, social: true, grade: true, eventNews: "non" },
    });
    expect(res.status).toBe(400);
  });
});

describe("aperçu des destinataires et changement de date", () => {
  const notifiedOf = async (type: string) =>
    (
      await db
        .select()
        .from(notifications)
        .where(and(eq(notifications.type, type), eq(notifications.eventId, eventId)))
    )
      .map((n) => n.userId)
      .sort();

  it("égal au nombre de personnes réellement prévenues d'un changement de date, porteurs de billet compris", async () => {
    const people: TestUser[] = [];
    for (const [i, status] of (
      ["accepted", "pending", "waitlisted", "offered", "awaiting_member"] as const
    ).entries()) {
      const u = await signUp(`Cand${i}`);
      await apply(u, eventId, ref, status);
      people.push(u);
    }
    const visitor = await signUp("Visiteur");
    await ticket(visitor, eventId, "valid");
    // Sans place : jamais prévenus, jamais comptés.
    for (const [i, status] of (["refused", "withdrawn", "expired", "cancelled"] as const).entries()) {
      await apply(await signUp(`Sans${i}`), eventId, ref, status);
    }
    await ticket(await signUp("Rembourse"), eventId, "cancelled");

    const preview = await call(owner, "GET", `/events/${eventId}/notify-preview`);
    expect(preview.status).toBe(200);
    expect(preview.json).toEqual({ recipients: 6 });

    const startsAt = new Date(clock.now.getTime() + 8 * 86_400_000 + 3_600_000);
    const res = await call(owner, "PATCH", `/events/${eventId}`, {
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + 4 * 3_600_000).toISOString(),
    });
    expect(res.status).toBe(200);
    const notified = await notifiedOf("event_updated");
    expect(notified).toHaveLength(preview.json.recipients);
    expect(notified).toEqual([...people.map((p) => p.id), visitor.id].sort());
    await notificationsService.flush();
  });

  it("changement des jours d'un événement : mêmes destinataires (billet compris)", async () => {
    const visitor = await signUp("Visiteur");
    await ticket(visitor, eventId, "valid");
    const a = await signUp("Alice");
    await apply(a, eventId, ref, "accepted");
    const day = (n: number) => new Date(clock.now.getTime() + n * 86_400_000).toISOString().slice(0, 10);
    const put = await call(owner, "PUT", `/events/${eventId}/days`, {
      dayAccess: "both",
      days: [day(12), day(13)].map((date) => ({ date, startTime: "09:00", endTime: "18:00" })),
    });
    expect(put.status).toBe(200);
    expect(await notifiedOf("event_updated")).toEqual([a.id, visitor.id].sort());
  });

  it("événement sans inscrit : zéro", async () => {
    expect((await call(owner, "GET", `/events/${eventId}/notify-preview`)).json).toEqual({ recipients: 0 });
  });

  it("organisateur ou co-organisateur : permis ; liste blanche `{ recipients }` seule", async () => {
    const co = await signUp("CoOrga", { twoFactor: true });
    await addMember(structureId, co.id, "co_organizer");
    const res = await call(co, "GET", `/events/${eventId}/notify-preview`);
    expect(res.status).toBe(200);
    expect(Object.keys(res.json)).toEqual(["recipients"]);
  });

  it("staff, membre connecté, passionné inscrit et sans session : refusés", async () => {
    const staff = await signUp("Staff", { twoFactor: true });
    await addMember(structureId, staff.id, "staff");
    const fan = await signUp("Fan", { twoFactor: true });
    await apply(fan, eventId, ref, "accepted");
    expect((await call(staff, "GET", `/events/${eventId}/notify-preview`)).status).toBe(403);
    expect((await call(fan, "GET", `/events/${eventId}/notify-preview`)).status).toBe(403);
    expect((await call(null, "GET", `/events/${eventId}/notify-preview`)).status).toBe(401);
  });

  it("organisateur sans second facteur : refus de requireOrganizer", async () => {
    const co = await signUp("CoSans");
    await addMember(structureId, co.id, "co_organizer");
    const res = await call(co, "GET", `/events/${eventId}/notify-preview`);
    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe("two_factor_required");
  });

  it("événement inconnu : 404", async () => {
    expect((await call(owner, "GET", "/events/00000000-0000-4000-8000-000000000000/notify-preview")).status).toBe(404);
  });
});
