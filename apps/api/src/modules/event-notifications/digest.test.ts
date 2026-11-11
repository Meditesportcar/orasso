// Lot R8n1 : résumé quotidien des nouveautés des sorties (tâche `event-news.digest`, 18 h Paris). `at` est toujours passé
// explicitement (aucun test ne lit l'heure réelle). Les publications d'organisateur sont insérées directement (l'écriture
// est celle de R8a1).
import { DAY, fromWallTime, HOUR } from "@orasso/shared";
import { eq } from "drizzle-orm";
import pg from "pg";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createEvent,
  quietHours,
  resetDb,
  seedReference,
  signUp,
  type TestUser,
  useClock,
} from "../../../test/helpers";
import { db, pool } from "../../db/client";
import { type events, type feedPosts, notifications, profiles } from "../../db/schema";
import { handlers } from "../../jobs";
import { notificationsService } from "../notifications/service";
import { eventNewsDigest, parisDayStart } from "./digest";
import { apply, muteNews, organizerPost, organizerWithEvent, setPrefs, ticket } from "./testkit";

afterAll(async () => {
  await pool.end();
});

const MIN = 60_000;
/** 18 h à Paris, le 10 novembre 2026 (hiver). */
const AT = fromWallTime({ year: 2026, month: 11, day: 10, hour: 18, minute: 0 });
const nextDay = (at: Date, n = 1) => new Date(at.getTime() + n * DAY);

let ref: Awaited<ReturnType<typeof seedReference>>;
let owner: TestUser;
let structureId: string;
let eventId: string;

beforeEach(async () => {
  await resetDb();
  quietHours(false);
  useClock(AT);
  ref = await seedReference();
  const made = await organizerWithEvent(new Date(AT.getTime() + 10 * DAY), { title: "Nocturne de Canet" });
  owner = made.owner;
  structureId = made.structure.id;
  eventId = made.event.id;
});

const post = (createdAt: Date, over: Partial<typeof feedPosts.$inferInsert> = {}, id = eventId) =>
  organizerPost(owner, structureId, id, createdAt, over);

async function person(pseudo: string, status: Parameters<typeof apply>[3] | null = "accepted", id = eventId) {
  const u = await signUp(pseudo);
  if (status) await apply(u, id, ref, status);
  return u;
}

const digestsOf = async (u?: TestUser) => {
  await notificationsService.flush();
  const rows = await db.select().from(notifications).where(eq(notifications.type, "event_news_digest"));
  return (u ? rows.filter((r) => r.userId === u.id) : rows).sort((a, b) => a.userId.localeCompare(b.userId));
};
const digestAtOf = async (u: TestUser) =>
  (await db.query.profiles.findFirst({ where: eq(profiles.userId, u.id) }))?.eventNewsDigestAt ?? null;

describe("le contenu du résumé", () => {
  it("une personne avec une place : une notification, titre au pluriel, titre de l'événement, lien vers la fiche", async () => {
    const u = await person("Passionne");
    await post(new Date(AT.getTime() - 3 * HOUR));
    await post(new Date(AT.getTime() - 2 * HOUR));
    const out = await eventNewsDigest.run(AT);
    expect(out.sent).toBe(1);
    const rows = await digestsOf(u);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      title: "2 nouveautés pour tes sorties",
      body: "Nocturne de Canet",
      eventId: null,
      groupKey: null,
      family: "event",
    });
    expect((rows[0]?.data as { link?: string } | undefined)?.link).toMatch(/^\/e\/evenement-/);
  });

  it("une seule nouveauté : singulier", async () => {
    const u = await person("Passionne");
    await post(new Date(AT.getTime() - HOUR));
    await eventNewsDigest.run(AT);
    expect((await digestsOf(u))[0]?.title).toBe("1 nouveauté pour tes sorties");
  });

  it("trois événements : une seule notification, titres séparés par des virgules, lien /app", async () => {
    const u = await person("Passionne");
    const ids = [eventId];
    for (const [i, title] of ["Rassemblement du Lydia", "Sortie du port"].entries()) {
      const e = await createEvent(structureId, { title, startsAt: new Date(AT.getTime() + (11 + i) * DAY) });
      await apply(u, e.id, ref, "accepted");
      ids.push(e.id);
    }
    for (const id of ids) await post(new Date(AT.getTime() - HOUR), {}, id);
    await post(new Date(AT.getTime() - 2 * HOUR), {}, ids[1]);
    await eventNewsDigest.run(AT);
    const rows = await digestsOf(u);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.title).toBe("4 nouveautés pour tes sorties");
    expect(rows[0]?.body).toBe("Nocturne de Canet, Rassemblement du Lydia, Sortie du port");
    expect((rows[0]?.data as { link?: string } | undefined)?.link).toBe("/app");
  });

  it("plus de trois événements : « et N autres »", async () => {
    const u = await person("Passionne");
    const ids = [eventId];
    for (let i = 0; i < 4; i++) {
      const e = await createEvent(structureId, {
        title: `Sortie ${i}`,
        startsAt: new Date(AT.getTime() + (11 + i) * DAY),
      });
      ids.push(e.id);
      await apply(u, e.id, ref, "accepted");
    }
    for (const id of ids) await post(new Date(AT.getTime() - HOUR), {}, id);
    await eventNewsDigest.run(AT);
    expect((await digestsOf(u))[0]?.body).toBe("Nocturne de Canet, Sortie 0, Sortie 1 et 2 autres");
  });

  it("un billet valable donne aussi le résumé", async () => {
    const u = await person("Visiteur", null);
    await ticket(u, eventId, "valid");
    await post(new Date(AT.getTime() - HOUR));
    await eventNewsDigest.run(AT);
    expect(await digestsOf(u)).toHaveLength(1);
  });
});

describe("ce qui n'entre pas dans le résumé", () => {
  it("rien à dire : aucune notification, mais la journée est réservée", async () => {
    const u = await person("Passionne");
    const out = await eventNewsDigest.run(AT);
    expect(out.sent).toBe(0);
    expect(await digestsOf()).toHaveLength(0);
    expect((await digestAtOf(u))?.getTime()).toBe(AT.getTime());
    // Une publication arrive après : le même jour, rien de plus ; le lendemain, elle est comptée.
    await post(new Date(AT.getTime() + 30 * MIN));
    await eventNewsDigest.run(new Date(AT.getTime() + HOUR));
    expect(await digestsOf()).toHaveLength(0);
    await eventNewsDigest.run(nextDay(AT));
    expect(await digestsOf(u)).toHaveLength(1);
  });

  it("Nouveautés coupées pour cet événement : exclu (et seul événement : rien)", async () => {
    const u = await person("Passionne");
    await muteNews(u, eventId);
    await post(new Date(AT.getTime() - HOUR));
    await eventNewsDigest.run(AT);
    expect(await digestsOf()).toHaveLength(0);
  });

  it("Nouveautés coupées pour un événement sur deux : l'autre reste", async () => {
    const u = await person("Passionne");
    const other = await createEvent(structureId, {
      title: "Autre sortie",
      startsAt: new Date(AT.getTime() + 12 * DAY),
    });
    await apply(u, other.id, ref, "accepted");
    await muteNews(u, eventId);
    await post(new Date(AT.getTime() - HOUR));
    await post(new Date(AT.getTime() - HOUR), {}, other.id);
    await eventNewsDigest.run(AT);
    const rows = await digestsOf(u);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ title: "1 nouveauté pour tes sorties", body: "Autre sortie" });
  });

  it("« Nouveautés de mes sorties » coupées dans les réglages (eventNews faux) : rien, journée réservée", async () => {
    const u = await person("Passionne");
    await setPrefs(u, { application: true, event: true, social: true, grade: true, eventNews: false });
    await post(new Date(AT.getTime() - HOUR));
    await eventNewsDigest.run(AT);
    expect(await digestsOf()).toHaveLength(0);
    expect((await digestAtOf(u))?.getTime()).toBe(AT.getTime());
  });

  it("famille « Événements » coupée, ou le type coupé : rien (règle ordinaire)", async () => {
    const a = await person("Alice");
    const b = await person("Bruno");
    await setPrefs(a, { application: true, event: false, social: true, grade: true });
    await setPrefs(b, { application: true, event: true, social: true, grade: true }, ["event_news_digest"]);
    await post(new Date(AT.getTime() - HOUR));
    await eventNewsDigest.run(AT);
    expect(await digestsOf()).toHaveLength(0);
  });

  it("« Info importante » déjà annoncée en Essentiel : exclue", async () => {
    await person("Passionne");
    await post(new Date(AT.getTime() - HOUR), {
      importantSentAt: new Date(AT.getTime() - HOUR),
      importantReason: "schedule",
    });
    await eventNewsDigest.run(AT);
    expect(await digestsOf()).toHaveLength(0);
  });

  it("ses propres publications : exclues", async () => {
    const u = await person("Passionne");
    await post(new Date(AT.getTime() - HOUR), { authorId: u.id, persona: "fan", structureId: null });
    await eventNewsDigest.run(AT);
    expect(await digestsOf()).toHaveLength(0);
    await post(new Date(AT.getTime() + HOUR));
    await eventNewsDigest.run(nextDay(AT));
    expect(await digestsOf(u)).toHaveLength(1);
  });

  it("publication supprimée : exclue", async () => {
    await person("Passionne");
    await post(new Date(AT.getTime() - HOUR), { deletedAt: new Date(AT.getTime() - 30 * MIN) });
    await eventNewsDigest.run(AT);
    expect(await digestsOf()).toHaveLength(0);
  });

  it("publication qui n'est pas de l'organisateur (sur place, participant, sans rôle) : exclue", async () => {
    await person("Passionne");
    const author = await signUp("Autre");
    for (const eventRole of ["on_site", "attendee", null] as const) {
      await organizerPost(author, structureId, eventId, new Date(AT.getTime() - HOUR), {
        persona: "fan",
        structureId: null,
        eventRole,
      });
    }
    await eventNewsDigest.run(AT);
    expect(await digestsOf()).toHaveLength(0);
  });

  it.each(["refused", "withdrawn", "expired", "cancelled"] as const)(
    "place perdue (candidature « %s ») : exclue",
    async (status) => {
      await person("Passionne", status);
      await post(new Date(AT.getTime() - HOUR));
      await eventNewsDigest.run(AT);
      expect(await digestsOf()).toHaveLength(0);
    },
  );

  it("billet annulé : exclu", async () => {
    const u = await person("Visiteur", null);
    await ticket(u, eventId, "cancelled");
    await post(new Date(AT.getTime() - HOUR));
    await eventNewsDigest.run(AT);
    expect(await digestsOf()).toHaveLength(0);
  });

  it("événement annulé, brouillon ou fini depuis plus de 7 jours : exclu ; fini depuis moins de 7 jours : compté", async () => {
    const u = await person("Passionne");
    const make = async (title: string, over: Partial<typeof events.$inferInsert>) => {
      const e = await createEvent(structureId, { title, ...over });
      await apply(u, e.id, ref, "accepted");
      await post(new Date(AT.getTime() - HOUR), {}, e.id);
      return e;
    };
    const start = (days: number) => ({ startsAt: new Date(AT.getTime() + days * DAY) });
    await make("Annule", { ...start(5), status: "cancelled", cancelledAt: new Date(AT.getTime() - DAY) });
    await make("Brouillon", { ...start(5), status: "draft", publishedAt: null });
    await make("Fini il y a 8 jours", start(-8));
    await make("Fini il y a 6 jours", start(-6));
    await make("En cours", { startsAt: new Date(AT.getTime() - 2 * HOUR) });
    await eventNewsDigest.run(AT);
    const rows = await digestsOf(u);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.body).toBe("Fini il y a 6 jours, En cours");
    expect(rows[0]?.title).toBe("2 nouveautés pour tes sorties");
  });

  it("comptes banni, suspendu ou supprimé : rien", async () => {
    const banned = await person("Banni");
    const suspended = await person("Suspendu");
    const deleted = await person("Supprime");
    await db
      .update(profiles)
      .set({ bannedAt: new Date(AT.getTime() - DAY) })
      .where(eq(profiles.userId, banned.id));
    await db
      .update(profiles)
      .set({ suspendedUntil: new Date(AT.getTime() + DAY) })
      .where(eq(profiles.userId, suspended.id));
    await db
      .update(profiles)
      .set({ deletedAt: new Date(AT.getTime() - DAY) })
      .where(eq(profiles.userId, deleted.id));
    await post(new Date(AT.getTime() - HOUR));
    await eventNewsDigest.run(AT);
    expect(await digestsOf()).toHaveLength(0);
  });

  it("une suspension échue ne bloque plus", async () => {
    const u = await person("Suspendu");
    await db
      .update(profiles)
      .set({ suspendedUntil: new Date(AT.getTime() - HOUR) })
      .where(eq(profiles.userId, u.id));
    await post(new Date(AT.getTime() - HOUR));
    await eventNewsDigest.run(AT);
    expect(await digestsOf(u)).toHaveLength(1);
  });
});

describe("idempotence", () => {
  it("deux passages le même jour : une seule notification", async () => {
    const u = await person("Passionne");
    await post(new Date(AT.getTime() - HOUR));
    await eventNewsDigest.run(AT);
    await post(new Date(AT.getTime() + 10 * MIN));
    const second = await eventNewsDigest.run(new Date(AT.getTime() + 20 * MIN));
    expect(second).toEqual({ accounts: 0, sent: 0 });
    expect(await digestsOf(u)).toHaveLength(1);
  });

  it("deux passages simultanés : une seule notification par personne", async () => {
    const users: TestUser[] = [];
    for (let i = 0; i < 4; i++) users.push(await person(`Passionne${i}`));
    await post(new Date(AT.getTime() - HOUR));
    const [a, b] = await Promise.all([eventNewsDigest.run(AT), eventNewsDigest.run(AT)]);
    expect(a.sent + b.sent).toBe(4);
    // Les quatre passionnés et l'organisateur : chaque compte est réservé une seule fois.
    expect(a.accounts + b.accounts).toBe(5);
    const rows = await digestsOf();
    expect(rows).toHaveLength(4);
    expect(new Set(rows.map((r) => r.userId)).size).toBe(4);
  });

  it("par paquets : chacun est traité une fois (paquet de 2 pour 5 comptes)", async () => {
    for (let i = 0; i < 5; i++) await person(`Passionne${i}`);
    await post(new Date(AT.getTime() - HOUR));
    const out = await eventNewsDigest.run(AT, 2);
    expect(out).toEqual({ accounts: 6, sent: 5 });
    expect(await digestsOf()).toHaveLength(5);
    expect(await eventNewsDigest.run(AT, 2)).toEqual({ accounts: 0, sent: 0 });
  });

  it("requêtes ensemblistes : une lecture des publications par paquet, quel que soit le nombre de comptes", async () => {
    for (let i = 0; i < 6; i++) await person(`Passionne${i}`);
    const other = await createEvent(structureId, { startsAt: new Date(AT.getTime() + 12 * DAY) });
    for (const u of await db.query.profiles.findMany())
      await apply({ id: u.userId } as TestUser, other.id, ref, "accepted");
    await post(new Date(AT.getTime() - HOUR));
    await post(new Date(AT.getTime() - HOUR), {}, other.id);
    const spy = vi.spyOn(pg.Client.prototype, "query");
    await eventNewsDigest.run(AT);
    const texts = spy.mock.calls.map((c) =>
      String(typeof c[0] === "string" ? c[0] : ((c[0] as { text?: string })?.text ?? "")),
    );
    spy.mockRestore();
    expect(texts.filter((t) => t.includes("feed_posts"))).toHaveLength(1);
    expect(texts.filter((t) => t.includes('insert into "notifications"'))).toHaveLength(1);
  });
});

describe("la tâche", () => {
  it("`event-news.digest` est branchée sur le résumé (heure de l'horloge, jamais l'heure réelle)", async () => {
    const u = await person("Passionne");
    await post(new Date(AT.getTime() - HOUR));
    await handlers["event-news.digest"]({});
    expect(await digestsOf(u)).toHaveLength(1);
    await handlers["event-news.digest"]({});
    expect(await digestsOf(u)).toHaveLength(1);
  });
});

describe("la fenêtre depuis le dernier résumé", () => {
  it("sans résumé précédent : les dernières 24 h seulement", async () => {
    const u = await person("Passionne");
    await post(new Date(AT.getTime() - 25 * HOUR));
    await post(new Date(AT.getTime() - 23 * HOUR));
    await eventNewsDigest.run(AT);
    expect((await digestsOf(u))[0]?.title).toBe("1 nouveauté pour tes sorties");
  });

  it("après un résumé : seulement ce qui est arrivé depuis, rien compté deux fois, rien d'oublié entre deux jours", async () => {
    const u = await person("Passionne");
    await post(new Date(AT.getTime() - HOUR)); // jour 1, avant le passage : compté au jour 1
    await post(new Date(AT.getTime() + 30 * MIN)); // jour 1, après le passage : compté au jour 2
    await post(new Date(AT.getTime() + 12 * HOUR)); // jour 2, avant le passage
    await eventNewsDigest.run(AT);
    await eventNewsDigest.run(nextDay(AT));
    const rows = await digestsOf(u);
    expect(rows.map((r) => r.title).sort()).toEqual(["1 nouveauté pour tes sorties", "2 nouveautés pour tes sorties"]);
    // Jour 3 : rien de nouveau, rien de recompté.
    await eventNewsDigest.run(nextDay(AT, 2));
    expect(await digestsOf(u)).toHaveLength(2);
  });

  it("une publication après `at` n'est pas comptée ; juste à `at`, elle l'est", async () => {
    const u = await person("Passionne");
    await post(new Date(AT.getTime() + 1));
    await post(new Date(AT.getTime()));
    await eventNewsDigest.run(AT);
    expect((await digestsOf(u))[0]?.title).toBe("1 nouveauté pour tes sorties");
  });

  it("une personne passée plusieurs jours sans résumé repart de son dernier résumé", async () => {
    const u = await person("Passionne");
    await db
      .update(profiles)
      .set({ eventNewsDigestAt: nextDay(AT, -3) })
      .where(eq(profiles.userId, u.id));
    await post(new Date(AT.getTime() - 4 * DAY));
    await post(new Date(AT.getTime() - 2 * DAY));
    await eventNewsDigest.run(AT);
    expect((await digestsOf(u))[0]?.title).toBe("1 nouveauté pour tes sorties");
  });
});

describe("minuit à Paris et changement d'heure", () => {
  it("début du jour de Paris, été comme hiver, changements d'heure compris", () => {
    expect(parisDayStart(new Date("2026-11-10T17:00:00Z")).toISOString()).toBe("2026-11-09T23:00:00.000Z");
    // 23 h 30 UTC = 00 h 30 le lendemain à Paris (hiver).
    expect(parisDayStart(new Date("2026-11-10T23:30:00Z")).toISOString()).toBe("2026-11-10T23:00:00.000Z");
    expect(parisDayStart(new Date("2026-07-10T22:30:00Z")).toISOString()).toBe("2026-07-10T22:00:00.000Z");
    // Passage à l'heure d'hiver (25 octobre 2026, jour de 25 h) et d'été (29 mars 2026, jour de 23 h).
    expect(parisDayStart(new Date("2026-10-25T10:00:00Z")).toISOString()).toBe("2026-10-24T22:00:00.000Z");
    expect(parisDayStart(new Date("2026-03-29T12:00:00Z")).toISOString()).toBe("2026-03-28T23:00:00.000Z");
  });

  it("un passage à 23 h 59 puis un autre à 00 h 01 (Paris) : deux jours, deux réservations", async () => {
    const u = await person("Passionne");
    const lateEvening = fromWallTime({ year: 2026, month: 11, day: 10, hour: 23, minute: 59 });
    const justAfter = fromWallTime({ year: 2026, month: 11, day: 11, hour: 0, minute: 1 });
    await post(new Date(lateEvening.getTime() - HOUR));
    await eventNewsDigest.run(lateEvening);
    await post(new Date(lateEvening.getTime() + 1 * MIN));
    expect(await eventNewsDigest.run(new Date(lateEvening.getTime() + 30_000))).toEqual({ accounts: 0, sent: 0 });
    await eventNewsDigest.run(justAfter);
    expect(await digestsOf(u)).toHaveLength(2);
  });

  it("le jour du passage à l'heure d'hiver : un seul résumé, et le lendemain le suivant", async () => {
    const u = await person("Passionne");
    const day = fromWallTime({ year: 2026, month: 10, day: 25, hour: 18, minute: 0 });
    const morning = fromWallTime({ year: 2026, month: 10, day: 25, hour: 0, minute: 30 });
    await post(new Date(morning.getTime() - HOUR));
    await eventNewsDigest.run(morning);
    await post(new Date(day.getTime() - HOUR));
    // 18 h le même jour (jour de 25 h) : déjà réservé.
    expect(await eventNewsDigest.run(day)).toEqual({ accounts: 0, sent: 0 });
    await eventNewsDigest.run(fromWallTime({ year: 2026, month: 10, day: 26, hour: 18, minute: 0 }));
    expect(await digestsOf(u)).toHaveLength(2);
  });
});
