// Ordre de la barre des stories (lot R8s, décisions R8 § 8) : « Ta story » à part, puis non vues par rang (2 événement en
// cours où j'ai ma place, 3 événement à venir où je suis retenu ou porteur d'un billet valable, sans abonnement, 4 le
// reste) et la plus récente, puis les déjà vues dans le même ordre. Rien d'autre ne change dans la visibilité.
// Aucune plaque lisible : les photos d'essai sont du bruit coloré.

import { fromWallTime, HOUR } from "@orasso/shared";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  createEvent,
  createStructure,
  createVehicle,
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
  type events,
  orders,
  profiles,
  signingKeys,
  structureFollows,
  tickets,
  ticketTypes,
  userFollows,
} from "../../db/schema";
import { resetRateLimits } from "../../lib/rateLimit";

afterAll(async () => {
  await pool.end();
});

const ORIGIN = process.env.PUBLIC_URL ?? "http://localhost:5173";
let clock: ReturnType<typeof useClock>;
let ref: Awaited<ReturnType<typeof seedReference>>;

beforeEach(async () => {
  await resetDb();
  resetRateLimits();
  clock = useClock(fromWallTime({ year: 2026, month: 11, day: 10, hour: 10, minute: 0 }));
  ref = await seedReference();
});

async function req(u: TestUser | null, method: string, path: string, body?: unknown) {
  const res = await app.request(`/api${path}`, {
    method,
    headers: {
      origin: ORIGIN,
      ...(u ? { cookie: u.cookie } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  // biome-ignore lint/suspicious/noExplicitAny: réponses JSON lues librement dans les tests
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

async function photo() {
  const width = 1600;
  const height = 900;
  const raw = Buffer.alloc(width * height * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 2654435761) % 251;
  return sharp(raw, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 95 })
    .toBuffer();
}

async function ok(u: TestUser, over: Record<string, unknown> = {}) {
  const form = new FormData();
  form.append("purpose", "story");
  form.append("file", new File([new Uint8Array(await photo())], "photo.jpg", { type: "image/jpeg" }));
  const up = await app.request("/api/me/uploads", {
    method: "POST",
    headers: { origin: ORIGIN, cookie: u.cookie },
    body: form,
  });
  expect(up.status).toBe(201);
  const key = ((await up.json()) as { key: string }).key;
  const res = await req(u, "POST", "/me/stories", {
    uploadKey: key,
    noPlateConfirmed: true,
    audience: "public",
    ...over,
  });
  expect(res.status, JSON.stringify(res.json)).toBe(201);
  return res.json as { id: string };
}

async function follow(a: TestUser, b: TestUser) {
  await db
    .insert(userFollows)
    .values({ followerId: a.id, followedId: b.id, status: "accepted", acceptedAt: clock.now });
}
const followStructure = (u: TestUser, structureId: string) =>
  db.insert(structureFollows).values({ structureId, userId: u.id, source: "manual" });

const userKey = (u: TestUser) => `u:${u.id}`;
const barKeys = async (u: TestUser) =>
  ((await req(u, "GET", "/stories/bar")).json.authors as { key: string }[]).map((a) => a.key);

/** Une structure (propriétaire à second facteur) avec une story publique vivante. */
let n = 0;
async function orga(withStory = true) {
  const owner = await signUp(`Orga${++n}`, { twoFactor: true });
  const structure = await createStructure(owner.id);
  if (withStory) await ok(owner, { persona: "organizer", structureId: structure.id });
  return { owner, structure, key: `s:${structure.id}` };
}

/** Candidature véhicule de `u` à l'événement, au statut donné. */
async function apply(u: TestUser, eventId: string, status: (typeof applications.$inferInsert)["status"] = "accepted") {
  const car = await createVehicle(u.id, ref);
  await db.insert(applications).values({
    eventId,
    userId: u.id,
    vehicleId: car.id,
    status,
    rulesAcceptedAt: clock.now,
    followStructure: false,
  });
}

/** Billet de `u` à l'événement, sans passer par la billetterie. */
async function ticket(u: TestUser, eventId: string, status: "valid" | "used" | "cancelled" = "valid") {
  const [type] = await db.insert(ticketTypes).values({ eventId, name: "Entrée visiteur", capacity: 100 }).returning();
  const [order] = await db
    .insert(orders)
    .values({
      eventId,
      userId: u.id,
      ticketTypeId: type!.id,
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
    ticketTypeId: type!.id,
    status,
    kid: 1,
    signature: Buffer.from("00", "hex"),
    issuedAt: clock.now,
  });
}

const upcoming = (structureId: string, over: Partial<typeof events.$inferInsert> = {}) =>
  createEvent(structureId, { startsAt: new Date(clock.now.getTime() + 3 * 24 * HOUR), ...over });
const running = (structureId: string) =>
  createEvent(structureId, {
    startsAt: new Date(clock.now.getTime() - 2 * HOUR),
    endsAt: new Date(clock.now.getTime() + 6 * HOUR),
  });

describe("ordre de la barre : les cinq rangs", () => {
  it("non vues : événement en cours (2), à venir (3, sans abonnement), le reste (4) ; déjà vues ensuite, même ordre", async () => {
    const me = await signUp("Moi");
    const friend = await signUp("Ami");
    const old = await signUp("AncienAbo");
    const live = await orga();
    const soonApp = await orga();
    const soonTicket = await orga();
    const followed = await orga();
    await follow(me, friend);
    await follow(me, old);
    await followStructure(me, followed.structure.id);
    // Les structures ont publié à l'instant 0 ; l'ami une heure après, l'ancien abonné deux heures après.
    clock.advance(HOUR);
    await ok(friend, {});
    clock.advance(HOUR);
    await ok(old, {});
    await apply(me, (await running(live.structure.id)).id);
    await apply(me, (await upcoming(soonApp.structure.id)).id);
    await ticket(me, (await upcoming(soonTicket.structure.id)).id);
    // Sans abonnement à ces trois structures : seule leur place les fait entrer.
    const keys = await barKeys(me);
    expect(keys[0]).toBe(live.key);
    expect(keys.slice(1, 3).sort()).toEqual([soonApp.key, soonTicket.key].sort());
    // Rang 4 : la plus récente d'abord.
    expect(keys.slice(3)).toEqual([userKey(old), userKey(friend), followed.key]);
  });

  it("le rang ne se lit pas dans la réponse : même forme qu'avant", async () => {
    const me = await signUp("Moi");
    const a = await orga();
    await apply(me, (await upcoming(a.structure.id)).id);
    const bar = (await req(me, "GET", "/stories/bar")).json;
    expect(Object.keys(bar).sort()).toEqual(["authors", "mine"]);
    expect(Object.keys(bar.authors[0]).sort()).toEqual(
      ["avatarUrl", "crewName", "hasUnseen", "key", "latestAt", "pseudoOrName", "ring"].sort(),
    );
  });

  it("les rangs jouent avant la date, sans déborder sur les vues : un rang 4 non vu passe avant un rang 2 déjà vu", async () => {
    const me = await signUp("Moi");
    const friend = await signUp("Ami");
    const live = await orga();
    const soon = await orga();
    await follow(me, friend);
    await apply(me, (await running(live.structure.id)).id);
    await apply(me, (await upcoming(soon.structure.id)).id);
    clock.advance(HOUR);
    await ok(friend, {});
    expect(await barKeys(me)).toEqual([live.key, soon.key, userKey(friend)]);
    // Je vois la story de l'événement en cours : elle passe après les non vues (rang 3, puis rang 4), anneau éteint.
    const stories = (await req(me, "GET", `/stories/by-author/${live.key}`)).json.stories as { id: string }[];
    for (const s of stories) expect((await req(me, "POST", `/stories/${s.id}/view`)).status).toBe(204);
    const bar = (await req(me, "GET", "/stories/bar")).json;
    expect(bar.authors.map((a: { key: string }) => a.key)).toEqual([soon.key, userKey(friend), live.key]);
    expect(bar.authors[2].hasUnseen).toBe(false);
    // Tout vu : les rangs reprennent (2, 3, 4).
    for (const key of [soon.key, userKey(friend)]) {
      const list = (await req(me, "GET", `/stories/by-author/${key}`)).json.stories as { id: string }[];
      for (const s of list) await req(me, "POST", `/stories/${s.id}/view`);
    }
    expect(await barKeys(me)).toEqual([live.key, soon.key, userKey(friend)]);
  });

  it("une structure suivie qui est aussi celle d'un événement à venir où je suis retenu : rang 3, avant mes abonnements", async () => {
    const me = await signUp("Moi");
    const friend = await signUp("Ami");
    const both = await orga();
    await follow(me, friend);
    await followStructure(me, both.structure.id);
    clock.advance(HOUR);
    await ok(friend, {});
    // Sans place : la structure (publiée plus tôt) est derrière l'ami (rang 4, plus récent).
    expect(await barKeys(me)).toEqual([userKey(friend), both.key]);
    await apply(me, (await upcoming(both.structure.id)).id);
    expect(await barKeys(me)).toEqual([both.key, userKey(friend)]);
  });
});

describe("rang 3 : la place à un événement à venir", () => {
  it("retenu : la structure entre dans la barre sans abonnement ; billet valable aussi", async () => {
    const me = await signUp("Moi");
    const a = await orga();
    const b = await orga();
    expect(await barKeys(me)).toEqual([]);
    await apply(me, (await upcoming(a.structure.id)).id);
    await ticket(me, (await upcoming(b.structure.id)).id);
    expect((await barKeys(me)).sort()).toEqual([a.key, b.key].sort());
  });

  it.each(["pending", "refused", "withdrawn", "waitlisted", "cancelled", "expired"] as const)(
    "candidature « %s » : la structure n'entre pas dans la barre",
    async (status) => {
      const me = await signUp("Moi");
      const a = await orga();
      await apply(me, (await upcoming(a.structure.id)).id, status);
      expect(await barKeys(me)).toEqual([]);
    },
  );

  it("billet annulé ou déjà contrôlé pour un événement à venir : pas dans la barre", async () => {
    const me = await signUp("Moi");
    const a = await orga();
    const b = await orga();
    await ticket(me, (await upcoming(a.structure.id)).id, "cancelled");
    await ticket(me, (await upcoming(b.structure.id)).id, "used");
    expect(await barKeys(me)).toEqual([]);
  });

  it("événement fini, annulé ou non publié : pas dans la barre", async () => {
    const me = await signUp("Moi");
    const finished = await orga();
    const cancelled = await orga();
    const draft = await orga();
    await apply(
      me,
      (
        await createEvent(finished.structure.id, {
          startsAt: new Date(clock.now.getTime() - 3 * 24 * HOUR),
          endsAt: new Date(clock.now.getTime() - 2 * 24 * HOUR),
        })
      ).id,
    );
    await apply(me, (await upcoming(cancelled.structure.id, { status: "cancelled" })).id);
    await apply(me, (await upcoming(draft.structure.id, { status: "draft" })).id);
    expect(await barKeys(me)).toEqual([]);
  });

  it("l'événement commence : la structure passe du rang 3 au rang 2 (en cours) ; fini, elle sort si je ne la suis pas", async () => {
    const me = await signUp("Moi");
    const friend = await signUp("Ami");
    const a = await orga();
    await follow(me, friend);
    await ok(friend, {});
    await apply(me, (await upcoming(a.structure.id, { startsAt: new Date(clock.now.getTime() + 2 * HOUR) })).id);
    expect(await barKeys(me)).toEqual([a.key, userKey(friend)]);
    clock.advance(3 * HOUR);
    expect(await barKeys(me)).toEqual([a.key, userKey(friend)]);
    clock.advance(8 * HOUR);
    expect(await barKeys(me)).toEqual([userKey(friend)]);
  });

  it("la place d'un autre n'ouvre rien : sans candidature retenue de moi, rien", async () => {
    const me = await signUp("Moi");
    const other = await signUp("Autre");
    const a = await orga();
    await apply(other, (await upcoming(a.structure.id)).id);
    expect(await barKeys(me)).toEqual([]);
    expect(await barKeys(other)).toEqual([a.key]);
  });

  it("sans story vivante, la structure n'a pas d'anneau même avec ma place", async () => {
    const me = await signUp("Moi");
    const a = await orga(false);
    await apply(me, (await upcoming(a.structure.id)).id);
    expect(await barKeys(me)).toEqual([]);
  });
});

describe("rien d'autre ne change dans la visibilité", () => {
  it("un mute retire la structure du rang 3 ; le retirer la remet", async () => {
    const me = await signUp("Moi");
    const a = await orga();
    await apply(me, (await upcoming(a.structure.id)).id);
    expect(await barKeys(me)).toEqual([a.key]);
    expect((await req(me, "PUT", `/me/story-mutes/${a.key}`)).status).toBe(204);
    expect(await barKeys(me)).toEqual([]);
    expect((await req(me, "DELETE", `/me/story-mutes/${a.key}`)).status).toBe(204);
    expect(await barKeys(me)).toEqual([a.key]);
  });

  it("compte privé non suivi absent ; suivi (accepté) présent ; story de crew absente pour un non-membre", async () => {
    const me = await signUp("Moi");
    const priv = await signUp("Prive");
    const kenji = await signUp("Kenji");
    await db.update(profiles).set({ visibility: "private" }).where(eq(profiles.userId, priv.id));
    await ok(priv, { audience: "followers" });
    const crewRes = await req(kenji, "POST", "/crews", { name: "Crew barre", department: "66" });
    expect(crewRes.status).toBe(201);
    await ok(kenji, { audience: "crew", crewId: crewRes.json.id });
    expect(await barKeys(me)).toEqual([]);
    await db
      .insert(userFollows)
      .values({ followerId: me.id, followedId: priv.id, status: "accepted", acceptedAt: clock.now });
    expect(await barKeys(me)).toEqual([userKey(priv)]);
    // Suivre le chef de crew ne donne pas sa story de crew.
    await follow(me, kenji);
    expect(await barKeys(me)).toEqual([userKey(priv)]);
  });

  it("« Ta story » : inchangée et à part, jamais dans la liste", async () => {
    const me = await signUp("Moi");
    const a = await orga();
    await ok(me, { audience: "followers" });
    await apply(me, (await upcoming(a.structure.id)).id);
    const bar = (await req(me, "GET", "/stories/bar")).json;
    expect(bar.mine).toMatchObject({ count: 1, ring: "followers", hasUnseen: false });
    expect(bar.authors.map((x: { key: string }) => x.key)).toEqual([a.key]);
  });

  it("un compte suspendu n'apparaît pas, même suivi", async () => {
    const me = await signUp("Moi");
    const friend = await signUp("Ami");
    await follow(me, friend);
    await ok(friend, {});
    expect(await barKeys(me)).toEqual([userKey(friend)]);
    await db
      .update(profiles)
      .set({ suspendedUntil: new Date(clock.now.getTime() + 24 * HOUR) })
      .where(eq(profiles.userId, friend.id));
    expect(await barKeys(me)).toEqual([]);
  });
});
