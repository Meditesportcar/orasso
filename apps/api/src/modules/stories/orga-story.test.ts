// La story de l'organisateur « En cours » (lot R7h) : mentions par rôle, regard « identifié », « Ajouter à ma story »
// (copie liée : public, expiration héritée, doublon, crew, compte privé), « Retirer », cascade (suppression de l'originale,
// retrait de l'identification, compte qui passe en privé), anneau `live`, `organizerStoryAvailable`, widget de l'Accueil.
// Aucune plaque lisible : les photos d'essai sont du bruit coloré.

import { randomUUID } from "node:crypto";
import { fromWallTime, HOUR } from "@orasso/shared";
import { and, eq, sql } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  addMember,
  createEvent,
  createPro,
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
  notifications,
  profiles,
  stories,
  storyTags,
  structureFollows,
  userFollows,
} from "../../db/schema";
import { resetRateLimits } from "../../lib/rateLimit";
import { storage } from "../../lib/storage";
import { storiesExpire } from "./expire";

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
  return { status: res.status, json, headers: res.headers };
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

async function publish(u: TestUser, over: Record<string, unknown> = {}) {
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
  return req(u, "POST", "/me/stories", { uploadKey: key, noPlateConfirmed: true, audience: "public", ...over });
}
async function ok(u: TestUser, over: Record<string, unknown> = {}) {
  const res = await publish(u, over);
  expect(res.status, JSON.stringify(res.json)).toBe(201);
  return res.json as { id: string; skipped: unknown[] };
}

const makePrivate = (u: TestUser) =>
  db.update(profiles).set({ visibility: "private" }).where(eq(profiles.userId, u.id));

async function follow(a: TestUser, b: TestUser) {
  await db
    .insert(userFollows)
    .values({ followerId: a.id, followedId: b.id, status: "accepted", acceptedAt: clock.now });
}

/** Une structure (propriétaire, co-organisateur, staff, étranger) et un participant public qui l'identifie. */
async function world() {
  const owner = await signUp("Sarah_66", { twoFactor: true });
  const co = await signUp("Coorga_66", { twoFactor: true });
  const staff = await signUp("Staff_66");
  const stranger = await signUp("Etranger_66");
  const kenji = await signUp("Kenji_66");
  const structure = await createStructure(owner.id);
  await addMember(structure.id, co.id, "co_organizer");
  await addMember(structure.id, staff.id, "staff");
  return { owner, co, staff, stranger, kenji, structure };
}

const tagStructure = (structureId: string) => ({ tags: [{ kind: "structure", id: structureId }] });

const mentions = (u: TestUser | null, structureId: string, cursor?: string) =>
  req(u, "GET", `/structures/${structureId}/story-mentions${cursor ? `?cursor=${cursor}` : ""}`);
const share = (u: TestUser, id: string, body?: unknown) => req(u, "POST", `/stories/${id}/share-to-mine`, body ?? {});
const byAuthor = (u: TestUser, key: string) => req(u, "GET", `/stories/by-author/${key}`);

describe("mentions de la structure", () => {
  it("propriétaire, co-organisateur et staff les lisent ; un étranger, un participant et la nuit sans session non", async () => {
    const w = await world();
    const s = await ok(w.kenji, tagStructure(w.structure.id));
    for (const u of [w.owner, w.co, w.staff]) {
      const res = await mentions(u, w.structure.id);
      expect(res.status, `${u.pseudo}`).toBe(200);
      expect(res.json.count).toBe(1);
      expect(res.json.items).toHaveLength(1);
      expect(res.json.items[0]).toMatchObject({ storyId: s.id, authorName: "Kenji_66", copyId: null });
    }
    expect((await mentions(w.stranger, w.structure.id)).status).toBe(403);
    expect((await mentions(w.kenji, w.structure.id)).status).toBe(403);
    expect((await mentions(null, w.structure.id)).status).toBe(401);
  });

  it("liste blanche de champs : ni identifiant de compte, ni vues, ni audience interne", async () => {
    const w = await world();
    await ok(w.kenji, tagStructure(w.structure.id));
    const item = (await mentions(w.owner, w.structure.id)).json.items[0];
    expect(Object.keys(item).sort()).toEqual(
      [
        "authorAvatarUrl",
        "authorKey",
        "authorName",
        "caption",
        "copyId",
        "createdAt",
        "expiresAt",
        "mediaUrl",
        "storyId",
      ].sort(),
    );
    expect(item.mediaUrl).toMatch(/^\/api\/stories\/[0-9a-f-]+\/media\/[0-9a-f]{16}\.webp$/);
  });

  it("l'autocollant d'un événement publié de la structure vaut mention", async () => {
    const w = await world();
    const event = await createEvent(w.structure.id);
    const s = await ok(w.kenji, { eventId: event.id });
    const res = await mentions(w.owner, w.structure.id);
    expect(res.json.items.map((i: { storyId: string }) => i.storyId)).toEqual([s.id]);
  });

  it("l'identification retirée, la story expirée ou supprimée, la copie, la story de la structure : plus listées", async () => {
    const w = await world();
    const a = await ok(w.kenji, tagStructure(w.structure.id));
    const b = await ok(w.kenji, tagStructure(w.structure.id));
    await ok(w.owner, { persona: "organizer", structureId: w.structure.id, ...tagStructure(w.structure.id) });
    expect((await mentions(w.owner, w.structure.id)).json.count).toBe(2);
    expect(
      (await req(w.owner, "POST", `/me/story-tags/${a.id}/remove`, { kind: "structure", id: w.structure.id })).status,
    ).toBe(204);
    expect((await mentions(w.owner, w.structure.id)).json.items.map((i: { storyId: string }) => i.storyId)).toEqual([
      b.id,
    ]);
    expect((await req(w.kenji, "DELETE", `/me/stories/${b.id}`)).status).toBe(204);
    expect((await mentions(w.owner, w.structure.id)).json).toMatchObject({ items: [], count: 0 });
    // Expirée.
    await ok(w.kenji, tagStructure(w.structure.id));
    clock.advance(25 * HOUR);
    expect((await mentions(w.owner, w.structure.id)).json.count).toBe(0);
  });

  it("un compte privé n'est jamais listé : il n'a pas pu identifier, et s'il passe en privé ensuite la mention tombe", async () => {
    const w = await world();
    const marc = await signUp("Marc_66");
    await makePrivate(marc);
    const refused = await ok(marc, { audience: "followers", ...tagStructure(w.structure.id) });
    expect(refused.skipped).toHaveLength(1);
    expect((await mentions(w.owner, w.structure.id)).json.count).toBe(0);
    // Public puis privé : la mention existait, elle n'est plus servie.
    const late = await signUp("Late_66");
    await ok(late, tagStructure(w.structure.id));
    expect((await mentions(w.owner, w.structure.id)).json.count).toBe(1);
    await makePrivate(late);
    expect((await mentions(w.owner, w.structure.id)).json).toMatchObject({ items: [], count: 0 });
  });

  it("une story de crew n'identifie pas une structure : jamais listée, même avec une identification posée à la main", async () => {
    const w = await world();
    const crew = await req(w.kenji, "POST", "/crews", { name: "Crew mention", department: "66" });
    const s = await ok(w.kenji, { audience: "crew", crewId: crew.json.id, persona: "fan" });
    await db.insert(storyTags).values({ storyId: s.id, targetKind: "structure", targetId: w.structure.id });
    expect((await mentions(w.owner, w.structure.id)).json.count).toBe(0);
  });

  it("une autre structure ne voit pas les mentions de celle-ci ; la pagination suit le curseur", async () => {
    const w = await world();
    const other = await signUp("Autre_66");
    const otherStructure = await createStructure(other.id);
    // Une vraie story, puis 21 lignes clonées en SQL (22 publications réelles dépasseraient le délai du test).
    const base = await ok(w.kenji, tagStructure(w.structure.id));
    for (let i = 1; i < 22; i++) {
      const id = randomUUID();
      await db.execute(sql`insert into stories (id, author_id, persona, audience, media_kind, storage_key, status, plate_state, expires_at, created_at, updated_at)
        select ${id}::uuid, author_id, persona, audience, media_kind, storage_key, status, plate_state, expires_at, created_at + (${i} * interval '1 second'), updated_at from stories where id = ${base.id}`);
      await db.insert(storyTags).values({ storyId: id, targetKind: "structure", targetId: w.structure.id });
    }
    expect((await mentions(other, otherStructure.id)).json.count).toBe(0);
    expect((await mentions(other, w.structure.id)).status).toBe(403);
    const first = await mentions(w.owner, w.structure.id);
    expect(first.json.items).toHaveLength(20);
    expect(first.json.count).toBe(22);
    expect(first.json.nextCursor).toBeTruthy();
    const second = await mentions(w.owner, w.structure.id, first.json.nextCursor);
    expect(second.json.items).toHaveLength(2);
    expect(second.json.nextCursor).toBeNull();
    const all = [...first.json.items, ...second.json.items].map((i: { storyId: string }) => i.storyId);
    expect(new Set(all).size).toBe(22);
  });
});

describe("regard « identifié »", () => {
  it("une organisatrice identifiée voit la story d'un compte devenu privé qu'elle ne suit pas ; un étranger non", async () => {
    const w = await world();
    const s = await ok(w.kenji, tagStructure(w.structure.id));
    await makePrivate(w.kenji);
    const key = `u:${w.kenji.id}`;
    expect((await byAuthor(w.stranger, key)).json.stories).toHaveLength(0);
    const seen = await byAuthor(w.owner, key);
    expect(seen.json.stories.map((x: { id: string }) => x.id)).toEqual([s.id]);
    const media = new URL(seen.json.stories[0].mediaUrl, "http://x").pathname.replace(/^\/api/, "");
    expect((await req(w.owner, "GET", media)).status).toBe(200);
    expect((await req(w.stranger, "GET", media)).status).toBe(403);
    // Le staff n'est pas identifié (seuls propriétaire et co-organisateurs le sont) : il reste un lecteur ordinaire.
    expect((await byAuthor(w.staff, key)).json.stories).toHaveLength(0);
  });

  it("une identification retirée retire le regard", async () => {
    const w = await world();
    const s = await ok(w.kenji, tagStructure(w.structure.id));
    await makePrivate(w.kenji);
    expect((await byAuthor(w.co, `u:${w.kenji.id}`)).json.stories).toHaveLength(1);
    await req(w.owner, "POST", `/me/story-tags/${s.id}/remove`, { kind: "structure", id: w.structure.id });
    expect((await byAuthor(w.co, `u:${w.kenji.id}`)).json.stories).toHaveLength(0);
  });

  it("jamais une story de crew, même identifié à la main", async () => {
    const w = await world();
    const crew = await req(w.kenji, "POST", "/crews", { name: "Crew identifié", department: "66" });
    const s = await ok(w.kenji, { audience: "crew", crewId: crew.json.id, persona: "fan" });
    await db.insert(storyTags).values({ storyId: s.id, targetKind: "structure", targetId: w.structure.id });
    expect((await byAuthor(w.owner, `u:${w.kenji.id}`)).json.stories).toHaveLength(0);
    const res = await req(w.owner, "GET", `/stories/${s.id}/thumb`);
    expect(res.status).toBe(403);
  });
});

describe("« Ajouter à ma story »", () => {
  it("copie liée au nom de la structure : public, expiration héritée, crédit, tags non copiés, auteur prévenu", async () => {
    const w = await world();
    const s = await ok(w.kenji, { ...tagStructure(w.structure.id), caption: "Le Lydia !" });
    clock.advance(3 * HOUR);
    const res = await share(w.co, s.id, { asStructureId: w.structure.id });
    expect(res.status, JSON.stringify(res.json)).toBe(201);
    const [original] = await db.select().from(stories).where(eq(stories.id, s.id));
    const [copy] = await db.select().from(stories).where(eq(stories.id, res.json.id));
    expect(copy).toMatchObject({
      persona: "organizer",
      structureId: w.structure.id,
      audience: "public",
      authorId: w.co.id,
      sharedFromStoryId: s.id,
      sharedByUserId: w.co.id,
      caption: "Le Lydia !",
      status: "ready",
      plateState: original?.plateState,
    });
    // Même expiration que l'originale (jamais prolongée), un fichier à elle.
    expect(copy?.expiresAt.getTime()).toBe(original?.expiresAt.getTime());
    expect(copy?.storageKey).not.toBe(original?.storageKey);
    expect(await storage.get(copy?.storageKey ?? "")).not.toBeNull();
    // Elle paraît sous la structure avec le crédit, visible de tout membre ; aucune identification recopiée.
    const view = (await byAuthor(w.stranger, `s:${w.structure.id}`)).json;
    expect(view.author.pseudoOrName).toBe("Club de test");
    expect(view.stories).toHaveLength(1);
    expect(view.stories[0].sharedFrom).toMatchObject({ kind: "user", name: "Kenji_66", slug: "Kenji_66" });
    expect(view.stories[0].tags).toEqual([]);
    expect(view.stories[0].sharing).toBeNull();
    // Une copie ne sort jamais d'Orasso (fusion R7h × R7f4) : ni « Vers l'extérieur » ni export, même pour qui l'a ajoutée.
    expect(view.stories[0].exportable).toBe(false);
    expect((await byAuthor(w.co, `s:${w.structure.id}`)).json.stories[0].exportable).toBe(false);
    const exported = await req(w.co, "GET", `/stories/${res.json.id}/export`);
    expect(exported.status).toBe(403);
    expect(exported.json.error?.code ?? exported.json.code).toBe("author_only");
    // L'auteur est prévenu, sans image, sans le compte personnel de qui a ajouté.
    const [n] = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, w.kenji.id), eq(notifications.type, "story_shared_by_organizer")));
    expect(n).toBeTruthy();
    expect(JSON.stringify(n?.data)).not.toContain(w.co.id);
    expect(JSON.stringify(n?.data)).not.toContain("media");
  });

  it("refuse : staff, non identifié, étranger, sa propre story ; doublon 409 (aussi entre deux co-organisateurs)", async () => {
    const w = await world();
    const s = await ok(w.kenji, tagStructure(w.structure.id));
    const withBody = { asStructureId: w.structure.id };
    expect((await share(w.staff, s.id, withBody)).status).toBe(403);
    expect((await share(w.stranger, s.id, withBody)).status).toBe(403);
    // Kenji n'est pas membre de la structure : refusé avant même de regarder la story (403).
    expect((await share(w.kenji, s.id, withBody)).status).toBe(403);
    // Une structure non identifiée.
    const otherOwner = await signUp("Autre_66", { twoFactor: true });
    const other = await createStructure(otherOwner.id);
    const res = await share(otherOwner, s.id, { asStructureId: other.id });
    expect(res.status).toBe(403);
    expect(res.json.error?.code ?? res.json.code).toBe("not_tagged");
    // Sa propre story.
    const mine = await ok(w.owner, { persona: "organizer", structureId: w.structure.id });
    expect((await share(w.owner, mine.id, withBody)).status).toBe(400);
    // Doublon.
    expect((await share(w.owner, s.id, withBody)).status).toBe(201);
    const again = await share(w.co, s.id, withBody);
    expect(again.status).toBe(409);
    expect(again.json.error?.code ?? again.json.code).toBe("already_shared");
    // Deux ajouts simultanés : un seul gagne.
    const t2 = await ok(w.kenji, tagStructure(w.structure.id));
    const both = await Promise.all([share(w.owner, t2.id, withBody), share(w.co, t2.id, withBody)]);
    expect(both.map((r) => r.status).sort()).toEqual([201, 409]);
    const n = await db.select().from(stories).where(eq(stories.sharedFromStoryId, t2.id));
    expect(n).toHaveLength(1);
  });

  it("refuse une story de crew (403 crew_only) et celle d'un compte privé (403) : une copie n'élargit jamais le public", async () => {
    const w = await world();
    const crew = await req(w.kenji, "POST", "/crews", { name: "Crew copie", department: "66" });
    const c = await ok(w.kenji, { audience: "crew", crewId: crew.json.id, persona: "fan" });
    await db.insert(storyTags).values({ storyId: c.id, targetKind: "structure", targetId: w.structure.id });
    const refused = await share(w.owner, c.id, { asStructureId: w.structure.id });
    expect(refused.status).toBe(403);
    expect(refused.json.error?.code ?? refused.json.code).toBe("crew_only");

    const s = await ok(w.kenji, tagStructure(w.structure.id));
    await makePrivate(w.kenji);
    const priv = await share(w.owner, s.id, { asStructureId: w.structure.id });
    expect(priv.status).toBe(403);
    expect(priv.json.error?.code ?? priv.json.code).toBe("share_private");
    expect(await db.select().from(stories).where(eq(stories.sharedFromStoryId, s.id))).toHaveLength(0);
  });

  it("une story expirée, supprimée ou inconnue : 404 ; sans session : 401 ; casquette inconnue : 403", async () => {
    const w = await world();
    const s = await ok(w.kenji, tagStructure(w.structure.id));
    expect((await req(null, "POST", `/stories/${s.id}/share-to-mine`, {})).status).toBe(401);
    expect(
      (await share(w.owner, "00000000-0000-4000-8000-000000000000", { asStructureId: w.structure.id })).status,
    ).toBe(404);
    expect((await share(w.owner, s.id, { asStructureId: w.structure.id, asProId: w.structure.id })).status).toBe(400);
    await req(w.kenji, "DELETE", `/me/stories/${s.id}`);
    expect((await share(w.owner, s.id, { asStructureId: w.structure.id })).status).toBe(404);
    const t = await ok(w.kenji, tagStructure(w.structure.id));
    clock.advance(25 * HOUR);
    expect((await share(w.owner, t.id, { asStructureId: w.structure.id })).status).toBe(404);
  });

  it("sharing : l'organisateur identifié voit ses options (et la copie faite), pas un autre", async () => {
    const w = await world();
    const s = await ok(w.kenji, tagStructure(w.structure.id));
    const before = (await byAuthor(w.owner, `u:${w.kenji.id}`)).json.stories[0];
    expect(before.sharing).toEqual({
      taggedMe: false,
      options: [{ as: "structure", id: w.structure.id, name: "Club de test", copyId: null }],
    });
    expect((await byAuthor(w.stranger, `u:${w.kenji.id}`)).json.stories[0].sharing).toBeNull();
    // Le staff n'a pas la main sur l'ajout.
    expect((await byAuthor(w.staff, `u:${w.kenji.id}`)).json.stories[0].sharing).toBeNull();
    const copy = (await share(w.owner, s.id, { asStructureId: w.structure.id })).json;
    const after = (await byAuthor(w.co, `u:${w.kenji.id}`)).json.stories[0];
    expect(after.sharing.options[0].copyId).toBe(copy.id);
    // La personne qui a publié ne voit rien.
    expect((await byAuthor(w.kenji, `u:${w.kenji.id}`)).json.stories[0].sharing).toBeNull();
  });
});

describe("« Retirer » et la cascade", () => {
  it("« Retirer » une copie : par un responsable de la structure, l'originale reste, son fichier aussi", async () => {
    const w = await world();
    const s = await ok(w.kenji, tagStructure(w.structure.id));
    const copy = (await share(w.owner, s.id, { asStructureId: w.structure.id })).json;
    const [orig] = await db.select().from(stories).where(eq(stories.id, s.id));
    expect((await req(w.stranger, "DELETE", `/me/stories/${copy.id}`)).status).toBe(404);
    expect((await req(w.staff, "DELETE", `/me/stories/${copy.id}`)).status).toBe(404);
    // Le co-organisateur n'a pas publié la copie, mais gère la structure.
    expect((await req(w.co, "DELETE", `/me/stories/${copy.id}`)).status).toBe(204);
    const [gone] = await db.select().from(stories).where(eq(stories.id, copy.id));
    expect(gone?.deletedAt).not.toBeNull();
    const [still] = await db.select().from(stories).where(eq(stories.id, s.id));
    expect(still?.deletedAt).toBeNull();
    expect(await storage.get(orig?.storageKey ?? "")).not.toBeNull();
    expect(await storage.get(gone?.storageKey ?? "")).toBeNull();
    expect((await byAuthor(w.stranger, `s:${w.structure.id}`)).json.stories).toHaveLength(0);
    // Et on peut l'ajouter de nouveau.
    expect((await share(w.owner, s.id, { asStructureId: w.structure.id })).status).toBe(201);
  });

  it("l'auteur supprime l'originale : les copies et leurs fichiers partent avec elle (et la barre, la liste)", async () => {
    const w = await world();
    const s = await ok(w.kenji, tagStructure(w.structure.id));
    const copy = (await share(w.owner, s.id, { asStructureId: w.structure.id })).json;
    const [c] = await db.select().from(stories).where(eq(stories.id, copy.id));
    expect((await req(w.kenji, "DELETE", `/me/stories/${s.id}`)).status).toBe(204);
    const [gone] = await db.select().from(stories).where(eq(stories.id, copy.id));
    expect(gone?.deletedAt).not.toBeNull();
    expect(await storage.get(c?.storageKey ?? "")).toBeNull();
    expect((await byAuthor(w.stranger, `s:${w.structure.id}`)).json.stories).toHaveLength(0);
    expect((await req(w.stranger, "GET", `/stories/${copy.id}/thumb`)).status).toBe(404);
  });

  it("l'identification retirée par la structure : sa copie tombe, la story d'origine reste", async () => {
    const w = await world();
    const s = await ok(w.kenji, tagStructure(w.structure.id));
    const copy = (await share(w.owner, s.id, { asStructureId: w.structure.id })).json;
    expect(
      (await req(w.co, "POST", `/me/story-tags/${s.id}/remove`, { kind: "structure", id: w.structure.id })).status,
    ).toBe(204);
    const [gone] = await db.select().from(stories).where(eq(stories.id, copy.id));
    expect(gone?.deletedAt).not.toBeNull();
    const [orig] = await db.select().from(stories).where(eq(stories.id, s.id));
    expect(orig?.deletedAt).toBeNull();
    // Plus d'identification : plus d'ajout.
    expect((await share(w.owner, s.id, { asStructureId: w.structure.id })).status).toBe(403);
  });

  it("la copie expire avec l'originale (la tâche d'expiration)", async () => {
    const w = await world();
    const s = await ok(w.kenji, tagStructure(w.structure.id));
    clock.advance(2 * HOUR);
    const copy = (await share(w.owner, s.id, { asStructureId: w.structure.id })).json;
    clock.advance(23 * HOUR);
    expect((await byAuthor(w.stranger, `s:${w.structure.id}`)).json.stories).toHaveLength(0);
    await storiesExpire.run();
    const rows = await db.select().from(stories).where(sql`${stories.id} in (${s.id}, ${copy.id})`);
    expect(rows.every((r) => r.deletedAt !== null)).toBe(true);
  });

  it("un compte qui passe en privé : les copies de ses stories tombent, pas celles des autres", async () => {
    const w = await world();
    const lea = await signUp("Lea_11");
    const a = await ok(w.kenji, tagStructure(w.structure.id));
    const b = await ok(lea, tagStructure(w.structure.id));
    const ca = (await share(w.owner, a.id, { asStructureId: w.structure.id })).json;
    const cb = (await share(w.owner, b.id, { asStructureId: w.structure.id })).json;
    const res = await req(w.kenji, "PATCH", "/me/settings", { visibility: "private" });
    expect(res.status, JSON.stringify(res.json)).toBe(200);
    const [x] = await db.select().from(stories).where(eq(stories.id, ca.id));
    const [y] = await db.select().from(stories).where(eq(stories.id, cb.id));
    expect(x?.deletedAt).not.toBeNull();
    expect(y?.deletedAt).toBeNull();
  });

  it("le compte supprimé de l'auteur emporte aussi les copies", async () => {
    const w = await world();
    const s = await ok(w.kenji, tagStructure(w.structure.id));
    const copy = (await share(w.owner, s.id, { asStructureId: w.structure.id })).json;
    await db.update(stories).set({ deletedAt: clock.now }).where(eq(stories.id, s.id));
    await storiesExpire.run();
    const [gone] = await db.select().from(stories).where(eq(stories.id, copy.id));
    expect(gone?.deletedAt).not.toBeNull();
  });
});

describe("repartage par un identifié", () => {
  it("un identifié repartage à ses abonnés (jamais plus large), crédité, l'auteur prévenu ; doublon 409", async () => {
    const w = await world();
    const damien = await signUp("Damien_66");
    const s = await ok(w.kenji, { tags: [{ kind: "user", id: damien.id }] });
    const res = await share(damien, s.id);
    expect(res.status, JSON.stringify(res.json)).toBe(201);
    const [copy] = await db.select().from(stories).where(eq(stories.id, res.json.id));
    expect(copy).toMatchObject({ persona: "fan", audience: "followers", authorId: damien.id, sharedFromStoryId: s.id });
    expect((await share(damien, s.id)).status).toBe(409);
    // Il voit ses options : « fan », puis la copie.
    const seen = (await byAuthor(damien, `u:${w.kenji.id}`)).json.stories[0];
    expect(seen.sharing).toEqual({
      taggedMe: true,
      options: [{ as: "fan", id: null, name: "Damien_66", copyId: res.json.id }],
    });
    // Un compte privé repartage pour ses abonnés seulement : l'étranger ne la voit pas.
    await makePrivate(damien);
    expect((await byAuthor(w.stranger, `u:${damien.id}`)).json.stories).toHaveLength(0);
    await follow(w.stranger, damien);
    expect((await byAuthor(w.stranger, `u:${damien.id}`)).json.stories).toHaveLength(1);
  });

  it("l'identifié retire son identification : sa copie tombe ; un non identifié ne repartage pas", async () => {
    const w = await world();
    const damien = await signUp("Damien_66");
    const s = await ok(w.kenji, { tags: [{ kind: "user", id: damien.id }] });
    expect((await share(w.stranger, s.id)).status).toBe(403);
    const copy = (await share(damien, s.id)).json;
    expect((await req(damien, "POST", `/me/story-tags/${s.id}/remove`)).status).toBe(204);
    const [gone] = await db.select().from(stories).where(eq(stories.id, copy.id));
    expect(gone?.deletedAt).not.toBeNull();
    expect((await share(damien, s.id)).status).toBe(403);
  });

  it("une story d'un compte privé n'est jamais repartagée, même par une personne identifiée qui la voit", async () => {
    const w = await world();
    const marc = await signUp("Marc_66");
    const damien = await signUp("Damien_66");
    await follow(damien, marc);
    await makePrivate(marc);
    const s = await ok(marc, { audience: "followers", tags: [{ kind: "user", id: damien.id }] });
    expect((await byAuthor(damien, `u:${marc.id}`)).json.stories[0].sharing).toBeNull();
    const res = await share(damien, s.id);
    expect(res.status).toBe(403);
    expect(res.json.error?.code ?? res.json.code).toBe("share_private");
    expect(w.owner).toBeTruthy();
  });

  it("au nom d'un pro : seulement le propriétaire de la fiche identifiée (porte ouverte pour R7m2)", async () => {
    const w = await world();
    const proOwner = await signUp("Pro_66");
    const pro = await createPro(proOwner.id);
    const s = await ok(w.kenji, { tags: [{ kind: "pro", id: pro.id }] });
    expect((await share(w.stranger, s.id, { asProId: pro.id })).status).toBe(403);
    expect((await share(proOwner, s.id, { asProId: randomId() })).status).toBe(403);
    const res = await share(proOwner, s.id, { asProId: pro.id });
    expect(res.status, JSON.stringify(res.json)).toBe(201);
    const [copy] = await db.select().from(stories).where(eq(stories.id, res.json.id));
    expect(copy).toMatchObject({ persona: "pro", proId: pro.id, audience: "public", structureId: null });
  });
});

function randomId() {
  return "11111111-2222-4333-8444-555555555555";
}

describe("anneau « EN COURS », fiche et Accueil", () => {
  async function runningWorld() {
    const w = await world();
    const event = await createEvent(w.structure.id, {
      startsAt: new Date(clock.now.getTime() - 2 * HOUR),
      endsAt: new Date(clock.now.getTime() + 6 * HOUR),
      title: "Rassemblement du Lydia",
    });
    const visitor = await signUp("Damien_66");
    const car = await createVehicle(visitor.id, ref);
    await db.insert(applications).values({
      eventId: event.id,
      userId: visitor.id,
      vehicleId: car.id,
      status: "accepted",
      rulesAcceptedAt: clock.now,
      followStructure: false,
    });
    return { ...w, event, visitor };
  }

  it("`live` seulement pendant l'événement et avec une story vivante ; avant et après : anneau ordinaire", async () => {
    const w = await runningWorld();
    await structureFollowBy(w.stranger, w.structure.id);
    await ok(w.owner, { persona: "organizer", structureId: w.structure.id });
    const ring = async (u: TestUser) =>
      (await req(u, "GET", "/stories/bar")).json.authors.find((a: { key: string }) => a.key === `s:${w.structure.id}`)
        ?.ring;
    expect(await ring(w.stranger)).toBe("live");
    // Après la fin : plus « EN COURS ».
    clock.advance(7 * HOUR);
    expect(await ring(w.stranger)).toBe("followers");
  });

  it("avant le début : anneau ordinaire", async () => {
    const w = await world();
    await createEvent(w.structure.id, { startsAt: new Date(clock.now.getTime() + 5 * HOUR) });
    await structureFollowBy(w.stranger, w.structure.id);
    await ok(w.owner, { persona: "organizer", structureId: w.structure.id });
    const bar = (await req(w.stranger, "GET", "/stories/bar")).json;
    expect(bar.authors.find((a: { key: string }) => a.key === `s:${w.structure.id}`)?.ring).toBe("followers");
  });

  it("sans story vivante, pas d'anneau même pendant l'événement ; un brouillon ne compte pas", async () => {
    const w = await world();
    await createEvent(w.structure.id, {
      startsAt: new Date(clock.now.getTime() - HOUR),
      endsAt: new Date(clock.now.getTime() + HOUR),
      status: "draft",
    });
    await structureFollowBy(w.stranger, w.structure.id);
    expect((await req(w.stranger, "GET", "/stories/bar")).json.authors).toEqual([]);
    await ok(w.owner, { persona: "organizer", structureId: w.structure.id });
    const bar = (await req(w.stranger, "GET", "/stories/bar")).json;
    expect(bar.authors[0].ring).toBe("followers");
  });

  it("un participant avec une place voit l'organisateur « EN COURS » dans sa barre sans le suivre", async () => {
    const w = await runningWorld();
    const s = await ok(w.kenji, tagStructure(w.structure.id));
    const copy = (await share(w.owner, s.id, { asStructureId: w.structure.id })).json;
    expect(copy.id).toBeTruthy();
    const bar = (await req(w.visitor, "GET", "/stories/bar")).json;
    const entry = bar.authors.find((a: { key: string }) => a.key === `s:${w.structure.id}`);
    expect(entry).toMatchObject({ ring: "live", pseudoOrName: "Club de test", hasUnseen: true });
    // Un étranger sans place ni abonnement ne la voit pas dans sa barre.
    expect((await req(w.stranger, "GET", "/stories/bar")).json.authors).toEqual([]);
    // Le résumé de la page de la structure porte aussi l'anneau.
    const page = await req(w.visitor, "GET", `/structures/by-slug/${w.structure.slug}`);
    expect(page.json.stories.ring).toBe("live");
  });

  it("organizerStoryAvailable sur la fiche (connecté seulement) et organizerStory sur l'Accueil", async () => {
    const w = await runningWorld();
    const fiche = (u: TestUser | null) => req(u, "GET", `/events/by-slug/${w.event.slug}`);
    expect((await fiche(w.visitor)).json.live.organizerStoryAvailable).toBe(false);
    expect((await req(w.visitor, "GET", "/me/home")).json.live.organizerStory).toBeNull();
    const story = await ok(w.owner, { persona: "organizer", structureId: w.structure.id });
    expect((await fiche(w.visitor)).json.live.organizerStoryAvailable).toBe(true);
    // Sans session, jamais.
    expect((await fiche(null)).json.live?.organizerStoryAvailable ?? false).toBe(false);
    const home = (await req(w.visitor, "GET", "/me/home")).json.live;
    expect(home.organizerStory.structureKey).toBe(`s:${w.structure.id}`);
    expect(home.organizerStory.posterUrl).toMatch(new RegExp(`^/api/stories/${story.id}/media/[0-9a-f]{16}\\.webp$`));
    expect(Object.keys(home.organizerStory).sort()).toEqual(["posterUrl", "structureKey"]);
  });
});

async function structureFollowBy(u: TestUser, structureId: string) {
  await db.insert(structureFollows).values({ structureId, userId: u.id, source: "manual" });
}
