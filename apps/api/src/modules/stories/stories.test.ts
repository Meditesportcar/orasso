// Stories photo (lot R7f1) : composition 9:16, plaque obligatoire pour toute audience, audiences × regards, barre, fichiers,
// vues et flammes, réponses, signalement, identification, expiration. Aucune plaque lisible : les photos d'essai sont
// du bruit coloré.
import { fitDefault, fromWallTime, HOUR, mapRect, STORY_H, STORY_W } from "@orasso/shared";
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
  crewMembers,
  messages,
  notifications,
  profiles,
  reports,
  stories,
  storyTags,
  structureFollows,
  userFollows,
} from "../../db/schema";
import { resetRateLimits } from "../../lib/rateLimit";
import { storage } from "../../lib/storage";
import { storyThumbFor } from "../messaging/story-thumb";
import { reportMediaOf } from "../moderation/media";
import { composeStoryPhoto } from "./compose";
import { storiesExpire } from "./expire";

afterAll(async () => {
  await pool.end();
});

const ORIGIN = process.env.PUBLIC_URL ?? "http://localhost:5173";
let clock: ReturnType<typeof useClock>;
let ref: Awaited<ReturnType<typeof seedReference>>;

beforeEach(async () => {
  await resetDb();
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
  const buf = Buffer.from(await res.arrayBuffer());
  const text = buf.toString("utf8");
  // biome-ignore lint/suspicious/noExplicitAny: réponses JSON lues librement dans les tests
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json, buf, headers: res.headers };
}

/** Photo d'essai : un bruit coloré (très « texturé »), sans aucun texte ni plaque. */
async function photo(width = 1600, height = 900) {
  const raw = Buffer.alloc(width * height * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 2654435761) % 251;
  return sharp(raw, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 95 })
    .toBuffer();
}

async function upload(u: TestUser, data?: Buffer, purpose = "story") {
  const form = new FormData();
  form.append("purpose", purpose);
  form.append("file", new File([new Uint8Array(data ?? (await photo()))], "photo.jpg", { type: "image/jpeg" }));
  const res = await app.request("/api/me/uploads", {
    method: "POST",
    headers: { origin: ORIGIN, cookie: u.cookie },
    body: form,
  });
  return { status: res.status, json: (await res.json()) as { key: string } };
}

type Over = Record<string, unknown>;
async function publish(u: TestUser, over: Over = {}, data?: Buffer) {
  const up = await upload(u, data);
  expect(up.status).toBe(201);
  return req(u, "POST", "/me/stories", { uploadKey: up.json.key, noPlateConfirmed: true, audience: "public", ...over });
}
async function ok(u: TestUser, over: Over = {}) {
  const res = await publish(u, over);
  expect(res.status, JSON.stringify(res.json)).toBe(201);
  return res.json as { id: string; status: string; skipped: unknown[] };
}

async function follow(a: TestUser, b: TestUser) {
  await req(a, "POST", `/users/${b.pseudo}/follow`);
  await db
    .update(userFollows)
    .set({ status: "accepted", acceptedAt: clock.now })
    .where(and(eq(userFollows.followerId, a.id), eq(userFollows.followedId, b.id)));
}
const makePrivate = (u: TestUser) => db.update(profiles).set({ visibility: "private" }).where(eq(profiles.userId, u.id));

let crewCounter = 0;
async function newCrew(leader: TestUser) {
  const res = await req(leader, "POST", "/crews", { name: `Crew story ${++crewCounter}`, department: "66" });
  expect(res.status).toBe(201);
  return res.json as { id: string };
}
async function addToCrew(crewId: string, leader: TestUser, member: TestUser) {
  expect((await req(member, "POST", `/crews/${crewId}/requests`, { message: null })).status).toBe(201);
  expect((await req(leader, "POST", `/crews/${crewId}/requests/${member.id}/accept`)).status).toBe(204);
}

const byAuthor = (u: TestUser, key: string) => req(u, "GET", `/stories/by-author/${key}`);
const keyOf = (u: TestUser) => `u:${u.id}`;
const fileUrl = (view: { mediaUrl: string }) => view.mediaUrl.replace(/^\/api/, "");

describe("composition 9:16", () => {
  it("rend 1080 × 1920 en WebP pour une photo paysage, portrait ou carrée, et ne garde pas l'original", async () => {
    const kenji = await signUp("Kenji");
    for (const [w, h] of [
      [1600, 900],
      [900, 1600],
      [1000, 1000],
    ] as const) {
      const res = await publish(kenji, {}, await photo(w, h));
      expect(res.status).toBe(201);
    }
    const list = (await req(kenji, "GET", "/me/stories")).json.stories as { mediaUrl: string }[];
    expect(list).toHaveLength(3);
    for (const s of list) {
      const file = await req(kenji, "GET", fileUrl(s));
      expect(file.status).toBe(200);
      const meta = await sharp(file.buf).metadata();
      expect([meta.width, meta.height, meta.format]).toEqual([STORY_W, STORY_H, "webp"]);
    }
    // L'envoi d'origine est supprimé (aucun original conservé) et consommé.
    const left = await db.query.uploads.findMany({});
    expect(left.filter((u) => u.purpose === "story" && !u.consumedAt)).toHaveLength(0);
  });

  it("le rectangle de plaque, transformé par le cadrage, est réellement flouté (variance de la zone)", async () => {
    const src = await photo(1600, 900);
    const rect = { x: 0.4, y: 0.45, w: 0.2, h: 0.1 };
    const frame = { scale: 1.6, offsetX: 120, offsetY: -200 };
    const plain = await composeStoryPhoto(src, { frame });
    const blurred = await composeStoryPhoto(src, { frame, rects: [rect] });
    const mapped = mapRect(rect, frame, { width: 1600, height: 900 });
    const region = {
      left: Math.round(mapped.x * STORY_W),
      top: Math.round(mapped.y * STORY_H),
      width: Math.round(mapped.w * STORY_W),
      height: Math.round(mapped.h * STORY_H),
    };
    expect(region.left).toBeGreaterThanOrEqual(0);
    expect(region.left + region.width).toBeLessThanOrEqual(STORY_W);
    const variance = async (data: Buffer, r = region) => {
      const { data: px } = await sharp(data).extract(r).greyscale().raw().toBuffer({ resolveWithObject: true });
      const mean = px.reduce((a, b) => a + b, 0) / px.length;
      return px.reduce((a, b) => a + (b - mean) ** 2, 0) / px.length;
    };
    const before = await variance(plain.data);
    const after = await variance(blurred.data);
    expect(before).toBeGreaterThan(500);
    expect(after).toBeLessThan(before * 0.15);
    // Ailleurs, rien ne change : une zone loin de la plaque garde sa texture.
    const far = { left: 20, top: 1600, width: 200, height: 200 };
    expect(Math.abs((await variance(blurred.data, far)) - (await variance(plain.data, far)))).toBeLessThan(40);
    expect(blurred.blurredRects).toHaveLength(1);
  });

  it("un rectangle entièrement hors du cadre zoomé n'est pas appliqué, la décision reste « floutée »", async () => {
    const kenji = await signUp("Kenji");
    const res = await publish(kenji, {
      noPlateConfirmed: undefined,
      plateRects: [{ x: 0.01, y: 0.01, w: 0.05, h: 0.05 }],
      frame: { scale: 4, offsetX: 0, offsetY: 0 },
    });
    expect(res.status).toBe(201);
    const [row] = await db.select().from(stories);
    expect(row?.plateState).toBe("blurred");
  });

  it("valeurs de cadrage hors bornes refusées (400)", async () => {
    const kenji = await signUp("Kenji");
    expect((await publish(kenji, { frame: { scale: 9, offsetX: 0, offsetY: 0 } })).status).toBe(400);
    expect((await publish(kenji, { frame: { scale: 1, offsetX: 99999, offsetY: 0 } })).status).toBe(400);
  });
});

describe("plaque obligatoire", () => {
  it("sans décision : 400 plate_decision_required, pour chaque audience, crew compris", async () => {
    const kenji = await signUp("Kenji");
    const nina = await signUp("Nina");
    const crew = await newCrew(kenji);
    await addToCrew(crew.id, kenji, nina);
    for (const over of [{ audience: "public" }, { audience: "followers" }, { audience: "crew", crewId: crew.id }]) {
      const res = await publish(kenji, { ...over, noPlateConfirmed: undefined });
      expect(res.status).toBe(400);
      expect(res.json.error.code).toBe("plate_decision_required");
      const empty = await publish(kenji, { ...over, noPlateConfirmed: false, plateRects: [] });
      expect(empty.json.error.code).toBe("plate_decision_required");
    }
    expect(await db.select().from(stories)).toHaveLength(0);
  });

  it("floutée et « aucune plaque » ensemble : refusé ; chaque décision pose son état", async () => {
    const kenji = await signUp("Kenji");
    const both = await publish(kenji, { plateRects: [{ x: 0.1, y: 0.1, w: 0.2, h: 0.1 }], noPlateConfirmed: true });
    expect(both.status).toBe(400);
    await ok(kenji, { plateRects: [{ x: 0.1, y: 0.1, w: 0.2, h: 0.1 }], noPlateConfirmed: undefined });
    await ok(kenji, {});
    const states = (await db.select().from(stories)).map((s) => s.plateState).sort();
    expect(states).toEqual(["blurred", "none_confirmed"]);
  });

  it("la base refuse aussi une story prête sans décision, et « not_required » sur une photo", async () => {
    const kenji = await signUp("Kenji");
    const base = {
      authorId: kenji.id,
      audience: "public" as const,
      storageKey: "private/stories/x/y.webp",
      expiresAt: new Date(clock.now.getTime() + HOUR),
    };
    await expect(db.insert(stories).values({ ...base, plateState: null })).rejects.toThrow();
    await expect(db.insert(stories).values({ ...base, plateState: "not_required" })).rejects.toThrow();
    await expect(
      db.insert(stories).values({ ...base, mediaKind: "video", plateState: "not_required" }),
    ).resolves.toBeDefined();
  });

  it("la vidéo est déclarée mais refusée (501 « Vidéo bientôt »)", async () => {
    const kenji = await signUp("Kenji");
    const up = await upload(kenji, Buffer.from("x"), "story_video");
    expect(up.status).toBe(501);
  });
});

describe("audiences × regards", () => {
  it("public : tout membre connecté ; sans session : 401", async () => {
    const kenji = await signUp("Kenji");
    const nina = await signUp("Nina");
    const s = await ok(kenji, { audience: "public" });
    const list = (await byAuthor(nina, keyOf(kenji))).json;
    expect(list.stories.map((x: { id: string }) => x.id)).toEqual([s.id]);
    expect((await byAuthor(null as unknown as TestUser, keyOf(kenji))).status).toBe(401);
    expect((await req(null, "GET", fileUrl(list.stories[0]))).status).toBe(401);
  });

  it("abonnés d'un compte public : tout membre connecté", async () => {
    const kenji = await signUp("Kenji");
    const nina = await signUp("Nina");
    await ok(kenji, { audience: "followers" });
    expect((await byAuthor(nina, keyOf(kenji))).json.stories).toHaveLength(1);
  });

  it("abonnés d'un compte privé : abonné accepté oui ; demande en attente, inconnu : non, sans rien révéler", async () => {
    const kenji = await signUp("Kenji");
    await makePrivate(kenji);
    const accepted = await signUp("Acceptee");
    const pending = await signUp("Attente");
    const stranger = await signUp("Inconnu");
    await follow(accepted, kenji);
    await req(pending, "POST", `/users/${kenji.pseudo}/follow`);
    const s = await ok(kenji, { audience: "followers" });
    expect((await byAuthor(accepted, keyOf(kenji))).json.stories).toHaveLength(1);
    for (const u of [pending, stranger]) {
      const res = await byAuthor(u, keyOf(kenji));
      expect(res.status).toBe(200);
      expect(res.json).toEqual({ author: null, stories: [] });
      const bar = (await req(u, "GET", "/stories/bar")).json;
      expect(bar.authors).toEqual([]);
      const file = await req(u, "GET", `/stories/${s.id}/media/${"0".repeat(16)}.webp`);
      expect([403, 404]).toContain(file.status);
      const profile = (await req(u, "GET", `/users/${kenji.pseudo}`)).json;
      expect(profile.stories).toEqual({ count: 0, hasUnseen: false, ring: null });
    }
    const asFollower = (await req(accepted, "GET", `/users/${kenji.pseudo}`)).json;
    expect(asFollower.stories).toMatchObject({ count: 1, hasUnseen: true, ring: "followers" });
  });

  it("un compte privé ne publie pas en public (400)", async () => {
    const kenji = await signUp("Kenji");
    await makePrivate(kenji);
    expect((await publish(kenji, { audience: "public" })).status).toBe(400);
    expect((await publish(kenji, { audience: "followers" })).status).toBe(201);
  });

  it("crew : membre actif oui ; non-membre et ancien membre 403 crew_only, hors barre, hors profil", async () => {
    const kenji = await signUp("Kenji");
    const nina = await signUp("Nina");
    const paul = await signUp("Paul");
    const ancien = await signUp("Ancien");
    const crew = await newCrew(kenji);
    await addToCrew(crew.id, kenji, nina);
    await addToCrew(crew.id, kenji, ancien);
    await follow(paul, kenji);
    await follow(ancien, kenji);
    const s = await ok(kenji, { audience: "crew", crewId: crew.id });
    const ninaView = (await byAuthor(nina, keyOf(kenji))).json;
    expect(ninaView.stories).toHaveLength(1);
    expect(ninaView.stories[0].crewName).toBeTruthy();
    const bar = (await req(nina, "GET", "/stories/bar")).json;
    expect(bar.authors[0]).toMatchObject({ key: keyOf(kenji), ring: "crew" });
    await db
      .update(crewMembers)
      .set({ status: "left" })
      .where(and(eq(crewMembers.crewId, crew.id), eq(crewMembers.userId, ancien.id)));
    const file = ninaView.stories[0].mediaUrl.replace("/api", "");
    expect((await req(nina, "GET", file)).status).toBe(200);
    for (const u of [paul, ancien]) {
      const res = await req(u, "GET", file);
      expect(res.status).toBe(403);
      expect(res.json.error.code).toBe("crew_only");
      expect((await req(u, "GET", "/stories/bar")).json.authors).toEqual([]);
      expect((await byAuthor(u, keyOf(kenji))).json.stories).toEqual([]);
      expect((await req(u, "GET", `/users/${kenji.pseudo}`)).json.stories.count).toBe(0);
      expect((await req(u, "POST", `/stories/${s.id}/view`)).status).toBe(403);
      expect((await req(u, "PUT", `/stories/${s.id}/reaction`)).status).toBe(403);
    }
  });

  it("crew : seul un passionné membre actif peut publier pour son crew", async () => {
    const kenji = await signUp("Kenji");
    const paul = await signUp("Paul");
    const crew = await newCrew(kenji);
    expect((await publish(paul, { audience: "crew", crewId: crew.id })).status).toBe(403);
    expect((await publish(kenji, { audience: "crew" })).status).toBe(400);
    expect((await publish(kenji, { audience: "followers", crewId: crew.id })).status).toBe(400);
    const structure = await createStructure(kenji.id);
    const orga = await publish(kenji, { audience: "crew", crewId: crew.id, persona: "organizer", structureId: structure.id });
    expect(orga.status).toBe(400);
  });

  it("casquette organisateur : un non-membre de la structure est refusé (403), le propriétaire passe et la story paraît sous la structure", async () => {
    const orga = await signUp("Orga");
    const co = await signUp("Coorga");
    const stranger = await signUp("Intrus");
    const fan = await signUp("Fan");
    const structure = await createStructure(orga.id);
    await addMember(structure.id, co.id, "co_organizer");
    const staff = await signUp("Staff");
    await addMember(structure.id, staff.id, "staff");
    expect((await publish(stranger, { persona: "organizer", structureId: structure.id })).status).toBe(403);
    expect((await publish(staff, { persona: "organizer", structureId: structure.id })).status).toBe(403);
    await ok(co, { persona: "organizer", structureId: structure.id, audience: "followers" });
    await db.insert(structureFollows).values({ structureId: structure.id, userId: fan.id, source: "manual" });
    const bar = (await req(fan, "GET", "/stories/bar")).json;
    expect(bar.authors).toHaveLength(1);
    expect(bar.authors[0].key).toBe(`s:${structure.id}`);
    expect(bar.authors[0].pseudoOrName).toBe("Club de test");
    const view = (await byAuthor(fan, `s:${structure.id}`)).json;
    expect(view.stories).toHaveLength(1);
    // Rien sous le compte personnel du co-organisateur.
    expect((await byAuthor(fan, keyOf(co))).json.stories).toEqual([]);
    const pub = await req(null, "GET", `/structures/by-slug/${structure.slug}`);
    expect(pub.json.stories).toEqual({ count: 0, hasUnseen: false, ring: null });
    const asFan = await req(fan, "GET", `/structures/by-slug/${structure.slug}`);
    expect(asFan.json.stories).toMatchObject({ count: 1, hasUnseen: true, ring: "followers" });
  });

  it("casquette pro : le propriétaire de la fiche seulement", async () => {
    const owner = await signUp("Pro");
    const other = await signUp("Autre");
    const pro = await createPro(owner.id);
    expect((await publish(other, { persona: "pro", proId: pro.id })).status).toBe(403);
    expect((await publish(owner, { persona: "pro" })).status).toBe(400);
    await ok(owner, { persona: "pro", proId: pro.id });
    expect((await byAuthor(other, `p:${pro.id}`)).json.stories).toHaveLength(1);
    expect((await req(other, "GET", `/pros/by-slug/${pro.slug}`)).json.stories.count).toBe(1);
  });

  it("auteur suspendu : ses stories disparaissent pour les autres ; il ne peut plus publier", async () => {
    const kenji = await signUp("Kenji");
    const nina = await signUp("Nina");
    await ok(kenji, {});
    const up = await upload(kenji);
    await db.update(profiles).set({ suspendedUntil: new Date(clock.now.getTime() + 24 * HOUR) }).where(eq(profiles.userId, kenji.id));
    expect((await byAuthor(nina, keyOf(kenji))).json.stories).toEqual([]);
    const res = await req(kenji, "POST", "/me/stories", { uploadKey: up.json.key, noPlateConfirmed: true, audience: "public" });
    expect(res.status).toBe(403);
  });
});

describe("barre", () => {
  it("une entrée par auteur, non vues d'abord, mutes exclus, compte privé non suivi absent", async () => {
    const me = await signUp("Moi");
    const a = await signUp("Anna");
    const b = await signUp("Bruno");
    const c = await signUp("Carla");
    const d = await signUp("Dora");
    for (const u of [a, b, c]) await follow(me, u);
    await makePrivate(d);
    await ok(a, {});
    await ok(a, {});
    clock.advance(HOUR);
    await ok(b, {});
    clock.advance(HOUR);
    await ok(c, {});
    await ok(d, { audience: "followers" });
    let bar = (await req(me, "GET", "/stories/bar")).json;
    expect(bar.authors.map((x: { key: string }) => x.key)).toEqual([keyOf(c), keyOf(b), keyOf(a)]);
    expect(bar.authors.every((x: { ring: string }) => x.ring === "followers")).toBe(true);
    // Un mute retire l'auteur de la barre, sans le prévenir ; le profil montre toujours ses stories.
    expect((await req(me, "PUT", `/me/story-mutes/${keyOf(b)}`)).status).toBe(204);
    bar = (await req(me, "GET", "/stories/bar")).json;
    expect(bar.authors.map((x: { key: string }) => x.key)).toEqual([keyOf(c), keyOf(a)]);
    expect((await req(me, "GET", `/users/${b.pseudo}`)).json.stories.count).toBe(1);
    expect((await req(me, "DELETE", `/me/story-mutes/${keyOf(b)}`)).status).toBe(204);
    // Après avoir vu les stories de Carla, elle passe après les non vues.
    const cs = (await byAuthor(me, keyOf(c))).json.stories[0];
    expect((await req(me, "POST", `/stories/${cs.id}/view`)).status).toBe(204);
    bar = (await req(me, "GET", "/stories/bar")).json;
    expect(bar.authors.map((x: { key: string }) => x.key)).toEqual([keyOf(b), keyOf(a), keyOf(c)]);
    expect(bar.authors[2].hasUnseen).toBe(false);
    expect(bar.mine).toBeNull();
    expect(JSON.stringify(bar)).not.toContain(d.pseudo);
  });

  it("mes propres stories : « mine », jamais dans la liste des autres ; mute de soi refusé", async () => {
    const me = await signUp("Moi");
    await ok(me, { audience: "followers" });
    const bar = (await req(me, "GET", "/stories/bar")).json;
    expect(bar.mine).toMatchObject({ count: 1, ring: "followers" });
    expect(bar.authors).toEqual([]);
    expect((await req(me, "PUT", `/me/story-mutes/${keyOf(me)}`)).status).toBe(400);
    expect((await req(me, "PUT", "/me/story-mutes/zz:1")).status).toBe(404);
  });
});

describe("fichiers et expiration", () => {
  it("403 pour qui ne voit pas, Cache-Control private, nom exact ; 404 après expiration", async () => {
    const kenji = await signUp("Kenji");
    const nina = await signUp("Nina");
    const paul = await signUp("Paul");
    await makePrivate(kenji);
    await follow(nina, kenji);
    await ok(kenji, { audience: "followers" });
    const view = (await byAuthor(nina, keyOf(kenji))).json.stories[0];
    const path = fileUrl(view);
    const good = await req(nina, "GET", path);
    expect(good.status).toBe(200);
    expect(good.headers.get("cache-control")).toBe("private, max-age=300");
    expect(good.headers.get("content-type")).toBe("image/webp");
    expect((await req(paul, "GET", path)).status).toBe(403);
    expect((await req(nina, "GET", path.replace(/[0-9a-f]{16}\.webp$/, `${"a".repeat(16)}.webp`))).status).toBe(404);
    expect((await req(nina, "GET", path.replace(/[0-9a-f]{16}\.webp$/, "../x.webp"))).status).toBe(404);
    clock.advance(24 * HOUR + 1000);
    for (const u of [nina, kenji]) expect((await req(u, "GET", path)).status).toBe(404);
    expect((await byAuthor(nina, keyOf(kenji))).json.stories).toEqual([]);
  });

  it("stories.expire : marque, efface le fichier, supprime la copie liée ; la ligne part 7 jours après", async () => {
    const kenji = await signUp("Kenji");
    const s = await ok(kenji, {});
    const [row] = await db.select().from(stories).where(eq(stories.id, s.id));
    const [copy] = await db
      .insert(stories)
      .values({
        authorId: kenji.id,
        audience: "public",
        storageKey: `private/stories/${s.id}/copie000000000.webp`,
        plateState: "none_confirmed",
        sharedFromStoryId: s.id,
        expiresAt: row!.expiresAt,
      })
      .returning();
    await storage.put(copy!.storageKey, Buffer.from("copie"));
    expect(await storage.get(row!.storageKey)).not.toBeNull();
    const early = await storiesExpire.run();
    expect(early.marked).toBe(0);
    clock.advance(24 * HOUR + 1000);
    const done = await storiesExpire.run();
    expect(done.marked).toBe(2);
    expect(done.files).toBe(2);
    expect(await storage.get(row!.storageKey)).toBeNull();
    expect(await storage.get(copy!.storageKey)).toBeNull();
    const after = await db.select().from(stories);
    expect(after.every((r) => r.deletedAt && r.filesRemovedAt)).toBe(true);
    clock.advance(8 * 24 * HOUR);
    const purge = await storiesExpire.run();
    expect(purge.purged).toBe(2);
    expect(await db.select().from(stories)).toHaveLength(0);
  });

  it("une story signalée garde son fichier à l'expiration, vue de la modération, jusqu'à la décision", async () => {
    const kenji = await signUp("Kenji");
    const nina = await signUp("Nina");
    const s = await ok(kenji, {});
    const rep = await req(nina, "POST", `/stories/${s.id}/report`, { reason: "shocking" });
    expect(rep.status).toBe(201);
    const [report] = await db.select().from(reports);
    expect(report).toMatchObject({ targetType: "story", targetId: s.id, targetOwnerId: kenji.id });
    const [row] = await db.select().from(stories).where(eq(stories.id, s.id));
    clock.advance(24 * HOUR + 1000);
    await storiesExpire.run();
    expect(await storage.get(row!.storageKey)).not.toBeNull();
    const media = await reportMediaOf("story")?.(s.id, row!.storageKey.split("/").pop() ?? "");
    expect(media?.contentType).toBe("image/webp");
    expect((await req(nina, "GET", `/stories/${s.id}/thumb`)).status).toBe(404);
    // Décision prise : le balayage suivant efface le fichier.
    await db.update(reports).set({ status: "resolved_no_action" }).where(eq(reports.id, report!.id));
    await storiesExpire.run();
    expect(await storage.get(row!.storageKey)).toBeNull();
    expect(await reportMediaOf("story")?.(s.id, "x.webp")).toBeNull();
  });

  it("signaler : seulement une story qu'on voit, jamais la sienne, une seule fois", async () => {
    const kenji = await signUp("Kenji");
    const nina = await signUp("Nina");
    const paul = await signUp("Paul");
    await makePrivate(kenji);
    await follow(nina, kenji);
    const s = await ok(kenji, { audience: "followers" });
    expect((await req(paul, "POST", `/stories/${s.id}/report`, { reason: "spam" })).status).toBe(403);
    expect((await req(kenji, "POST", `/stories/${s.id}/report`, { reason: "spam" })).status).toBe(400);
    expect((await req(nina, "POST", `/stories/${s.id}/report`, { reason: "spam" })).status).toBe(201);
    expect((await req(nina, "POST", `/stories/${s.id}/report`, { reason: "spam" })).status).toBe(409);
    expect((await req(nina, "POST", `/stories/${s.id}/report`, { reason: "dangerous_driving" })).status).toBe(400);
  });
});

describe("vues, flammes, suppression", () => {
  it("la vue est idempotente et comptée ; le nombre et la liste sont pour l'auteur seul", async () => {
    const kenji = await signUp("Kenji");
    const nina = await signUp("Nina");
    const paul = await signUp("Paul");
    const s = await ok(kenji, {});
    for (let i = 0; i < 3; i++) expect((await req(nina, "POST", `/stories/${s.id}/view`)).status).toBe(204);
    expect((await req(paul, "POST", `/stories/${s.id}/view`)).status).toBe(204);
    expect((await req(kenji, "POST", `/stories/${s.id}/view`)).status).toBe(204);
    const own = (await byAuthor(kenji, keyOf(kenji))).json.stories[0];
    expect(own.viewsCount).toBe(2);
    const other = (await byAuthor(nina, keyOf(kenji))).json.stories[0];
    expect(other.viewsCount).toBeNull();
    expect(other.reactionsCount).toBeNull();
    expect(other.viewed).toBe(true);
    const viewers = (await req(kenji, "GET", `/me/stories/${s.id}/viewers`)).json.viewers;
    expect(viewers.map((x: { pseudo: string }) => x.pseudo).sort()).toEqual(["Nina", "Paul"]);
    expect((await req(nina, "GET", `/me/stories/${s.id}/viewers`)).status).toBe(404);
  });

  it("la flamme est idempotente, regroupée en une notification par story, et se retire", async () => {
    const kenji = await signUp("Kenji");
    const nina = await signUp("Nina");
    const paul = await signUp("Paul");
    const s = await ok(kenji, {});
    expect((await req(nina, "PUT", `/stories/${s.id}/reaction`)).json).toEqual({ reacted: true });
    await req(nina, "PUT", `/stories/${s.id}/reaction`);
    await req(paul, "PUT", `/stories/${s.id}/reaction`);
    const rows = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, kenji.id), eq(notifications.type, "story_like")));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.data).toMatchObject({ groupKey: `story_like:${s.id}` });
    expect(rows[0]?.body).toContain("Paul");
    expect(rows[0]?.inJournal).toBe(true);
    expect(rows[0]?.pushSentAt).toBeNull();
    expect((await byAuthor(kenji, keyOf(kenji))).json.stories[0].reactionsCount).toBe(2);
    expect((await byAuthor(nina, keyOf(kenji))).json.stories[0].reacted).toBe(true);
    await req(nina, "DELETE", `/stories/${s.id}/reaction`);
    expect((await byAuthor(kenji, keyOf(kenji))).json.stories[0].reactionsCount).toBe(1);
    expect((await req(kenji, "PUT", `/stories/${s.id}/reaction`)).status).toBe(400);
  });

  it("supprimer : fichier et copies partent, la vignette d'une réponse devient nulle", async () => {
    const kenji = await signUp("Kenji");
    const nina = await signUp("Nina");
    await follow(kenji, nina);
    const s = await ok(kenji, {});
    const [row] = await db.select().from(stories).where(eq(stories.id, s.id));
    const [copy] = await db
      .insert(stories)
      .values({
        authorId: nina.id,
        audience: "public",
        storageKey: "private/stories/x/copie000000000.webp",
        plateState: "none_confirmed",
        sharedFromStoryId: s.id,
        expiresAt: row!.expiresAt,
      })
      .returning();
    const reply = await req(nina, "POST", `/stories/${s.id}/reply`, { text: "Superbe !" });
    expect(reply.status).toBe(201);
    const [msg] = await db.select().from(messages);
    expect(msg?.storyId).toBe(s.id);
    expect(storyThumbFor(msg)).toBe(`/api/stories/${s.id}/thumb`);
    expect((await req(nina, "GET", `/stories/${s.id}/thumb`)).status).toBe(200);
    expect((await req(nina, "DELETE", `/me/stories/${s.id}`)).status).toBe(404);
    expect((await req(kenji, "DELETE", `/me/stories/${s.id}`)).status).toBe(204);
    expect(await storage.get(row!.storageKey)).toBeNull();
    const rows = await db.select().from(stories);
    expect(rows.every((r) => r.deletedAt)).toBe(true);
    expect(rows.find((r) => r.id === copy!.id)?.deletedAt).not.toBeNull();
    const [after] = await db.select().from(messages);
    expect(after?.storyId).toBeNull();
    expect(storyThumbFor(after)).toBeNull();
    expect((await req(nina, "GET", `/stories/${s.id}/thumb`)).status).toBe(404);
    expect((await req(kenji, "DELETE", `/me/stories/${s.id}`)).status).toBe(404);
  });
});

describe("réponse à une story", () => {
  it("l'auteur me suit : message direct avec story_id ; sinon demande de contact", async () => {
    const kenji = await signUp("Kenji");
    const nina = await signUp("Nina");
    const paul = await signUp("Paul");
    await follow(kenji, nina);
    const s = await ok(kenji, {});
    const direct = await req(nina, "POST", `/stories/${s.id}/reply`, { text: "Belle bête" });
    expect(direct.status).toBe(201);
    expect(direct.json).toMatchObject({ mode: "message" });
    const [msg] = await db.select().from(messages);
    expect(msg).toMatchObject({ storyId: s.id, body: "Belle bête", senderId: nina.id });
    const request = await req(paul, "POST", `/stories/${s.id}/reply`, { text: "Salut !" });
    expect(request.status).toBe(201);
    expect(request.json).toMatchObject({ mode: "contact_request" });
    expect(await db.select().from(messages)).toHaveLength(1);
    expect((await req(kenji, "POST", `/stories/${s.id}/reply`, { text: "moi" })).status).toBe(400);
    expect((await req(nina, "POST", `/stories/${s.id}/reply`, { text: "  " })).status).toBe(400);
  });

  it("répondre exige de voir la story", async () => {
    const kenji = await signUp("Kenji");
    const paul = await signUp("Paul");
    await makePrivate(kenji);
    const s = await ok(kenji, { audience: "followers" });
    expect((await req(paul, "POST", `/stories/${s.id}/reply`, { text: "Salut" })).status).toBe(403);
  });
});

describe("identification, notifications, voiture, événement", () => {
  it("n'identifie que quelqu'un qui peut voir la story ; l'identifié est prévenu et peut se retirer", async () => {
    const kenji = await signUp("Kenji");
    await makePrivate(kenji);
    const damien = await signUp("Damien");
    const intrus = await signUp("Intrus");
    await follow(damien, kenji);
    const res = await ok(kenji, {
      audience: "followers",
      tags: [
        { kind: "user", id: damien.id },
        { kind: "user", id: intrus.id },
        { kind: "user", id: damien.id },
      ],
    });
    expect(res.skipped).toEqual([expect.objectContaining({ kind: "user", id: intrus.id })]);
    const tags = await db.select().from(storyTags);
    expect(tags).toHaveLength(1);
    const mention = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, damien.id), eq(notifications.type, "story_mention")));
    expect(mention).toHaveLength(1);
    const strangerRows = await db.select().from(notifications).where(eq(notifications.userId, intrus.id));
    expect(strangerRows.filter((n) => n.type.startsWith("story_"))).toHaveLength(0);
    const seen = (await byAuthor(damien, keyOf(kenji))).json.stories[0];
    expect(seen.tags).toEqual([expect.objectContaining({ kind: "user", id: damien.id, name: "Damien" })]);
    expect((await req(intrus, "POST", `/me/story-tags/${res.id}/remove`)).status).toBe(404);
    expect((await req(damien, "POST", `/me/story-tags/${res.id}/remove`)).status).toBe(204);
    expect((await req(damien, "POST", `/me/story-tags/${res.id}/remove`)).status).toBe(404);
    expect((await byAuthor(damien, keyOf(kenji))).json.stories[0].tags).toEqual([]);
    expect(await db.select().from(stories)).toHaveLength(1);
  });

  it("un compte privé ne peut identifier ni structure, ni pro, ni événement ; un compte public le peut", async () => {
    const orga = await signUp("Orga");
    const owner = await signUp("Pro");
    const structure = await createStructure(orga.id);
    const pro = await createPro(owner.id);
    const event = await createEvent(structure.id);
    const body = {
      tags: [
        { kind: "structure", id: structure.id },
        { kind: "pro", id: pro.id },
      ],
      eventId: event.id,
    };
    const priv = await signUp("Prive");
    await makePrivate(priv);
    const refused = await ok(priv, { audience: "followers", ...body });
    expect(refused.skipped).toHaveLength(3);
    expect(await db.select().from(storyTags)).toHaveLength(0);
    const [r1] = await db.select().from(stories).where(eq(stories.id, refused.id));
    expect(r1?.eventId).toBeNull();
    const pub = await signUp("Public");
    const accepted = await ok(pub, { audience: "public", ...body });
    expect(accepted.skipped).toHaveLength(0);
    expect(await db.select().from(storyTags)).toHaveLength(2);
    const view = (await byAuthor(priv, keyOf(pub))).json.stories[0];
    expect(view.event).toMatchObject({ id: event.id });
    expect(view.tags.map((t: { kind: string }) => t.kind).sort()).toEqual(["pro", "structure"]);
  });

  it("une story de crew n'identifie ni structure ni pro, seulement des membres du crew", async () => {
    const kenji = await signUp("Kenji");
    const nina = await signUp("Nina");
    const paul = await signUp("Paul");
    const structure = await createStructure(paul.id);
    const crew = await newCrew(kenji);
    await addToCrew(crew.id, kenji, nina);
    const res = await ok(kenji, {
      audience: "crew",
      crewId: crew.id,
      tags: [
        { kind: "user", id: nina.id },
        { kind: "user", id: paul.id },
        { kind: "structure", id: structure.id },
      ],
    });
    expect(res.skipped).toHaveLength(2);
    expect((await db.select().from(storyTags)).map((t) => t.targetId)).toEqual([nina.id]);
  });

  it("onze identifications : 400 ; 10 passent", async () => {
    const kenji = await signUp("Kenji");
    const tags = Array.from({ length: 11 }, (_, i) => ({ kind: "pro", id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}` }));
    expect((await publish(kenji, { tags })).status).toBe(400);
    expect((await publish(kenji, { tags: tags.slice(0, 10) })).status).toBe(201);
  });

  it("la voiture est la sienne, montrée par sa photo masquée ou la silhouette", async () => {
    const kenji = await signUp("Kenji");
    const nina = await signUp("Nina");
    const mine = await createVehicle(kenji.id, ref);
    const hers = await createVehicle(nina.id, ref);
    const res = await ok(kenji, { vehicleId: hers.id });
    expect(res.skipped).toEqual([expect.objectContaining({ kind: "vehicle" })]);
    await ok(kenji, { vehicleId: mine.id });
    const unmasked = (await byAuthor(nina, keyOf(kenji))).json.stories.find((x: { vehicle: unknown }) => x.vehicle);
    expect(unmasked.vehicle.photoUrl).toBeNull();
    expect(unmasked.vehicle.label).toContain("BMW");
    await db.execute(sql`update vehicle_photos set plate_blurred = true`);
    const masked = (await byAuthor(nina, keyOf(kenji))).json.stories.find((x: { vehicle: unknown }) => x.vehicle);
    expect(masked.vehicle.photoUrl).toContain("/api/files/");
    expect(JSON.stringify(masked)).not.toContain("AA-");
  });

  it("contenu lié : événement ou voiture seulement dans ce lot", async () => {
    const kenji = await signUp("Kenji");
    expect((await publish(kenji, { linked: { type: "memory", id: "x" } })).status).toBe(400);
    const mine = await createVehicle(kenji.id, ref);
    const res = await ok(kenji, { linked: { type: "vehicle", id: mine.id } });
    expect(res.skipped).toEqual([]);
    const [row] = await db.select().from(stories).where(eq(stories.id, res.id));
    expect(row).toMatchObject({ linkedType: "vehicle", linkedId: mine.id });
  });

  it("story_published : aux abonnés acceptés (une fois par 6 h, hors mute), jamais pour un crew", async () => {
    const kenji = await signUp("Kenji");
    const nina = await signUp("Nina");
    const mute = await signUp("Mute");
    const outsider = await signUp("Dehors");
    await follow(nina, kenji);
    await follow(mute, kenji);
    await req(mute, "PUT", `/me/story-mutes/${keyOf(kenji)}`);
    await ok(kenji, {});
    await ok(kenji, {});
    const of = (u: TestUser) =>
      db.select().from(notifications).where(and(eq(notifications.userId, u.id), eq(notifications.type, "story_published")));
    expect(await of(nina)).toHaveLength(1);
    expect(await of(mute)).toHaveLength(0);
    expect(await of(outsider)).toHaveLength(0);
    const crew = await newCrew(kenji);
    await addToCrew(crew.id, kenji, outsider);
    await follow(outsider, kenji);
    clock.advance(7 * HOUR);
    await ok(kenji, { audience: "crew", crewId: crew.id });
    expect(await of(outsider)).toHaveLength(0);
  });

  it("le seed et les tables : une story de plus de 24 h n'est plus jamais servie, même non encore balayée", async () => {
    const kenji = await signUp("Kenji");
    const nina = await signUp("Nina");
    await ok(kenji, {});
    clock.advance(25 * HOUR);
    expect((await byAuthor(nina, keyOf(kenji))).json.stories).toEqual([]);
    expect((await req(nina, "GET", "/stories/bar")).json.authors).toEqual([]);
    expect((await req(nina, "GET", `/users/${kenji.pseudo}`)).json.stories.count).toBe(0);
    resetRateLimits();
  });
});

describe("règles pures reprises par l'API", () => {
  it("cadrage par défaut : la photo tient entière", () => {
    expect(fitDefault(1600, 900)).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
  });
});
