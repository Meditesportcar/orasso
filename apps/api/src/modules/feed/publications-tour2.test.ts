// R8a1, tour 2 : corrections des relectures (pool SQL sous verrou, billet scanné, plafond des fiches pro, rejeu simultané,
// purge de la modération, export d'une publication de page).
import { fromWallTime, PRO_PAID_FROM, PRO_POSTS_PER_MONTH } from "@orasso/shared";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  addMember,
  call,
  createEvent,
  createPro,
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
  profiles,
  signingKeys,
  structureMembers,
  tickets,
  ticketTypes,
} from "../../db/schema";
import { resetRateLimits } from "../../lib/rateLimit";
import { withTx } from "../../lib/tx";
import { eventPlaceHolderIds, hasPlace } from "../events/place";
import { purgeHeldPhotos } from "../moderation/targets/feedPost";

afterAll(async () => {
  await pool.end();
});

const ORIGIN = process.env.PUBLIC_URL ?? "http://localhost:5173";
const HOUR = 3_600_000;
let clock: ReturnType<typeof useClock>;
let ref: Awaited<ReturnType<typeof seedReference>>;

beforeEach(async () => {
  await resetDb();
  resetRateLimits();
  quietHours(false);
  clock = useClock(fromWallTime({ year: 2026, month: 11, day: 10, hour: 10, minute: 0 }));
  ref = await seedReference();
});

async function setup() {
  const owner = await signUp("Orga_T2", { twoFactor: true });
  const structure = await createStructure(owner.id);
  const startsAt = new Date(clock.now.getTime() + 20 * 24 * HOUR);
  const event = await createEvent(structure.id, {
    title: "Rassemblement du Lydia",
    startsAt,
    endsAt: new Date(startsAt.getTime() + 4 * HOUR),
    posterKey: "events/poster-t2.webp",
  });
  return { owner, structure, event };
}

async function photoOf(u: TestUser) {
  const data = await sharp({ create: { width: 1080, height: 1350, channels: 3, background: "#888" } })
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
    usedAt: status === "used" ? clock.now : null,
  });
}

describe("1. suppressions simultanées : aucune attente sans fin du pool", () => {
  it("plus de suppressions que de connexions du pool : toutes aboutissent", async () => {
    const { owner, structure } = await setup();
    const co = await signUp("Co_T2", { twoFactor: true });
    await addMember(structure.id, co.id, "co_organizer");
    const n = 16; // le pool a 10 connexions : avant la correction, chaque suppression tenait la sienne et en attendait une autre
    const ids = Array.from({ length: n }, () => crypto.randomUUID());
    await db
      .insert(feedPosts)
      .values(
        ids.map((id) => ({
          id,
          authorId: owner.id,
          persona: "organizer" as const,
          structureId: structure.id,
          caption: "x",
        })),
      );
    const results = await Promise.all(ids.map((id) => call(co, "DELETE", `/me/feed-posts/${id}`)));
    expect(results.map((r) => r.status)).toEqual(Array(n).fill(204));
  }, 40_000);
});

describe("2. billet scanné : la place reste", () => {
  it("`used` compte comme `valid` ; un billet annulé jamais", async () => {
    const { owner, structure, event } = await setup();
    const scanned = await signUp("Scanne_T2");
    const cancelled = await signUp("Annule_T2");
    await ticketFor(scanned, event.id, "used");
    await ticketFor(cancelled, event.id, "cancelled");
    expect(await eventPlaceHolderIds(db, event.id)).toEqual([scanned.id]);
    expect(await hasPlace(db, event.id, scanned.id)).toBe(true);
    expect(await hasPlace(db, event.id, cancelled.id)).toBe(false);
    // Il reçoit l'« Info importante » et peut se rattacher (rôle déduit).
    const res = await call(owner, "POST", "/me/feed-posts", {
      persona: "organizer",
      structureId: structure.id,
      eventId: event.id,
      caption: "Changement d'horaire",
      important: { reason: "schedule" },
    });
    expect(res.status).toBe(201);
    const rows = await db.select().from(notifications).where(eq(notifications.type, "event_important"));
    expect(rows.map((r) => r.userId)).toEqual([scanned.id]);
    const own = await call(scanned, "POST", "/me/feed-posts", { eventId: event.id, ...(await photoOf(scanned)) });
    expect(own.json.attach.role).toBe("attendee");
  });
});

describe("3. fiche pro : même limite et mêmes contrôles sur les deux routes", () => {
  it("quatre par mois en alternant les routes, dans les deux sens ; `postsUsed` compte les deux", async () => {
    const owner = await signUp("Pro_T2");
    const pro = await createPro(owner.id);
    const offer = (i: number) =>
      call(owner, "POST", `/pros/${pro.id}/posts`, { title: `Offre ${i}`, body: "Texte de l'offre" });
    const feed = async () =>
      call(owner, "POST", "/me/feed-posts", { persona: "pro", proId: pro.id, ...(await photoOf(owner)) });
    expect((await offer(1)).status).toBe(201);
    expect((await feed()).status).toBe(201);
    expect((await offer(2)).status).toBe(201);
    expect((await feed()).status).toBe(201);
    expect(PRO_POSTS_PER_MONTH).toBe(4);
    expect((await call(owner, "GET", "/me/pro")).json).toMatchObject({ postsUsed: 4, postsRemaining: 0 });
    expect((await offer(3)).status).toBe(409);
    const over = await feed();
    expect(over.status).toBe(409);
    expect(over.json.error.code).toBe("conflict");
    // Supprimer ne rend rien.
    const [mine] = await db.select().from(feedPosts).where(eq(feedPosts.proId, pro.id));
    expect((await call(owner, "DELETE", `/me/feed-posts/${mine!.id}`)).status).toBe(204);
    expect((await feed()).status).toBe(409);
  });

  it("sans abonnement après la gratuité : refus sur les deux routes ; fiche non publiée : refus", async () => {
    const owner = await signUp("ProAbo_T2");
    const pro = await createPro(owner.id);
    clock.set(new Date(PRO_PAID_FROM.getTime() + 24 * HOUR));
    const feed = await call(owner, "POST", "/me/feed-posts", {
      persona: "pro",
      proId: pro.id,
      ...(await photoOf(owner)),
    });
    expect(feed.status).toBe(403);
    expect(
      (await call(owner, "POST", `/pros/${pro.id}/posts`, { title: "Offre", body: "Texte de l'offre" })).status,
    ).toBe(403);
  });

  it("fiche pro non publiée : 400", async () => {
    const owner = await signUp("ProNonPub_T2");
    const pro = await createPro(owner.id, { publishedAt: null });
    const res = await call(owner, "POST", "/me/feed-posts", {
      persona: "pro",
      proId: pro.id,
      ...(await photoOf(owner)),
    });
    expect(res.status).toBe(400);
  });
});

describe("4. rejeu simultané d'une « Info importante »", () => {
  it("même clientId, deux requêtes en même temps : la même publication, un seul envoi, jamais un faux refus", async () => {
    const { owner, structure, event } = await setup();
    const ins = await signUp("Inscrit_T2");
    const car = await createVehicle(ins.id, ref);
    await db.insert(applications).values({
      eventId: event.id,
      userId: ins.id,
      vehicleId: car.id,
      status: "accepted",
      rulesAcceptedAt: clock.now,
      followStructure: false,
    });
    const body = {
      persona: "organizer",
      structureId: structure.id,
      eventId: event.id,
      caption: "L'ouverture est à 18 h",
      important: { reason: "schedule" },
      clientId: "0b0c3a5e-6a47-4f0c-9c1e-2a1d1c0b0a01",
    };
    const results = await Promise.all([1, 2, 3].map(() => call(owner, "POST", "/me/feed-posts", body)));
    expect(results.map((r) => r.status)).toEqual([201, 201, 201]);
    expect(new Set(results.map((r) => r.json.id)).size).toBe(1);
    expect(await db.select().from(notifications).where(eq(notifications.type, "event_important"))).toHaveLength(1);
  });
});

describe("5. la purge de la modération ne rend pas de quota", () => {
  it("une publication de page reste (retirée) même si le compte de qui l'a publiée est supprimé ; une personnelle part", async () => {
    const { owner, structure, event } = await setup();
    const body = {
      persona: "organizer",
      structureId: structure.id,
      eventId: event.id,
      caption: "L'ouverture est à 18 h",
      important: { reason: "schedule" },
    };
    const page = await call(owner, "POST", "/me/feed-posts", body);
    expect(page.status).toBe(201);
    const own = await call(owner, "POST", "/me/feed-posts", await photoOf(owner));
    expect((await call(owner, "DELETE", `/me/feed-posts/${page.json.id}`)).status).toBe(204);
    expect((await call(owner, "DELETE", `/me/feed-posts/${own.json.id}`)).status).toBe(204);
    await db.update(profiles).set({ deletedAt: clock.now }).where(eq(profiles.userId, owner.id));
    await withTx((tx) => purgeHeldPhotos(tx, page.json.id));
    await withTx((tx) => purgeHeldPhotos(tx, own.json.id));
    expect(await db.select().from(feedPosts).where(eq(feedPosts.id, page.json.id))).toHaveLength(1);
    expect(await db.select().from(feedPosts).where(eq(feedPosts.id, own.json.id))).toHaveLength(0);
    // Le droit du jour reste consommé : un autre gestionnaire ne peut pas renvoyer d'info importante aujourd'hui.
    const co = await signUp("Co2_T2", { twoFactor: true });
    await addMember(structure.id, co.id, "co_organizer");
    const again = await call(co, "POST", "/me/feed-posts", body);
    expect(again.status).toBe(409);
    expect(again.json.error.code).toBe("important_quota");
  });
});

describe("6. export d'une publication de page", () => {
  it("au nom de la page : un gestionnaire oui, un ancien membre non", async () => {
    const { owner, structure } = await setup();
    const co = await signUp("Co3_T2", { twoFactor: true });
    await addMember(structure.id, co.id, "co_organizer");
    const page = await call(owner, "POST", "/me/feed-posts", {
      persona: "organizer",
      structureId: structure.id,
      ...(await photoOf(owner)),
    });
    expect((await call(co, "GET", `/feed-posts/${page.json.id}/export`)).status).toBe(200);
    await db.update(structureMembers).set({ status: "removed" }).where(eq(structureMembers.userId, owner.id));
    const former = await call(owner, "GET", `/feed-posts/${page.json.id}/export`);
    expect(former.status).toBe(403);
  });
});
