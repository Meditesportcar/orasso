// « Info importante » (R8a1) : réservée à la casquette organisateur sur un événement de sa structure, motif obligatoire,
// une par jour et trois par semaine par événement (jour et semaine civils de Paris), comptées sous verrou, supprimées
// comprises ; envoyée à ceux qui ont une place, sans l'auteur, une seule fois.
import { fromWallTime } from "@orasso/shared";
import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  call,
  createEvent,
  createStructure,
  createVehicle,
  quietHours,
  resetDb,
  seedReference,
  signUp,
  type TestUser,
  useClock,
} from "../../../test/helpers";
import { app } from "../../app";
import { db, pool } from "../../db/client";
import {
  applications,
  feedPosts,
  notifications,
  orders,
  providerProfiles,
  signingKeys,
  tickets,
  ticketTypes,
} from "../../db/schema";
import { resetRateLimits } from "../../lib/rateLimit";
import { eventPlaceHolderIds, hasPlace } from "../events/place";

afterAll(async () => {
  await pool.end();
});

const ORIGIN = process.env.PUBLIC_URL ?? "http://localhost:5173";
const HOUR = 3_600_000;
let clock: ReturnType<typeof useClock>;
let ref: Awaited<ReturnType<typeof seedReference>>;

/** Heure de Paris. */
const paris = (day: number, hour: number, minute = 0, month = 11) =>
  fromWallTime({ year: 2026, month, day, hour, minute });

beforeEach(async () => {
  await resetDb();
  resetRateLimits();
  quietHours(false);
  // Mardi 10 novembre 2026, 10 h à Paris.
  clock = useClock(paris(10, 10));
  ref = await seedReference();
});

async function setup() {
  const owner = await signUp("Orga_Imp", { twoFactor: true });
  const structure = await createStructure(owner.id);
  const startsAt = new Date(clock.now.getTime() + 20 * 24 * HOUR);
  const event = await createEvent(structure.id, {
    title: "Rassemblement du Lydia",
    startsAt,
    endsAt: new Date(startsAt.getTime() + 4 * HOUR),
    posterKey: "events/poster-imp.webp",
  });
  return { owner, structure, event };
}

type Ctx = Awaited<ReturnType<typeof setup>>;
const important = (c: Ctx, body: Record<string, unknown> = {}) =>
  call(c.owner, "POST", "/me/feed-posts", {
    persona: "organizer",
    structureId: c.structure.id,
    eventId: c.event.id,
    caption: "L'ouverture est à 18 h au lieu de 19 h",
    important: { reason: "schedule" },
    ...body,
  });

async function apply(
  u: TestUser,
  eventId: string,
  status: (typeof applications.$inferInsert)["status"],
  kind: "vehicle" | "provider" = "vehicle",
) {
  const base = { eventId, userId: u.id, status, rulesAcceptedAt: clock.now, followStructure: false };
  if (kind === "provider") {
    const [profile] = await db
      .insert(providerProfiles)
      .values({ userId: u.id, type: "photographer", name: "Presta" })
      .returning();
    await db.insert(applications).values({ ...base, kind, providerProfileId: profile!.id });
    return;
  }
  const car = await createVehicle(u.id, ref);
  await db.insert(applications).values({ ...base, vehicleId: car.id });
}

async function ticketFor(u: TestUser, eventId: string, status: "valid" | "used" | "cancelled") {
  const [existing] = await db.select().from(ticketTypes).where(eq(ticketTypes.eventId, eventId));
  const type =
    existing ??
    (await db.insert(ticketTypes).values({ eventId, name: "Entrée visiteur", capacity: 100 }).returning())[0]!;
  const [order] = await db
    .insert(orders)
    .values({
      eventId,
      userId: u.id,
      ticketTypeId: type.id,
      status: "paid",
      quantity: 1,
      amountCents: 0,
      paidAt: clock.now,
    })
    .returning();
  await db
    .insert(signingKeys)
    .values({ kid: 1, publicKey: Buffer.alloc(32) })
    .onConflictDoNothing();
  await db.insert(tickets).values({
    orderId: order!.id,
    eventId,
    userId: u.id,
    ticketTypeId: type.id,
    status,
    kid: 1,
    signature: Buffer.from("00", "hex"),
    issuedAt: clock.now,
  });
}

const sent = () => db.select().from(notifications).where(eq(notifications.type, "event_important"));

describe("qui a une place", () => {
  it("candidature en cours (toute sorte) ou billet valable ; jamais un désisté, un refusé, un expiré ni un billet annulé", async () => {
    const c = await setup();
    const users: Record<string, TestUser> = {};
    for (const name of ["pending", "accepted", "waitlisted", "offered", "awaiting_member", "ticket"]) {
      users[name] = await signUp(`Place_${name}`);
    }
    for (const name of ["withdrawn", "refused", "expired", "cancelled", "badTicket", "nobody"]) {
      users[name] = await signUp(`Rien_${name}`);
    }
    for (const status of ["pending", "accepted", "waitlisted", "offered", "awaiting_member"] as const) {
      await apply(users[status] as TestUser, c.event.id, status);
    }
    for (const status of ["withdrawn", "refused", "expired", "cancelled"] as const) {
      await apply(users[status] as TestUser, c.event.id, status);
    }
    await ticketFor(users.ticket as TestUser, c.event.id, "valid");
    await ticketFor(users.badTicket as TestUser, c.event.id, "cancelled");
    // Un prestataire retenu a aussi une place (toute sorte de candidature).
    const presta = await signUp("Presta_Imp");
    await apply(presta, c.event.id, "accepted", "provider");

    const holders = await eventPlaceHolderIds(db, c.event.id);
    expect(new Set(holders)).toEqual(
      new Set([
        ...["pending", "accepted", "waitlisted", "offered", "awaiting_member", "ticket"].map((n) => users[n]?.id),
        presta.id,
      ]),
    );
    expect(holders).toHaveLength(new Set(holders).size);
    for (const name of ["pending", "ticket", "awaiting_member"]) {
      expect(await hasPlace(db, c.event.id, (users[name] as TestUser).id)).toBe(true);
    }
    for (const name of ["withdrawn", "refused", "expired", "cancelled", "badTicket", "nobody"]) {
      expect(await hasPlace(db, c.event.id, (users[name] as TestUser).id), name).toBe(false);
    }
  });
});

describe("règles de la publication", () => {
  it("seulement la casquette organisateur, sur un événement de sa structure : sinon 400 important_requires_event", async () => {
    const c = await setup();
    const form = async (u: TestUser) => {
      const data = await sharp({
        create: { width: 1080, height: 1350, channels: 3, background: "#888" },
      })
        .jpeg()
        .toBuffer();
      const f = new FormData();
      f.append("purpose", "feed_post");
      f.append("file", new File([new Uint8Array(data)], "p.jpg", { type: "image/jpeg" }));
      const res = await app.request("/api/me/uploads", {
        method: "POST",
        headers: { origin: ORIGIN, cookie: u.cookie },
        body: f,
      });
      return { photos: [{ uploadKey: ((await res.json()) as { key: string }).key, noPlateConfirmed: true }] };
    };
    // Sans événement.
    const noEvent = await important(c, { eventId: undefined, ...(await form(c.owner)) });
    expect(noEvent.status).toBe(400);
    expect(noEvent.json.error.code).toBe("important_requires_event");
    // Un passionné, même avec un événement et une photo.
    const fan = await signUp("Fan_Imp");
    await apply(fan, c.event.id, "accepted");
    const asFan = await call(fan, "POST", "/me/feed-posts", {
      eventId: c.event.id,
      important: { reason: "safety" },
      ...(await form(fan)),
    });
    expect(asFan.status).toBe(400);
    expect(asFan.json.error.code).toBe("important_requires_event");
    // Le motif est obligatoire.
    expect((await important(c, { important: {} })).status).toBe(400);
    expect((await important(c, { important: { reason: "pub" } })).status).toBe(400);
    // Rien n'est parti.
    expect(await sent()).toHaveLength(0);
    expect((await important(c)).status).toBe(201);
  });

  it("une publication ordinaire n'envoie jamais de notification", async () => {
    const c = await setup();
    const fan = await signUp("Inscrit_Imp");
    await apply(fan, c.event.id, "accepted");
    const res = await important(c, { important: undefined });
    expect(res.status).toBe(201);
    expect(res.json.important).toBeNull();
    expect(await sent()).toHaveLength(0);
    expect((await db.select().from(notifications)).filter((n) => n.userId === fan.id)).toHaveLength(0);
  });
});

describe("envoi", () => {
  it("aux inscrits et retenus, sans l'auteur : titre, corps de 140 caractères, lien ; puis important_sent_at", async () => {
    const c = await setup();
    const ins = await signUp("Inscrit2_Imp");
    const waiting = await signUp("Attente_Imp");
    const gone = await signUp("Parti_Imp");
    await apply(ins, c.event.id, "accepted");
    await apply(waiting, c.event.id, "waitlisted");
    await apply(gone, c.event.id, "withdrawn");
    // L'auteur a lui-même une place : il ne se prévient pas.
    await apply(c.owner, c.event.id, "accepted");
    const caption = `${"Le plan d'accès change. ".repeat(10)}FIN`;
    const res = await important(c, { caption, important: { reason: "access" } });
    expect(res.status).toBe(201);
    expect(res.json.important).toMatchObject({ reason: "access" });
    expect(res.json.important.sentAt).toBe(clock.now.toISOString());
    const rows = await sent();
    expect(new Set(rows.map((r) => r.userId))).toEqual(new Set([ins.id, waiting.id]));
    const first = rows[0]!;
    expect(first.title).toBe("Rassemblement du Lydia · Accès");
    expect(first.body).toBe([...caption].slice(0, 140).join(""));
    expect(first.body).not.toContain("FIN");
    expect(first.eventId).toBe(c.event.id);
    expect(first.family).toBe("event");
    expect(first.data).toMatchObject({ eventId: c.event.id, postId: res.json.id, link: `/e/${c.event.slug}` });
    const [row] = await db.select().from(feedPosts).where(eq(feedPosts.id, res.json.id));
    expect(row?.importantSentAt?.toISOString()).toBe(clock.now.toISOString());
    expect(row?.importantReason).toBe("access");
  });

  it("rejeu d'un envoi (même clientId) : la même publication, aucun second envoi, aucun droit consommé", async () => {
    const c = await setup();
    const ins = await signUp("Inscrit3_Imp");
    await apply(ins, c.event.id, "accepted");
    const clientId = "0b0c3a5e-6a47-4f0c-9c1e-2a1d1c0b0a01";
    const a = await important(c, { clientId });
    const b = await important(c, { clientId });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(b.json.id).toBe(a.json.id);
    expect(await sent()).toHaveLength(1);
    const left = await call(
      c.owner,
      "GET",
      `/me/feed-posts/attachable-events?persona=organizer&structureId=${c.structure.id}`,
    );
    expect(left.json.items[0].important).toEqual({ leftToday: 0, leftWeek: 2 });
  });

  it("refus par le plafond : rien n'est envoyé", async () => {
    const c = await setup();
    const ins = await signUp("Inscrit4_Imp");
    await apply(ins, c.event.id, "accepted");
    expect((await important(c)).status).toBe(201);
    const second = await important(c);
    expect(second.status).toBe(409);
    expect(await sent()).toHaveLength(1);
    const posts = await db.select().from(feedPosts).where(eq(feedPosts.eventId, c.event.id));
    expect(posts).toHaveLength(1);
  });
});

describe("plafond : une par jour, trois par semaine, par événement", () => {
  it("la deuxième du jour : 409 important_quota, avec ce qu'il reste", async () => {
    const c = await setup();
    expect((await important(c)).status).toBe(201);
    const second = await important(c);
    expect(second.status).toBe(409);
    expect(second.json.error.code).toBe("important_quota");
    expect(second.json.error.details).toEqual({ leftToday: 0, leftWeek: 2 });
  });

  it("par événement : un autre événement a ses propres droits", async () => {
    const c = await setup();
    const other = await createEvent(c.structure.id, {
      startsAt: new Date(clock.now.getTime() + 30 * 24 * HOUR),
      endsAt: new Date(clock.now.getTime() + 30 * 24 * HOUR + 4 * HOUR),
      posterKey: "events/p2.webp",
    });
    expect((await important(c)).status).toBe(201);
    expect((await important(c, { eventId: other.id })).status).toBe(201);
  });

  it("la quatrième de la semaine : 409, même un autre jour ; le lundi à minuit (Paris) rend les droits", async () => {
    const c = await setup();
    expect((await important(c)).status).toBe(201); // mardi 10
    clock.set(paris(11, 9));
    expect((await important(c)).status).toBe(201); // mercredi 11
    clock.set(paris(12, 9));
    expect((await important(c)).status).toBe(201); // jeudi 12
    clock.set(paris(13, 9));
    const fourth = await important(c); // vendredi 13
    expect(fourth.status).toBe(409);
    expect(fourth.json.error.details).toEqual({ leftToday: 0, leftWeek: 0 });
    clock.set(paris(15, 23, 30)); // dimanche 15, 23 h 30 : encore la même semaine
    expect((await important(c)).status).toBe(409);
    clock.set(paris(16, 0, 30)); // lundi 16, 0 h 30 : nouvelle semaine
    expect((await important(c)).status).toBe(201);
  });

  it("minuit à Paris, pas à Greenwich : 23 h 30 puis 0 h 30 sont deux jours", async () => {
    const c = await setup();
    clock.set(paris(10, 23, 30)); // 22 h 30 UTC
    expect((await important(c)).status).toBe(201);
    clock.set(paris(10, 23, 59));
    expect((await important(c)).status).toBe(409);
    clock.set(paris(11, 0, 30)); // 23 h 30 UTC, déjà le lendemain à Paris
    expect((await important(c)).status).toBe(201);
  });

  it("changement d'heure : le samedi 24 puis le dimanche 25 octobre 2026 (dimanche de 25 heures)", async () => {
    const c = await setup();
    clock.set(paris(24, 23, 30, 10));
    expect((await important(c)).status).toBe(201);
    clock.set(paris(25, 0, 30, 10));
    expect((await important(c)).status).toBe(201);
    clock.set(paris(25, 23, 30, 10)); // même dimanche (heure d'hiver)
    expect((await important(c)).status).toBe(409);
    clock.set(paris(26, 0, 30, 10)); // lundi : nouvelle semaine
    expect((await important(c)).status).toBe(201);
  });

  it("supprimer une publication ne rend pas de droit", async () => {
    const c = await setup();
    const first = await important(c);
    expect(first.status).toBe(201);
    expect((await call(c.owner, "DELETE", `/me/feed-posts/${first.json.id}`)).status).toBe(204);
    const again = await important(c);
    expect(again.status).toBe(409);
    expect(again.json.error.code).toBe("important_quota");
  });

  it("deux envois simultanés : un seul passe", async () => {
    const c = await setup();
    const ins = await signUp("Inscrit5_Imp");
    await apply(ins, c.event.id, "accepted");
    const results = await Promise.all([important(c), important(c)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await sent()).toHaveLength(1);
    expect(
      await db
        .select()
        .from(feedPosts)
        .where(and(eq(feedPosts.eventId, c.event.id), eq(feedPosts.persona, "organizer"))),
    ).toHaveLength(1);
  });

  it("trois envois simultanés d'un même jour : un seul passe", async () => {
    const c = await setup();
    const results = await Promise.all([important(c), important(c), important(c)]);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(2);
  });
});
