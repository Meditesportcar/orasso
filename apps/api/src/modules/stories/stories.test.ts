// Stories photo (lot R7f1) : composition 9:16, plaque obligatoire pour toute audience, audiences × regards, barre, fichiers,
// vues et flammes, réponses, signalement, identification, expiration. Aucune plaque lisible : les photos d'essai sont
// du bruit coloré.

import { randomUUID } from "node:crypto";
import { fitDefault, fromWallTime, HOUR, mapRect, STORY_H, STORY_VIEWERS_MAX, STORY_W } from "@orasso/shared";
import { and, eq, sql } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

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
  viewerOf,
} from "../../../test/helpers";
import { app } from "../../app";
import { db, pool } from "../../db/client";
import {
  contactRequests,
  crewMembers,
  events,
  mediaProfiles,
  messages,
  notifications,
  proFollows,
  profiles,
  providerProfiles,
  reports,
  stories,
  storyTags,
  storyViews,
  structureFollows,
  userFollows,
  vehicles,
} from "../../db/schema";
import { resetRateLimits } from "../../lib/rateLimit";
import { type RealtimeSocket, realtime } from "../../lib/realtime";
import { storage } from "../../lib/storage";
import { accountService } from "../account/service";
import { storyThumbFor } from "../messaging/story-thumb";
import { reportMedia } from "../moderation/media";
import { retryRemove } from "../vehicles/photos-blur";
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
const makePrivate = (u: TestUser) =>
  db.update(profiles).set({ visibility: "private" }).where(eq(profiles.userId, u.id));

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

  it("la vidéo n'est plus refusée d'office (lot R7g) : un fichier qui n'est pas une vidéo est illisible (415), le reste est dans video.test.ts", async () => {
    const kenji = await signUp("Kenji");
    const res = await app.request("/api/me/uploads/story-video", {
      method: "POST",
      headers: { origin: ORIGIN, cookie: kenji.cookie, "content-type": "video/mp4", "content-length": "1" },
      body: "x",
    });
    expect(res.status).toBe(415);
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
    const kenji = await signUp("Kenji", { twoFactor: true });
    const paul = await signUp("Paul");
    const crew = await newCrew(kenji);
    expect((await publish(paul, { audience: "crew", crewId: crew.id })).status).toBe(403);
    expect((await publish(kenji, { audience: "crew" })).status).toBe(400);
    expect((await publish(kenji, { audience: "followers", crewId: crew.id })).status).toBe(400);
    const structure = await createStructure(kenji.id);
    const orga = await publish(kenji, {
      audience: "crew",
      crewId: crew.id,
      persona: "organizer",
      structureId: structure.id,
    });
    expect(orga.status).toBe(400);
  });

  it("casquette organisateur : un non-membre de la structure est refusé (403), le propriétaire passe et la story paraît sous la structure", async () => {
    const orga = await signUp("Orga", { twoFactor: true });
    const co = await signUp("Coorga", { twoFactor: true });
    const stranger = await signUp("Intrus");
    const fan = await signUp("Fan");
    const structure = await createStructure(orga.id);
    await addMember(structure.id, co.id, "co_organizer");
    const staff = await signUp("Staff");
    await addMember(structure.id, staff.id, "staff");
    expect((await publish(stranger, { persona: "organizer", structureId: structure.id })).status).toBe(403);
    expect((await publish(staff, { persona: "organizer", structureId: structure.id })).status).toBe(403);
    await ok(co, { persona: "organizer", structureId: structure.id, audience: "public" });
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
    await db
      .update(profiles)
      .set({ suspendedUntil: new Date(clock.now.getTime() + 24 * HOUR) })
      .where(eq(profiles.userId, kenji.id));
    expect((await byAuthor(nina, keyOf(kenji))).json.stories).toEqual([]);
    const res = await req(kenji, "POST", "/me/stories", {
      uploadKey: up.json.key,
      noPlateConfirmed: true,
      audience: "public",
    });
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

  it("« Ta story » ne compte que mes stories personnelles : celles au nom d'une structure ou d'un pro n'y sont pas", async () => {
    const orga = await signUp("OrgaMine", { twoFactor: true });
    const structure = await createStructure(orga.id);
    const pro = await createPro(orga.id);
    await ok(orga, { persona: "organizer", structureId: structure.id, audience: "public" });
    await ok(orga, { persona: "pro", proId: pro.id, audience: "public" });
    // Que des stories au nom d'une structure ou d'un pro : « Ta story » reste vide (sinon elle ouvrirait `u:<moi>`, vide).
    let bar = (await req(orga, "GET", "/stories/bar")).json;
    expect(bar.mine).toBeNull();
    expect((await byAuthor(orga, keyOf(orga))).json.stories).toEqual([]);
    // Une story personnelle s'ajoute : elle seule compte, et c'est bien ce que la visionneuse sert.
    await ok(orga, { audience: "followers" });
    bar = (await req(orga, "GET", "/stories/bar")).json;
    expect(bar.mine).toMatchObject({ count: 1, ring: "followers" });
    expect((await byAuthor(orga, keyOf(orga))).json.stories).toHaveLength(1);
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
    expect(good.headers.get("cache-control")).toBe("private, no-store");
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
    // La modération voit le média par le registre de `moderation/media.ts` (R7e1), même après l'expiration.
    const modo = await viewerOf(await signUp("Modo", { twoFactor: true, role: "moderator" }));
    const media = await reportMedia(modo, report!.id, row!.storageKey.split("/").pop() ?? "");
    expect(media.contentType).toBe("image/webp");
    expect((await req(nina, "GET", `/stories/${s.id}/thumb`)).status).toBe(404);
    // Décision prise : le balayage suivant efface le fichier.
    await db.update(reports).set({ status: "resolved_no_action" }).where(eq(reports.id, report!.id));
    await storiesExpire.run();
    expect(await storage.get(row!.storageKey)).toBeNull();
    await expect(reportMedia(modo, report!.id, "x.webp")).rejects.toMatchObject({ status: 404 });
    await expect(reportMedia(modo, report!.id, `${"a".repeat(16)}.webp`)).rejects.toMatchObject({ status: 404 });
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

  it("la liste des vues renvoie le total relu à chaque appel : des vues arrivées entre deux lectures", async () => {
    const kenji = await signUp("Kenji");
    const nina = await signUp("Nina");
    const paul = await signUp("Paul");
    const s = await ok(kenji, {});
    // Ouverte à zéro vue : la liste dit zéro.
    expect((await req(kenji, "GET", `/me/stories/${s.id}/viewers`)).json).toMatchObject({ total: 0, viewers: [] });
    expect((await byAuthor(kenji, keyOf(kenji))).json.stories[0].viewsCount).toBe(0);
    await req(nina, "POST", `/stories/${s.id}/view`);
    await req(paul, "POST", `/stories/${s.id}/view`);
    const second = (await req(kenji, "GET", `/me/stories/${s.id}/viewers`)).json;
    expect(second.total).toBe(2);
    expect(second.viewers).toHaveLength(2);
    // Au-delà de la liste : le total suit le compteur de la story, pas la longueur plafonnée.
    await db.update(stories).set({ viewsCount: 250 }).where(eq(stories.id, s.id));
    const third = (await req(kenji, "GET", `/me/stories/${s.id}/viewers`)).json;
    expect(third.total).toBe(250);
    expect(third.viewers.length).toBeLessThanOrEqual(STORY_VIEWERS_MAX);
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
    const orga = await signUp("Orga", { twoFactor: true });
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
    const paul = await signUp("Paul", { twoFactor: true });
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
    const tags = Array.from({ length: 11 }, (_, i) => ({
      kind: "pro",
      id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    }));
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
      db
        .select()
        .from(notifications)
        .where(and(eq(notifications.userId, u.id), eq(notifications.type, "story_published")));
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

// --- Tour 2 (corrections après relectures Opus et Codex) -------------------------------------------------------------

const rows = (n: number, make: (i: number) => Partial<typeof stories.$inferInsert>) =>
  Array.from({ length: n }, (_, i) => ({
    audience: "public" as const,
    storageKey: `private/stories/fictive/${String(i).padStart(16, "0")}.webp`,
    plateState: "none_confirmed" as const,
    status: "ready" as const,
    expiresAt: new Date(clock.now.getTime() + 20 * HOUR),
    ...make(i),
  })) as (typeof stories.$inferInsert)[];

describe("tour 2 : cache, comptes privés, plaques", () => {
  it("les fichiers ne sont jamais gardés par le navigateur ; un second compte sur le même appareil reçoit 403", async () => {
    const kenji = await signUp("Kenji");
    const nina = await signUp("Nina");
    const paul = await signUp("Paul");
    await makePrivate(kenji);
    await follow(nina, kenji);
    await ok(kenji, { audience: "followers" });
    const view = (await byAuthor(nina, keyOf(kenji))).json.stories[0];
    const id = view.id as string;
    for (const path of [fileUrl(view), `/stories/${id}/thumb`]) {
      const good = await req(nina, "GET", path);
      expect(good.status).toBe(200);
      expect(good.headers.get("cache-control")).toBe("private, no-store");
      // Même adresse, autre compte : le contrôle d'audience est refait, rien ne vient d'un cache.
      expect((await req(paul, "GET", path)).status).toBe(403);
    }
    const [row] = await db.select().from(stories).where(eq(stories.id, id));
    await db.update(stories).set({ posterKey: row?.storageKey }).where(eq(stories.id, id));
    const poster = await req(nina, "GET", `/stories/${id}/poster/${row?.storageKey.split("/").pop()}`);
    expect(poster.status).toBe(200);
    expect(poster.headers.get("cache-control")).toBe("private, no-store");
  });

  it("une story « publique » d'un compte devenu privé est servie aux abonnés seulement (profil, auteur, fichiers, barre)", async () => {
    const kenji = await signUp("Kenji");
    const nina = await signUp("Nina");
    const paul = await signUp("Paul");
    await follow(nina, kenji);
    await ok(kenji, { audience: "public" });
    expect((await byAuthor(paul, keyOf(kenji))).json.stories).toHaveLength(1);
    await makePrivate(kenji);
    const path = fileUrl((await byAuthor(nina, keyOf(kenji))).json.stories[0]);
    expect((await byAuthor(paul, keyOf(kenji))).json).toEqual({ author: null, stories: [] });
    expect((await req(paul, "GET", path)).status).toBe(403);
    const [row] = await db.select().from(stories);
    expect((await req(paul, "GET", `/stories/${row?.id}/thumb`)).status).toBe(403);
    expect((await req(paul, "POST", `/stories/${row?.id}/reply`, { text: "Salut" })).status).toBe(403);
    expect((await req(paul, "GET", `/users/${kenji.pseudo}`)).json.stories?.count ?? 0).toBe(0);
    // L'abonné accepté la voit toujours.
    expect((await req(nina, "GET", path)).status).toBe(200);
    expect((await req(nina, "GET", "/stories/bar")).json.authors).toHaveLength(1);
    expect((await req(paul, "GET", "/stories/bar")).json.authors).toHaveLength(0);
  });

  it("casquettes « prestataire » et « média » d'un compte privé : la story est publique (D38, lot R9a), sous la clé de la page", async () => {
    const kenji = await signUp("Kenji");
    const nina = await signUp("Nina");
    const paul = await signUp("Paul");
    const [prov] = await db
      .insert(providerProfiles)
      .values({ userId: kenji.id, type: "photographer", name: "Studio Kenji" })
      .returning();
    const [med] = await db.insert(mediaProfiles).values({ userId: kenji.id, name: "Kenji Média" }).returning();
    await follow(nina, kenji);
    await makePrivate(kenji);
    // Compte privé : « public » est refusé à la casquette « passionné » (400) ; une page est publique, quel que soit le
    // compte de son titulaire.
    expect((await publish(kenji, { persona: "fan", audience: "public" })).status).toBe(400);
    await ok(kenji, { persona: "provider", audience: "public" });
    await ok(kenji, { persona: "media", audience: "public" });
    // Sous la clé du compte : rien (les stories d'une page ont leur clé, le compte n'en sert que les personnelles).
    expect((await byAuthor(nina, keyOf(kenji))).json.stories).toEqual([]);
    expect((await byAuthor(paul, keyOf(kenji))).json.stories).toEqual([]);
    // Sous la clé de la page : tout membre la lit, abonné ou non.
    for (const reader of [nina, paul]) {
      expect((await byAuthor(reader, `v:${prov?.id}`)).json.stories).toHaveLength(1);
      expect((await byAuthor(reader, `m:${med?.id}`)).json.stories).toHaveLength(1);
    }
    const [one] = await db.select().from(stories).where(eq(stories.persona, "provider"));
    expect((await req(paul, "GET", `/stories/${one?.id}/thumb`)).status).toBe(200);
    // La barre ne montre que les pages suivies.
    expect((await req(paul, "GET", "/stories/bar")).json.authors).toHaveLength(0);
  });

  it("la plaque ne reste pas dans le fond flouté, même avec un cadrage décalé", async () => {
    const w = 1600;
    const h = 900;
    const raw = Buffer.alloc(w * h * 3, 128);
    // « Plaque » fictive : damier noir et blanc de grosses cases (50 px), 200 × 150 px.
    for (let y = 100; y < 250; y++) {
      for (let x = 700; x < 900; x++) {
        const v = (Math.floor((x - 700) / 50) + Math.floor((y - 100) / 50)) % 2 ? 255 : 0;
        raw.fill(v, (y * w + x) * 3, (y * w + x) * 3 + 3);
      }
    }
    const src = await sharp(raw, { raw: { width: w, height: h, channels: 3 } })
      .png()
      .toBuffer();
    const rect = { x: 700 / w, y: 100 / h, w: 200 / w, h: 150 / h };
    // La photo est poussée vers le bas : le haut du canevas ne montre que le fond (couverture floutée), où la plaque se
    // trouve vers (330-750, 210-530).
    const frame = { scale: 1, offsetX: 0, offsetY: 700 };
    const plain = await composeStoryPhoto(src, { frame });
    const masked = await composeStoryPhoto(src, { frame, rects: [rect] });
    const region = { left: 340, top: 230, width: 400, height: 290 };
    // Écart-type des gris de la zone : le damier flouté laisse des variations, la zone masquée est presque lisse.
    const spread = async (data: Buffer) => {
      const { data: px } = await sharp(data).extract(region).greyscale().raw().toBuffer({ resolveWithObject: true });
      const mean = px.reduce((sum, v) => sum + v, 0) / px.length;
      return Math.sqrt(px.reduce((sum, v) => sum + (v - mean) ** 2, 0) / px.length);
    };
    const before = await spread(plain.data);
    const after = await spread(masked.data);
    // Sans masque le fond garde la trace du damier ; avec, la zone est lisse.
    expect(before).toBeGreaterThan(25);
    expect(after).toBeLessThan(before * 0.35);
  });

  it("l'original non flouté est repris par la tâche de suppression quand sa suppression échoue", async () => {
    const kenji = await signUp("Kenji");
    const up = await upload(kenji);
    const original = storage.remove.bind(storage);
    const spy = vi.spyOn(storage, "remove").mockImplementation(async (key: string) => {
      if (key === up.json.key) throw new Error("disque indisponible");
      return original(key);
    });
    try {
      const res = await req(kenji, "POST", "/me/stories", {
        uploadKey: up.json.key,
        noPlateConfirmed: true,
        audience: "public",
      });
      expect(res.status).toBe(201);
    } finally {
      spy.mockRestore();
    }
    // L'original est encore là, mais une reprise est planifiée.
    expect(await storage.get(up.json.key)).not.toBeNull();
    const job = clock.jobs.jobs.find((j) => j.name === "storage.remove" && j.data.key === up.json.key);
    expect(job).toBeDefined();
    await retryRemove(up.json.key);
    expect(await storage.get(up.json.key)).toBeNull();
  });
});

describe("tour 2 : contenu lié, résumé du profil, identifications, flammes", () => {
  it("le contenu lié est refiltré pour chaque lecteur avec les droits actuels", async () => {
    const orga = await signUp("Orga", { twoFactor: true });
    const kenji = await signUp("Kenji");
    const nina = await signUp("Nina");
    const structure = await createStructure(orga.id);
    const event = await createEvent(structure.id);
    const mine = await createVehicle(kenji.id, ref);
    await ok(kenji, { linked: { type: "event", id: event.id } });
    // Horloge figée : deux instants distincts, sinon l'ordre de lecture de deux stories ex æquo n'est pas défini.
    clock.advance(1000);
    await ok(kenji, { linked: { type: "vehicle", id: mine.id } });
    const linked = async (u: TestUser) =>
      ((await byAuthor(u, keyOf(kenji))).json.stories as { linked: { type: string } | null }[]).map(
        (x) => x.linked?.type ?? null,
      );
    expect(await linked(nina)).toEqual(["event", "vehicle"]);
    // L'événement devient privé : seule l'organisation le voit encore.
    await db.update(events).set({ admission: "invite_only" }).where(eq(events.id, event.id));
    expect(await linked(nina)).toEqual([null, "vehicle"]);
    expect(await linked(orga)).toEqual(["event", "vehicle"]);
    // Il repasse en brouillon : plus de lien pour personne.
    await db.update(events).set({ admission: "open", status: "draft" }).where(eq(events.id, event.id));
    expect(await linked(nina)).toEqual([null, "vehicle"]);
    // La voiture est vendue : plus de lien, pas même son identifiant.
    await db.update(vehicles).set({ status: "sold" }).where(eq(vehicles.id, mine.id));
    expect(await linked(nina)).toEqual([null, null]);
    expect(JSON.stringify((await byAuthor(nina, keyOf(kenji))).json)).not.toContain(mine.id);
  });

  it("le résumé du profil ignore les stories de crew, la barre les garde pour les membres", async () => {
    const kenji = await signUp("Kenji");
    const nina = await signUp("Nina");
    const crew = await newCrew(kenji);
    await addToCrew(crew.id, kenji, nina);
    await ok(kenji, { audience: "crew", crewId: crew.id });
    expect((await req(nina, "GET", `/users/${kenji.pseudo}`)).json.stories).toEqual({
      count: 0,
      hasUnseen: false,
      ring: null,
    });
    const bar = (await req(nina, "GET", "/stories/bar")).json;
    expect(bar.authors).toHaveLength(1);
    expect(bar.authors[0].ring).toBe("crew");
    // Une story d'abonnés, elle, apparaît sur le profil.
    await follow(nina, kenji);
    await ok(kenji, { audience: "followers" });
    expect((await req(nina, "GET", `/users/${kenji.pseudo}`)).json.stories).toMatchObject({
      count: 1,
      ring: "followers",
    });
  });

  it("identifier une structure ou un pro prévient ses responsables (propriétaire, co-organisateurs actifs, propriétaire de la fiche)", async () => {
    const orga = await signUp("Orga", { twoFactor: true });
    const co = await signUp("Co", { twoFactor: true });
    const staff = await signUp("Staff");
    const owner = await signUp("Pro");
    const kenji = await signUp("Kenji");
    const structure = await createStructure(orga.id);
    await addMember(structure.id, co.id, "co_organizer");
    await addMember(structure.id, staff.id, "staff");
    const pro = await createPro(owner.id);
    const res = await ok(kenji, {
      audience: "public",
      tags: [
        { kind: "structure", id: structure.id },
        { kind: "pro", id: pro.id },
      ],
    });
    expect(res.skipped).toEqual([]);
    const mention = async (u: TestUser) =>
      db
        .select()
        .from(notifications)
        .where(and(eq(notifications.userId, u.id), eq(notifications.type, "story_mention")));
    expect(await mention(orga)).toHaveLength(1);
    expect(await mention(co)).toHaveLength(1);
    expect(await mention(owner)).toHaveLength(1);
    expect(await mention(staff)).toHaveLength(0);
    expect(await mention(kenji)).toHaveLength(0);
    expect((await mention(orga))[0]?.body).toContain("Club de test");
    expect((await mention(orga))[0]?.data).toMatchObject({ storyId: res.id, authorKey: keyOf(kenji) });
  });

  it("la flamme renvoie vers l'auteur affiché : personne, structure ou pro", async () => {
    const orga = await signUp("Orga", { twoFactor: true });
    const owner = await signUp("Pro");
    const kenji = await signUp("Kenji");
    const nina = await signUp("Nina");
    const structure = await createStructure(orga.id);
    const pro = await createPro(owner.id);
    const mine = await ok(kenji, {});
    const sStory = await ok(orga, { persona: "organizer", structureId: structure.id });
    const pStory = await ok(owner, { persona: "pro", proId: pro.id });
    for (const id of [mine.id, sStory.id, pStory.id]) {
      expect((await req(nina, "PUT", `/stories/${id}/reaction`)).status).toBe(200);
    }
    const linkOf = async (u: TestUser) => {
      const [n] = await db
        .select()
        .from(notifications)
        .where(and(eq(notifications.userId, u.id), eq(notifications.type, "story_like")));
      return (n?.data as { link?: string } | undefined)?.link;
    };
    expect(await linkOf(kenji)).toBe(`/app/story/u:${kenji.id}`);
    expect(await linkOf(orga)).toBe(`/app/story/s:${structure.id}`);
    expect(await linkOf(owner)).toBe(`/app/story/p:${pro.id}`);
  });
});

describe("tour 2 : réponses aux stories", () => {
  it("story d'une structure : la réponse va dans la conversation de la structure, jamais au compte du co-organisateur", async () => {
    const orga = await signUp("Orga", { twoFactor: true });
    const co = await signUp("Co", { twoFactor: true });
    const fan = await signUp("Fan");
    const structure = await createStructure(orga.id);
    await addMember(structure.id, co.id, "co_organizer");
    const s = await ok(co, { persona: "organizer", structureId: structure.id });
    const res = await req(fan, "POST", `/stories/${s.id}/reply`, { text: "Super affiche !" });
    expect(res.status).toBe(201);
    expect(res.json).toMatchObject({ mode: "message" });
    const convs = await db.query.conversations.findMany();
    expect(convs).toHaveLength(1);
    expect(convs[0]).toMatchObject({ kind: "organizer", structureId: structure.id });
    expect(res.json.conversationId).toBe(convs[0]?.id);
    // Aucune conversation ni demande vers le compte personnel de qui a publié.
    expect(await db.select().from(contactRequests)).toHaveLength(0);
    const [msg] = await db.select().from(messages);
    expect(msg).toMatchObject({ storyId: s.id, senderId: fan.id, body: "Super affiche !" });
    const page = (await req(fan, "GET", `/conversations/${convs[0]?.id}/messages`)).json;
    expect(page.items[0].storyThumbUrl).toBe(`/api/stories/${s.id}/thumb`);
    expect((await req(fan, "GET", page.items[0].storyThumbUrl.replace(/^\/api/, ""))).status).toBe(200);
    // Un organisateur de la structure ne se répond pas à lui-même.
    expect((await req(orga, "POST", `/stories/${s.id}/reply`, { text: "Moi" })).status).toBe(400);
    // Le pseudo de qui a publié n'apparaît dans aucune réponse.
    expect(JSON.stringify(res.json)).not.toContain(co.pseudo);
  });

  it("story d'un pro : aucune messagerie de pro, refus 403 reply_unavailable sans rien créer", async () => {
    const owner = await signUp("Pro");
    const fan = await signUp("Fan");
    const pro = await createPro(owner.id);
    const s = await ok(owner, { persona: "pro", proId: pro.id });
    const res = await req(fan, "POST", `/stories/${s.id}/reply`, { text: "Bonjour" });
    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe("reply_unavailable");
    expect(JSON.stringify(res.json)).not.toContain(owner.pseudo);
    expect(await db.select().from(messages)).toHaveLength(0);
    expect(await db.select().from(contactRequests)).toHaveLength(0);
  });

  it("le contexte voyage dans le message : HTTP, temps réel, et il est gardé quand la demande de contact est acceptée", async () => {
    const kenji = await signUp("Kenji");
    const nina = await signUp("Nina");
    const paul = await signUp("Paul");
    await follow(kenji, nina);
    const s = await ok(kenji, {});
    // Conversation déjà ouverte : le temps réel porte la vignette.
    const open = await req(nina, "POST", "/conversations/direct", { userId: kenji.id });
    expect(open.status).toBe(201);
    const received: string[] = [];
    const socket: RealtimeSocket = { userId: kenji.id, send: (d) => received.push(d) };
    realtime.subscribe(`conversation:${open.json.id}`, socket);
    const reply = await req(nina, "POST", `/stories/${s.id}/reply`, { text: "Belle bête" });
    realtime.unsubscribeAll(socket);
    expect(reply.status).toBe(201);
    expect(received.some((d) => d.includes("message.new") && d.includes(`/api/stories/${s.id}/thumb`))).toBe(true);
    const page = (await req(kenji, "GET", `/conversations/${open.json.id}/messages`)).json;
    expect(page.items[0]).toMatchObject({ body: "Belle bête", storyThumbUrl: `/api/stories/${s.id}/thumb` });
    // Demande de contact : le contexte suit le premier message à l'acceptation.
    const request = await req(paul, "POST", `/stories/${s.id}/reply`, { text: "Salut !" });
    expect(request.json).toMatchObject({ mode: "contact_request" });
    const accepted = await req(kenji, "POST", `/contact-requests/${request.json.requestId}/accept`);
    expect(accepted.status).toBe(200);
    const first = (await req(kenji, "GET", `/conversations/${accepted.json.conversationId}/messages`)).json.items[0];
    expect(first).toMatchObject({ body: "Salut !", storyThumbUrl: `/api/stories/${s.id}/thumb` });
    // La story expire : la vignette disparaît partout.
    clock.advance(24 * HOUR + 1000);
    await storiesExpire.run();
    const later = (await req(kenji, "GET", `/conversations/${accepted.json.conversationId}/messages`)).json.items[0];
    expect(later.storyThumbUrl).toBeNull();
    expect((await db.select().from(contactRequests))[0]?.storyId).toBeNull();
  });

  it("l'auteur m'a écrit en dernier : la réponse part (pas de 409 use_direct)", async () => {
    const kenji = await signUp("Kenji");
    const nina = await signUp("Nina");
    await follow(nina, kenji);
    const open = await req(kenji, "POST", "/conversations/direct", { userId: nina.id });
    expect(open.status).toBe(201);
    const first = await req(kenji, "POST", `/conversations/${open.json.id}/messages`, {
      clientId: randomUUID(),
      body: "Salut",
    });
    expect(first.status).toBe(201);
    // Nina ne suit plus Kenji, qui ne la suit pas : seul son dernier message ouvre encore la conversation.
    await db.delete(userFollows);
    const s = await ok(kenji, {});
    const res = await req(nina, "POST", `/stories/${s.id}/reply`, { text: "Merci !" });
    expect(res.status).toBe(201);
    expect(res.json).toMatchObject({ mode: "message", conversationId: open.json.id });
    expect(await db.select().from(contactRequests)).toHaveLength(0);
  });

  it("un clientId rejoué ne crée qu'un message (ou qu'une demande)", async () => {
    const kenji = await signUp("Kenji");
    const nina = await signUp("Nina");
    const paul = await signUp("Paul");
    await follow(kenji, nina);
    const s = await ok(kenji, {});
    const clientId = randomUUID();
    const a = await req(nina, "POST", `/stories/${s.id}/reply`, { text: "Une fois", clientId });
    const b = await req(nina, "POST", `/stories/${s.id}/reply`, { text: "Une fois", clientId });
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(b.json.messageId).toBe(a.json.messageId);
    expect(await db.select().from(messages)).toHaveLength(1);
    const c = await req(paul, "POST", `/stories/${s.id}/reply`, { text: "Salut" });
    const d = await req(paul, "POST", `/stories/${s.id}/reply`, { text: "Salut" });
    expect([c.status, d.status]).toEqual([201, 201]);
    expect(d.json.requestId).toBe(c.json.requestId);
    expect(await db.select().from(contactRequests)).toHaveLength(1);
  });
});

describe("tour 2 : barre, identifiants, plafond, suppressions", () => {
  it("la barre filtre avant de limiter : mille stories d'un auteur masqué n'effacent pas un auteur visible", async () => {
    const kenji = await signUp("Kenji");
    const nina = await signUp("Nina");
    const muet = await signUp("Muet");
    await ok(kenji, {});
    await follow(nina, kenji);
    await follow(nina, muet);
    await req(nina, "PUT", `/me/story-mutes/${keyOf(muet)}`);
    await db.insert(stories).values(
      rows(1010, (i) => ({
        authorId: muet.id,
        createdAt: new Date(clock.now.getTime() + 1000 + i * 1000),
        expiresAt: new Date(clock.now.getTime() + 20 * HOUR),
      })),
    );
    const bar = (await req(nina, "GET", "/stories/bar")).json;
    expect(bar.authors.map((a: { key: string }) => a.key)).toEqual([keyOf(kenji)]);
  });

  it("hasUnseen se lit sur toutes les stories visibles de l'auteur", async () => {
    const kenji = await signUp("Kenji");
    const nina = await signUp("Nina");
    await follow(nina, kenji);
    const inserted = await db
      .insert(stories)
      .values(
        rows(53, (i) => ({
          authorId: kenji.id,
          createdAt: new Date(clock.now.getTime() - 3 * HOUR + i * 1000),
        })),
      )
      .returning({ id: stories.id, createdAt: stories.createdAt });
    inserted.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    // Tour 5 : plus de limite de lignes supposée (le plafond de publication ne compte que les copies non masquées, un auteur peut
    // dépasser 50 stories vivantes à la levée d'une suspension) : toutes les stories visibles comptent pour `hasUnseen`.
    await db.insert(storyViews).values(inserted.slice(4).map((r) => ({ storyId: r.id, viewerId: nina.id })));
    const bar = (await req(nina, "GET", "/stories/bar")).json;
    expect(bar.authors).toHaveLength(1);
    expect(bar.authors[0].hasUnseen).toBe(true);
    // Les 50 plus récentes et la 4e plus ancienne vues : les 3 plus anciennes, non vues, comptent encore.
    await db.insert(storyViews).values({ storyId: inserted[3]!.id, viewerId: nina.id });
    expect((await req(nina, "GET", "/stories/bar")).json.authors[0].hasUnseen).toBe(true);
    // Tout vu : plus d'anneau « non vu ».
    await db.insert(storyViews).values(inserted.slice(0, 3).map((r) => ({ storyId: r.id, viewerId: nina.id })));
    expect((await req(nina, "GET", "/stories/bar")).json.authors[0].hasUnseen).toBe(false);
  });

  it("des identifiants invalides donnent 400 ou 404, jamais 500", async () => {
    const kenji = await signUp("Kenji");
    const s = await ok(kenji, {});
    for (const id of ["pas-un-uuid", "123", "{}", "../x"]) {
      expect((await publish(kenji, { linked: { type: "event", id } })).status, id).toBe(400);
      expect((await publish(kenji, { linked: { type: "vehicle", id } })).status, id).toBe(400);
      expect((await publish(kenji, { tags: [{ kind: "structure", id }] })).status, id).toBe(400);
      expect((await publish(kenji, { tags: [{ kind: "pro", id }] })).status, id).toBe(400);
      expect((await publish(kenji, { tags: [{ kind: "user", id: `${id} é` }] })).status, id).toBe(400);
    }
    for (const key of ["s:xyz", "p:123", "s:", "x:abc", "u:", "u:a b", `s:${"0".repeat(36)}`]) {
      expect((await byAuthor(kenji, key)).status, key).toBe(404);
      expect((await req(kenji, "PUT", `/me/story-mutes/${encodeURIComponent(key)}`)).status, key).toBe(404);
    }
    expect((await req(kenji, "POST", `/me/story-tags/${s.id}/remove`, { kind: "structure", id: "xyz" })).status).toBe(
      400,
    );
    expect((await req(kenji, "POST", "/me/story-tags/pas-un-uuid/remove", {})).status).toBe(400);
    // Un UUID valide d'une structure inconnue : liste vide, pas d'erreur.
    expect((await byAuthor(kenji, `s:${randomUUID()}`)).json).toEqual({ author: null, stories: [] });
  });

  it("50 stories vivantes au plus par auteur : la 51e est refusée (409 too_many_stories), une expirée ne compte pas", async () => {
    const kenji = await signUp("Kenji", { twoFactor: true });
    const nina = await signUp("Nina");
    await db.insert(stories).values([
      ...rows(48, () => ({ authorId: kenji.id })),
      // Expirée, et supprimée : ne comptent pas.
      ...rows(1, () => ({ authorId: kenji.id, expiresAt: new Date(clock.now.getTime() - HOUR) })),
      ...rows(1, () => ({ authorId: kenji.id, deletedAt: clock.now })),
      // Autre auteur : pas dans le compte.
      ...rows(60, () => ({ authorId: nina.id })),
    ]);
    await ok(kenji, {});
    await ok(kenji, {});
    const refused = await publish(kenji, {});
    expect(refused.status).toBe(409);
    expect(refused.json.error.code).toBe("too_many_stories");
    expect(refused.json.error.message).toContain("50");
    expect(await db.select().from(stories).where(eq(stories.authorId, kenji.id))).toHaveLength(52);
    // Le plafond est par auteur : une structure a le sien.
    const structure = await createStructure(kenji.id);
    await ok(kenji, { persona: "organizer", structureId: structure.id });
  });

  it("la suppression du compte retire ses stories, efface les fichiers, mais retient celle qui est signalée", async () => {
    const kenji = await signUp("Kenji");
    const lea = await signUp("Lea");
    const nina = await signUp("Nina");
    const k = await ok(kenji, {});
    const l = await ok(lea, {});
    const [kRow] = await db.select().from(stories).where(eq(stories.id, k.id));
    const [lRow] = await db.select().from(stories).where(eq(stories.id, l.id));
    expect((await req(nina, "POST", `/stories/${l.id}/report`, { reason: "shocking" })).status).toBe(201);
    await req(nina, "PUT", `/stories/${k.id}/reaction`);
    await accountService.anonymize(kenji.id, null);
    await accountService.anonymize(lea.id, null);
    const [kAfter] = await db.select().from(stories).where(eq(stories.id, k.id));
    expect(kAfter?.deletedAt).not.toBeNull();
    expect(kAfter?.filesRemovedAt).not.toBeNull();
    expect(await storage.get(kRow?.storageKey ?? "")).toBeNull();
    // Signalée : retenue (invisible de tous) jusqu'à la décision.
    const [lAfter] = await db.select().from(stories).where(eq(stories.id, l.id));
    expect(lAfter?.deletedAt).not.toBeNull();
    expect(lAfter?.filesRemovedAt).toBeNull();
    expect(await storage.get(lRow?.storageKey ?? "")).not.toBeNull();
    expect((await byAuthor(nina, keyOf(lea))).json.stories).toEqual([]);
    const [report] = await db.select().from(reports);
    await db
      .update(reports)
      .set({ status: "resolved_no_action" })
      .where(eq(reports.id, report?.id ?? ""));
    await storiesExpire.run();
    expect(await storage.get(lRow?.storageKey ?? "")).toBeNull();
  });

  it("la dissolution d'un crew retire ses stories et efface leurs fichiers", async () => {
    const kenji = await signUp("Kenji");
    const nina = await signUp("Nina");
    const crew = await newCrew(kenji);
    await addToCrew(crew.id, kenji, nina);
    const s = await ok(kenji, { audience: "crew", crewId: crew.id });
    const keep = await ok(kenji, { audience: "followers" });
    const [row] = await db.select().from(stories).where(eq(stories.id, s.id));
    expect(await storage.get(row?.storageKey ?? "")).not.toBeNull();
    expect((await req(kenji, "DELETE", `/crews/${crew.id}`)).status).toBe(204);
    const [after] = await db.select().from(stories).where(eq(stories.id, s.id));
    expect(after?.deletedAt).not.toBeNull();
    expect(await storage.get(row?.storageKey ?? "")).toBeNull();
    // Les autres stories de l'auteur ne bougent pas.
    const [other] = await db.select().from(stories).where(eq(stories.id, keep.id));
    expect(other?.deletedAt).toBeNull();
  });
});

describe("tour 3 : identité de l'auteur affiché, réponses rejouées, barre, casse, vignette", () => {
  it("publier au nom d'une structure ou d'un pro n'expose jamais le compte personnel de qui publie", async () => {
    const orga = await signUp("Orga", { twoFactor: true });
    const co = await signUp("Co", { twoFactor: true });
    const owner = await signUp("Pro");
    const fan = await signUp("Fan");
    const tagged = await signUp("Tagged");
    const structure = await createStructure(orga.id);
    await addMember(structure.id, co.id, "co_organizer");
    const pro = await createPro(owner.id);
    await db.insert(structureFollows).values({ structureId: structure.id, userId: fan.id, source: "manual" });
    await db.insert(proFollows).values({ proId: pro.id, userId: fan.id });
    await ok(co, {
      persona: "organizer",
      structureId: structure.id,
      tags: [{ kind: "user", id: tagged.id }],
    });
    await ok(owner, { persona: "pro", proId: pro.id, tags: [{ kind: "user", id: tagged.id }] });
    const seen = async (u: TestUser) => JSON.stringify((await req(u, "GET", "/me/notifications")).json);
    const forFan = await seen(fan);
    const forTagged = await seen(tagged);
    for (const text of [forFan, forTagged]) {
      expect(text).not.toContain(co.id);
      expect(text).not.toContain(co.pseudo);
      expect(text).not.toContain(owner.id);
      expect(text).not.toContain(owner.pseudo);
    }
    // Ce que voient les abonnés et l'identifié : le nom de la structure, un acteur sans identifiant de compte.
    expect(forFan).toContain("Club de test");
    expect(forTagged).toContain("Club de test");
    const rowsDb = await db.select().from(notifications);
    const concerned = rowsDb.filter((x) => ["story_published", "story_mention"].includes(x.type));
    expect(concerned.length).toBeGreaterThan(0);
    for (const n of concerned) {
      const actor = (n.data as { actor?: { userId?: string; pseudo: string } }).actor;
      expect(actor).toBeDefined();
      expect(actor).not.toHaveProperty("userId");
      expect(["Club de test", "Garage de test"]).toContain(actor?.pseudo);
    }
    // Une story de personne garde son identité.
    await db.delete(notifications);
    await follow(fan, co);
    await ok(co, {});
    const [own] = await db.select().from(notifications).where(eq(notifications.type, "story_published"));
    expect((own?.data as { actor?: { userId?: string } } | undefined)?.actor?.userId).toBe(co.id);
  });

  it("répondre : demande de contact acceptée puis reprise avec le même clientId = un seul message", async () => {
    const kenji = await signUp("Kenji");
    const paul = await signUp("Paul");
    const s = await ok(kenji, {});
    const clientId = randomUUID();
    const a = await req(paul, "POST", `/stories/${s.id}/reply`, { text: "Salut", clientId });
    expect(a.json).toMatchObject({ mode: "contact_request" });
    const [request] = await db.select().from(contactRequests);
    expect(request?.clientId).toBe(clientId);
    const accepted = await req(kenji, "POST", `/contact-requests/${a.json.requestId}/accept`);
    expect(accepted.status).toBe(200);
    const b = await req(paul, "POST", `/stories/${s.id}/reply`, { text: "Salut", clientId });
    expect(b.status).toBe(201);
    expect(b.json).toMatchObject({ mode: "message", conversationId: accepted.json.conversationId });
    const all = await db.select().from(messages);
    expect(all).toHaveLength(1);
    expect(b.json.messageId).toBe(all[0]?.id);
    expect(all[0]?.clientId).toBe(clientId);
    // Un nouvel identifiant est un nouveau message (la conversation est ouverte, plus de demande).
    const c = await req(paul, "POST", `/stories/${s.id}/reply`, { text: "Autre", clientId: randomUUID() });
    expect(c.json).toMatchObject({ mode: "message" });
    expect(await db.select().from(messages)).toHaveLength(2);
    expect(await db.select().from(contactRequests)).toHaveLength(1);
  });

  it("répondre : l'auteur m'a écrit en dernier, deux envois identiques = un seul message, aucune demande", async () => {
    const kenji = await signUp("Kenji");
    const nina = await signUp("Nina");
    await follow(nina, kenji);
    const open = await req(kenji, "POST", "/conversations/direct", { userId: nina.id });
    await req(kenji, "POST", `/conversations/${open.json.id}/messages`, { clientId: randomUUID(), body: "Salut" });
    await db.delete(userFollows);
    const s = await ok(kenji, {});
    const clientId = randomUUID();
    const a = await req(nina, "POST", `/stories/${s.id}/reply`, { text: "Merci !", clientId });
    const b = await req(nina, "POST", `/stories/${s.id}/reply`, { text: "Merci !", clientId });
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(b.json.messageId).toBe(a.json.messageId);
    expect(await db.select().from(messages)).toHaveLength(2);
    expect(await db.select().from(contactRequests)).toHaveLength(0);
  });

  it("répondre : la relation change entre deux envois (il me suit maintenant), la reprise rend la demande déjà faite", async () => {
    const kenji = await signUp("Kenji");
    const paul = await signUp("Paul");
    const s = await ok(kenji, {});
    const clientId = randomUUID();
    const a = await req(paul, "POST", `/stories/${s.id}/reply`, { text: "Salut", clientId });
    await follow(kenji, paul);
    const b = await req(paul, "POST", `/stories/${s.id}/reply`, { text: "Salut", clientId });
    expect(b.json).toMatchObject({ mode: "contact_request", requestId: a.json.requestId });
    expect(await db.select().from(messages)).toHaveLength(0);
  });

  it("la barre d'une très longue liste de suivis : aucune requête ne reçoit plus de 1 000 paramètres", async () => {
    const kenji = await signUp("Kenji");
    const nina = await signUp("Nina");
    await follow(nina, kenji);
    const s = await ok(kenji, {});
    // 66 000 suivis (au-delà de la limite de 65 535 paramètres d'une requête PostgreSQL), sans story.
    await db.execute(sql`
      insert into "user" (id, name, email, email_verified, created_at, updated_at)
      select 'bulk-' || g, 'Bulk ' || g, 'bulk' || g || '@test.local', true, now(), now() from generate_series(1, 66000) g`);
    await db.execute(sql`
      insert into user_follows (follower_id, followed_id, status, accepted_at)
      select ${nina.id}, 'bulk-' || g, 'accepted', now() from generate_series(1, 66000) g`);
    await req(nina, "POST", `/stories/${s.id}/view`);
    const counts: number[] = [];
    const original = pool.query.bind(pool) as (...a: unknown[]) => unknown;
    const spy = vi.spyOn(pool, "query").mockImplementation(((...args: unknown[]) => {
      const first = args[0] as { values?: unknown[] } | string;
      const second = args[1];
      counts.push(Array.isArray(second) ? second.length : typeof first === "object" ? (first.values?.length ?? 0) : 0);
      return original(...args);
    }) as never);
    try {
      const bar = await req(nina, "GET", "/stories/bar");
      expect(bar.status).toBe(200);
      expect(bar.json.authors.map((a: { key: string }) => a.key)).toEqual([keyOf(kenji)]);
      expect(bar.json.authors[0].hasUnseen).toBe(false);
    } finally {
      spy.mockRestore();
    }
    expect(counts.length).toBeGreaterThan(0);
    expect(Math.max(...counts)).toBeLessThanOrEqual(1000);
  }, 60_000);

  it("la barre garde au plus 50 stories par auteur, choisies dans le SQL, sans effacer un autre auteur", async () => {
    const kenji = await signUp("Kenji");
    const lea = await signUp("Lea");
    const nina = await signUp("Nina");
    await follow(nina, kenji);
    await follow(nina, lea);
    await db.insert(stories).values(
      rows(60, (i) => ({
        authorId: kenji.id,
        createdAt: new Date(clock.now.getTime() - 5 * HOUR + i * 1000),
      })),
    );
    await ok(lea, {});
    const bar = (await req(nina, "GET", "/stories/bar")).json;
    expect(bar.authors.map((a: { key: string }) => a.key).sort()).toEqual([keyOf(kenji), keyOf(lea)].sort());
  });

  it("des UUID de structure, de pro et de clé d'auteur en majuscules sont ramenés en minuscules", async () => {
    const orga = await signUp("Orga", { twoFactor: true });
    const owner = await signUp("Pro");
    const fan = await signUp("Fan");
    const structure = await createStructure(orga.id);
    const pro = await createPro(owner.id);
    const s = await ok(orga, { persona: "organizer", structureId: structure.id.toUpperCase() });
    const p = await ok(owner, { persona: "pro", proId: pro.id.toUpperCase() });
    const rowsDb = await db.select().from(stories);
    expect(rowsDb.find((r) => r.id === s.id)?.structureId).toBe(structure.id);
    expect(rowsDb.find((r) => r.id === p.id)?.proId).toBe(pro.id);
    const again = await ok(orga, { persona: "organizer", structureId: structure.id.toUpperCase() });
    expect(again.id).not.toBe(s.id);
    // Clé entrante en majuscules : acceptée, la story est trouvée sous la clé en minuscules.
    const res = await req(fan, "GET", `/stories/by-author/s:${structure.id.toUpperCase()}`);
    expect(res.status).toBe(200);
    expect(res.json.stories).toHaveLength(2);
    // Identification en majuscules.
    const t = await ok(fan, { tags: [{ kind: "structure", id: structure.id.toUpperCase() }] });
    const [tag] = await db.select().from(storyTags).where(eq(storyTags.storyId, t.id));
    expect(tag?.targetId).toBe(structure.id);
  });

  it("la vignette d'une réponse disparaît dès que la story est échue ou supprimée, même si son fichier est gardé (signalement)", async () => {
    const kenji = await signUp("Kenji");
    const nina = await signUp("Nina");
    const paul = await signUp("Paul");
    await follow(kenji, nina);
    const s = await ok(kenji, {});
    const reply = await req(nina, "POST", `/stories/${s.id}/reply`, { text: "Belle" });
    expect(reply.status).toBe(201);
    const thumb = async () =>
      (await req(kenji, "GET", `/conversations/${reply.json.conversationId}/messages`)).json.items[0].storyThumbUrl;
    expect(await thumb()).toBe(`/api/stories/${s.id}/thumb`);
    expect((await req(paul, "POST", `/stories/${s.id}/report`, { reason: "spam" })).status).toBe(201);
    // Échue mais pas encore balayée : la vue ne montre déjà plus de vignette.
    clock.advance(24 * HOUR + 1000);
    expect(await thumb()).toBeNull();
    // Balayée : le fichier reste (signalement ouvert), la vignette est toujours absente.
    await storiesExpire.run();
    const [row] = await db.select().from(stories).where(eq(stories.id, s.id));
    expect(row?.filesRemovedAt).toBeNull();
    expect(await thumb()).toBeNull();
    const [msg] = await db.select().from(messages);
    expect(msg?.storyId).toBeNull();
  });

  it("supprimer une story signalée détache aussi les réponses tout de suite", async () => {
    const kenji = await signUp("Kenji");
    const nina = await signUp("Nina");
    const paul = await signUp("Paul");
    await follow(kenji, nina);
    const s = await ok(kenji, {});
    const reply = await req(nina, "POST", `/stories/${s.id}/reply`, { text: "Belle" });
    await req(paul, "POST", `/stories/${s.id}/report`, { reason: "spam" });
    expect((await req(kenji, "DELETE", `/me/stories/${s.id}`)).status).toBe(204);
    const [row] = await db.select().from(stories).where(eq(stories.id, s.id));
    expect(row?.deletedAt).not.toBeNull();
    expect(row?.filesRemovedAt).toBeNull();
    const page = (await req(kenji, "GET", `/conversations/${reply.json.conversationId}/messages`)).json;
    expect(page.items[0].storyThumbUrl).toBeNull();
  });
});

describe("règles pures reprises par l'API", () => {
  it("cadrage par défaut : la photo tient entière", () => {
    expect(fitDefault(1600, 900)).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
  });
});
