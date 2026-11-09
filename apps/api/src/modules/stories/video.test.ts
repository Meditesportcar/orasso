// Stories vidéo (lot R7g, décision de Damien du 09/11 : pas de floutage de plaque pour les vidéos, plus de ffmpeg) : envoi
// d'une vidéo MP4 vérifiée par le lecteur de conteneur (H.264, 31 s au plus), vignette, création sans décision de plaque,
// contrainte en base, lecture par morceaux (`Range`) avec les droits de la photo, expiration. La fixture est une mire
// de 2 s (aucune plaque, aucune personne) ; la vidéo « trop longue » est la même dont la durée est réécrite.
import { randomBytes } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { fromWallTime, STORY_VIDEO_MAX_BYTES, STORY_VIDEO_PENDING_MAX_BYTES, storyVideoLabels } from "@orasso/shared";
import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb, seedReference, signUp, type TestUser, useClock } from "../../../test/helpers";
import { withLocation } from "../../../test/mp4-builders";
import { app } from "../../app";
import { db, pool } from "../../db/client";
import { crewMembers, profiles, stories, uploads, userFollows } from "../../db/schema";
import { readMp4Buffer } from "../../lib/mp4";
import { storage, storageDir } from "../../lib/storage";
import { storiesExpire } from "./expire";

afterAll(async () => {
  await pool.end();
});

const ORIGIN = process.env.PUBLIC_URL ?? "http://localhost:5173";
let clock: ReturnType<typeof useClock>;
const fixture = (name: string) => readFile(fileURLToPath(new URL(`../../../test/fixtures/${name}`, import.meta.url)));

beforeEach(async () => {
  await resetDb();
  clock = useClock(fromWallTime({ year: 2026, month: 11, day: 10, hour: 10, minute: 0 }));
  await seedReference();
});

async function req(
  u: TestUser | null,
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  const res = await app.request(`/api${path}`, {
    method,
    headers: {
      origin: ORIGIN,
      ...(u ? { cookie: u.cookie } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...headers,
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

/** Envoi brut d'une vidéo (`POST /me/uploads/story-video`) : `Content-Length` posé à la main (une `Request` de test n'en calcule pas). */
async function uploadRaw(
  u: TestUser | null,
  body: RequestInit["body"],
  headers: Record<string, string | null> = {},
  length: number | null = typeof body === "string" ? body.length : body instanceof Uint8Array ? body.length : null,
) {
  const h: Record<string, string> = { origin: ORIGIN, "content-type": "video/mp4", ...(u ? { cookie: u.cookie } : {}) };
  if (length !== null) h["content-length"] = String(length);
  for (const [k, v] of Object.entries(headers)) {
    if (v === null) delete h[k];
    else h[k] = v;
  }
  const res = await app.request("/api/me/uploads/story-video", {
    method: "POST",
    headers: h,
    body,
    ...(body instanceof ReadableStream ? { duplex: "half" } : {}),
  } as RequestInit);
  // biome-ignore lint/suspicious/noExplicitAny: réponses JSON lues librement dans les tests
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
}

async function upload(u: TestUser | null, purpose: string, data: Buffer, name = "story.mp4", type = "video/mp4") {
  if (purpose === "story_video") return uploadRaw(u, new Uint8Array(data), { "content-type": type });
  const form = new FormData();
  form.append("purpose", purpose);
  form.append("file", new File([new Uint8Array(data)], name, { type }));
  const res = await app.request("/api/me/uploads", {
    method: "POST",
    headers: { origin: ORIGIN, ...(u ? { cookie: u.cookie } : {}) },
    body: form,
  });
  // biome-ignore lint/suspicious/noExplicitAny: réponses JSON lues librement dans les tests
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
}

/** Première image d'une vidéo : un bruit coloré en 9:16, sans texte ni plaque. */
async function poster(width = 720, height = 1280) {
  const raw = Buffer.alloc(width * height * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 2654435761) % 251;
  return sharp(raw, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 80 })
    .toBuffer();
}

/** Durée réécrite dans `mvhd` (version 0) : la même vidéo, annoncée plus longue. */
function withDuration(data: Buffer, seconds: number) {
  const out = Buffer.from(data);
  const at = out.indexOf("mvhd") + 4;
  const timescale = out.readUInt32BE(at + 4 + 8);
  out.writeUInt32BE(Math.round(timescale * seconds), at + 4 + 12);
  return out;
}

type Sent = { video: string; poster: string };
async function send(u: TestUser, video?: Buffer): Promise<Sent> {
  const v = await upload(u, "story_video", video ?? (await fixture("story-2s.mp4")));
  expect(v.status, JSON.stringify(v.json)).toBe(201);
  const p = await upload(u, "story_poster", await poster(), "poster.jpg", "image/jpeg");
  expect(p.status, JSON.stringify(p.json)).toBe(201);
  return { video: v.json.key, poster: p.json.key };
}
async function publishVideo(u: TestUser, over: Record<string, unknown> = {}, sent?: Sent) {
  const s = sent ?? (await send(u));
  return req(u, "POST", "/me/stories", { uploadKey: s.video, posterKey: s.poster, audience: "public", ...over });
}
async function okVideo(u: TestUser, over: Record<string, unknown> = {}) {
  const res = await publishVideo(u, over);
  expect(res.status, JSON.stringify(res.json)).toBe(201);
  return res.json as { id: string; status: string; replayed?: boolean };
}

async function follow(a: TestUser, b: TestUser) {
  await req(a, "POST", `/users/${b.pseudo}/follow`);
  await db
    .update(userFollows)
    .set({ status: "accepted", acceptedAt: clock.now })
    .where(and(eq(userFollows.followerId, a.id), eq(userFollows.followedId, b.id)));
}

type View = { id: string; mediaKind: string; mediaUrl: string; posterUrl: string | null; durationMs: number | null };
const strip = (url: string) => url.replace(/^\/api/, "");
async function viewOf(viewer: TestUser, author: TestUser): Promise<View> {
  const res = await req(viewer, "GET", `/stories/by-author/u:${author.id}`);
  expect(res.status).toBe(200);
  const first = res.json.stories[0] as View | undefined;
  expect(first, JSON.stringify(res.json)).toBeDefined();
  return first as View;
}

describe("envoi d'une vidéo", () => {
  it("accepte une vidéo H.264 de 2 s : privée sous private/, durée et dimensions lues dans le fichier", async () => {
    const kenji = await signUp("Kenji");
    const data = await fixture("story-2s.mp4");
    const res = await upload(kenji, "story_video", data);
    expect(res.status, JSON.stringify(res.json)).toBe(201);
    expect(res.json.key).toMatch(/^private\/story-videos\/[0-9a-f-]{36}\.mp4$/);
    expect([res.json.width, res.json.height]).toEqual([720, 1280]);
    expect(res.json.durationMs).toBeGreaterThan(1900);
    expect(res.json.durationMs).toBeLessThan(2200);
    // Le fichier est gardé tel quel, à une chose près : les boîtes de métadonnées sont vidées (même taille, voir plus bas).
    const stored = await storage.get(res.json.key);
    expect(stored?.length).toBe(data.length);
    // Une vidéo n'est jamais servie par la route des fichiers publics.
    expect((await req(null, "GET", `/files/${res.json.key}`)).status).toBe(404);
  });

  it("refuse le HEVC (400 codec), une vidéo trop longue (400 too_long) et un fichier illisible (415) sans rien garder", async () => {
    const kenji = await signUp("Kenji");
    const hevc = await upload(kenji, "story_video", await fixture("story-hevc.mp4"));
    expect([hevc.status, hevc.json.error.code]).toEqual([400, "codec"]);
    expect(hevc.json.error.message).toContain("H.264");

    const long = await upload(kenji, "story_video", withDuration(await fixture("story-2s.mp4"), 40));
    expect([long.status, long.json.error.code]).toEqual([400, "too_long"]);
    // 31 s : à la limite, accepté (tolérance des arrondis) ; 32 s : refusé.
    expect((await upload(kenji, "story_video", withDuration(await fixture("story-2s.mp4"), 31))).status).toBe(201);
    expect((await upload(kenji, "story_video", withDuration(await fixture("story-2s.mp4"), 32))).status).toBe(400);

    const data = await fixture("story-2s.mp4");
    for (const bad of [
      randomBytes(5000),
      data.subarray(0, Math.floor(data.length / 2)),
      Buffer.from("pas une vidéo"),
    ]) {
      const res = await upload(kenji, "story_video", bad);
      expect(res.status, JSON.stringify(res.json)).toBe(415);
      expect(res.json.error.code).toBe("unsupported_media_type");
    }
    // Un fichier vide : 400. Une image envoyée comme vidéo : illisible.
    expect((await upload(kenji, "story_video", Buffer.alloc(0))).status).toBe(400);
    expect((await upload(kenji, "story_video", await poster(), "a.mp4")).status).toBe(415);

    // Rien n'est resté : une seule vidéo acceptée (31 s) enregistrée, aucun fichier orphelin des refus.
    const rows = await db.query.uploads.findMany({});
    expect(rows.filter((r) => r.purpose === "story_video")).toHaveLength(1);
    // Les refus n'ont pas bloqué le service (compteur d'envois en cours rendu à chaque fois).
    expect((await upload(kenji, "story_video", data)).status).toBe(201);
  });

  it("n'accepte ni sans session, ni plus de 60 Mo ; une image garde sa limite de 15 Mo", async () => {
    const kenji = await signUp("Kenji");
    expect((await upload(null, "story_video", await fixture("story-2s.mp4"))).status).toBe(401);
    const big = Buffer.alloc(STORY_VIDEO_MAX_BYTES + 1024 * 1024);
    const tooBig = await upload(kenji, "story_video", big);
    expect([tooBig.status, tooBig.json.error.code]).toEqual([413, "payload_too_large"]);
    // 17 Mo envoyés comme photo de story : refusés (la limite de 60 Mo ne vaut que pour la route et la vidéo).
    const image = await upload(kenji, "story", Buffer.alloc(17 * 1024 * 1024), "a.jpg", "image/jpeg");
    expect([image.status, image.json.error.code]).toEqual([413, "payload_too_large"]);
    // Un autre usage (message) garde sa limite : 17 Mo refusés aussi.
    expect((await upload(kenji, "message", Buffer.alloc(17 * 1024 * 1024), "a.jpg", "image/jpeg")).status).toBe(413);
  });

  it("recompresse la vignette en WebP, 1080 de côté au plus, privée", async () => {
    const kenji = await signUp("Kenji");
    const res = await upload(kenji, "story_poster", await poster(1500, 2600), "p.jpg", "image/jpeg");
    expect(res.status).toBe(201);
    expect(res.json.key).toMatch(/^private\/story-posters\/[0-9a-f-]{36}\.webp$/);
    expect(res.json.height).toBeLessThanOrEqual(1080);
    const meta = await sharp((await storage.get(res.json.key)) as Buffer).metadata();
    expect(meta.format).toBe("webp");
  });
});

describe("publier une vidéo", () => {
  it("publie tout de suite, sans décision de plaque : prête, plaque « not_required », durée et dimensions lues dans le fichier", async () => {
    const kenji = await signUp("Kenji");
    const lea = await signUp("Lea");
    await follow(lea, kenji);
    const sent = await send(kenji);
    // Ni plateRects ni noPlateConfirmed : une vidéo n'en demande pas.
    const res = await publishVideo(kenji, { audience: "followers" }, sent);
    expect(res.status, JSON.stringify(res.json)).toBe(201);
    expect(res.json.status).toBe("ready");
    const [row] = await db.select().from(stories).where(eq(stories.id, res.json.id));
    expect(row?.mediaKind).toBe("video");
    expect(row?.plateState).toBe("not_required");
    expect(row?.status).toBe("ready");
    expect([row?.width, row?.height]).toEqual([720, 1280]);
    expect(row?.durationMs).toBeGreaterThan(1900);
    expect(row?.storageKey).toMatch(new RegExp(`^private/stories/${res.json.id}/[0-9a-f]{16}\\.mp4$`));
    expect(row?.posterKey).toMatch(new RegExp(`^private/stories/${res.json.id}/[0-9a-f]{16}\\.webp$`));
    // Les envois d'origine sont consommés puis effacés ; la vidéo publiée est la même, octet pour octet.
    expect(await storage.size(sent.video)).toBeNull();
    expect(await storage.size(sent.poster)).toBeNull();
    expect((await storage.get(row?.storageKey ?? ""))?.length).toBe((await fixture("story-2s.mp4")).length);
    // L'abonné la voit : vidéo, durée, vignette.
    const view = await viewOf(lea, kenji);
    expect(view.mediaKind).toBe("video");
    expect(view.durationMs).toBeGreaterThan(1900);
    expect(view.posterUrl).toMatch(/^\/api\/stories\/[0-9a-f-]{36}\/poster\/[0-9a-f]{16}\.webp$/);
    expect(view.mediaUrl).toMatch(/\.mp4$/);
  });

  it("ignore un cadre ou une décision de plaque envoyés avec une vidéo (jamais de floutage)", async () => {
    const kenji = await signUp("Kenji");
    const res = await publishVideo(kenji, {
      noPlateConfirmed: true,
      frame: { scale: 2, offsetX: 10, offsetY: 10 },
    });
    expect(res.status).toBe(201);
    const [row] = await db.select().from(stories).where(eq(stories.id, res.json.id));
    expect(row?.plateState).toBe("not_required");
    expect(row?.mediaKind).toBe("video");
  });

  it("une photo garde sa règle : sans décision de plaque, 400 plate_decision_required", async () => {
    const kenji = await signUp("Kenji");
    const up = await upload(kenji, "story", await poster(1200, 800), "p.jpg", "image/jpeg");
    expect(up.status).toBe(201);
    const res = await req(kenji, "POST", "/me/stories", { uploadKey: up.json.key, audience: "public" });
    expect([res.status, res.json.error.code]).toEqual([400, "plate_decision_required"]);
  });

  it("refuse une vidéo sans vignette, une vignette qui n'en est pas une, un envoi d'un autre compte ou déjà utilisé", async () => {
    const kenji = await signUp("Kenji");
    const lea = await signUp("Lea");
    const sent = await send(kenji);
    // Sans vignette, la clé de la vidéo est prise pour une photo : introuvable.
    const noPoster = await req(kenji, "POST", "/me/stories", {
      uploadKey: sent.video,
      audience: "public",
      noPlateConfirmed: true,
    });
    expect(noPoster.status).toBe(400);
    // La vignette est la vidéo elle-même : pas le bon usage.
    expect(
      (await req(kenji, "POST", "/me/stories", { uploadKey: sent.video, posterKey: sent.video, audience: "public" }))
        .status,
    ).toBe(400);
    // Une photo `story` donnée comme vignette.
    const photoUp = await upload(kenji, "story", await poster(1200, 800), "p.jpg", "image/jpeg");
    expect(
      (
        await req(kenji, "POST", "/me/stories", {
          uploadKey: sent.video,
          posterKey: photoUp.json.key,
          audience: "public",
        })
      ).status,
    ).toBe(400);
    // Les fichiers d'un autre compte ne servent pas.
    expect((await publishVideo(lea, {}, sent)).status).toBe(400);
    // Une fois publiée, la même vidéo avec une autre vignette est refusée (déjà utilisée) ; la reprise exacte rend la story.
    const first = await publishVideo(kenji, {}, sent);
    expect(first.status).toBe(201);
    const again = await publishVideo(kenji, {}, sent);
    expect([again.status, again.json.id, again.json.replayed]).toEqual([201, first.json.id, true]);
    const otherPoster = await upload(kenji, "story_poster", await poster(), "p.jpg", "image/jpeg");
    expect(
      (
        await req(kenji, "POST", "/me/stories", {
          uploadKey: sent.video,
          posterKey: otherPoster.json.key,
          audience: "public",
        })
      ).json.id,
    ).toBe(first.json.id);
  });

  it("le plafond de stories vivantes et les autres règles de publication valent aussi pour une vidéo (audience crew : membres seulement)", async () => {
    const kenji = await signUp("Kenji");
    const lea = await signUp("Lea");
    const crew = (await req(kenji, "POST", "/crews", { name: "Crew vidéo", department: "66" })).json as { id: string };
    expect((await req(lea, "POST", `/crews/${crew.id}/requests`, { message: null })).status).toBe(201);
    expect((await req(kenji, "POST", `/crews/${crew.id}/requests/${lea.id}/accept`)).status).toBe(204);
    const s = await okVideo(kenji, { audience: "crew", crewId: crew.id });
    const [row] = await db.select().from(stories).where(eq(stories.id, s.id));
    expect([row?.audience, row?.crewId, row?.plateState]).toEqual(["crew", crew.id, "not_required"]);
    // Un membre actif la voit, un non-membre non (la route des fichiers vérifie l'appartenance à chaque lecture).
    const member = await viewOf(lea, kenji);
    expect((await req(lea, "GET", strip(member.mediaUrl))).status).toBe(200);
    const outsider = await signUp("Marc");
    expect((await req(outsider, "GET", strip(member.mediaUrl))).status).toBe(403);
    // Un membre qui part perd l'accès tout de suite.
    await db.delete(crewMembers).where(and(eq(crewMembers.crewId, crew.id), eq(crewMembers.userId, lea.id)));
    expect((await req(lea, "GET", strip(member.mediaUrl))).status).toBe(403);
  });
});

describe("contrainte de plaque en base", () => {
  it("une vidéo porte `not_required` et une photo ne le porte jamais", async () => {
    const kenji = await signUp("Kenji");
    const base = {
      authorId: kenji.id,
      audience: "public" as const,
      storageKey: "private/stories/x/0000000000000000.mp4",
      expiresAt: new Date(clock.now.getTime() + 3_600_000),
    };
    const insert = (over: Partial<typeof stories.$inferInsert>) => db.insert(stories).values({ ...base, ...over });
    await expect(insert({ mediaKind: "video", plateState: "blurred" })).rejects.toThrow();
    await expect(insert({ mediaKind: "video", plateState: "none_confirmed" })).rejects.toThrow();
    await expect(insert({ mediaKind: "video", plateState: null, status: "processing" })).rejects.toThrow();
    await expect(insert({ mediaKind: "photo", plateState: "not_required" })).rejects.toThrow();
    await expect(insert({ mediaKind: "video", plateState: "not_required" })).resolves.toBeDefined();
    await expect(insert({ mediaKind: "photo", plateState: "blurred" })).resolves.toBeDefined();
    await expect(insert({ mediaKind: "photo", plateState: null, status: "processing" })).resolves.toBeDefined();
  });
});

describe("lecture par morceaux", () => {
  async function setup() {
    const kenji = await signUp("Kenji");
    const lea = await signUp("Lea");
    // Compte privé : « Mes abonnés » = abonnés acceptés seulement (sur un compte public, tout membre la voit).
    await db.update(profiles).set({ visibility: "private" }).where(eq(profiles.userId, kenji.id));
    await follow(lea, kenji);
    await okVideo(kenji, { audience: "followers" });
    const view = await viewOf(lea, kenji);
    // Le fichier servi est celui qui est enregistré (métadonnées vidées à l'envoi).
    const [stored] = await db.select().from(stories);
    const data = (await storage.get(stored?.storageKey ?? "")) as Buffer;
    return { kenji, lea, view, data, url: strip(view.mediaUrl) };
  }

  it("sert tout le fichier, annonce les morceaux, et rend un intervalle en 206 (début, fin ouverte, suffixe)", async () => {
    const { lea, data, url } = await setup();
    const full = await req(lea, "GET", url);
    expect(full.status).toBe(200);
    expect(full.headers.get("content-type")).toBe("video/mp4");
    expect(full.headers.get("accept-ranges")).toBe("bytes");
    expect(full.headers.get("content-length")).toBe(String(data.length));
    expect(full.headers.get("cache-control")).toBe("private, no-store");
    expect(full.buf.equals(data)).toBe(true);

    const head = await req(lea, "GET", url, undefined, { range: "bytes=0-99" });
    expect(head.status).toBe(206);
    expect(head.headers.get("content-range")).toBe(`bytes 0-99/${data.length}`);
    expect(head.headers.get("content-length")).toBe("100");
    expect(head.buf.equals(data.subarray(0, 100))).toBe(true);

    const middle = await req(lea, "GET", url, undefined, { range: `bytes=1000-${data.length + 500}` });
    expect(middle.status).toBe(206);
    expect(middle.headers.get("content-range")).toBe(`bytes 1000-${data.length - 1}/${data.length}`);
    expect(middle.buf.equals(data.subarray(1000))).toBe(true);

    const open = await req(lea, "GET", url, undefined, { range: "bytes=200-" });
    expect(open.status).toBe(206);
    expect(open.buf.equals(data.subarray(200))).toBe(true);

    const tail = await req(lea, "GET", url, undefined, { range: "bytes=-64" });
    expect(tail.status).toBe(206);
    expect(tail.headers.get("content-range")).toBe(`bytes ${data.length - 64}-${data.length - 1}/${data.length}`);
    expect(tail.buf.equals(data.subarray(data.length - 64))).toBe(true);
  });

  it("refuse un intervalle hors du fichier (416 avec la taille) et ignore un intervalle mal formé", async () => {
    const { lea, data, url } = await setup();
    const out = await req(lea, "GET", url, undefined, { range: `bytes=${data.length}-` });
    expect(out.status).toBe(416);
    expect(out.headers.get("content-range")).toBe(`bytes */${data.length}`);
    expect(
      (await req(lea, "GET", url, undefined, { range: `bytes=${data.length + 10}-${data.length + 20}` })).status,
    ).toBe(416);
    expect((await req(lea, "GET", url, undefined, { range: "bytes=-0" })).status).toBe(416);
    const weird = await req(lea, "GET", url, undefined, { range: "bytes=0-1,5-6" });
    expect(weird.status).toBe(200);
    expect(weird.buf.equals(data)).toBe(true);
  });

  it("mêmes droits que la photo : sans session 401, étranger à l'audience 403, nom inconnu 404, mute sans effet sur le fichier", async () => {
    const { kenji, view, url } = await setup();
    const stranger = await signUp("Marc");
    expect((await req(null, "GET", url)).status).toBe(401);
    expect((await req(stranger, "GET", url, undefined, { range: "bytes=0-9" })).status).toBe(403);
    expect((await req(stranger, "GET", strip(view.posterUrl ?? ""))).status).toBe(403);
    expect((await req(kenji, "GET", url.replace(/[0-9a-f]{16}\.mp4$/, `${"0".repeat(16)}.mp4`))).status).toBe(404);
    // L'auteur lit toujours sa propre vidéo.
    expect((await req(kenji, "GET", url, undefined, { range: "bytes=0-9" })).status).toBe(206);
  });

  it("sert la vignette en WebP avec les mêmes droits", async () => {
    const { lea, view } = await setup();
    const res = await req(lea, "GET", strip(view.posterUrl ?? ""));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/webp");
    expect((await sharp(res.buf).metadata()).format).toBe("webp");
  });

  it("après l'expiration ou la suppression : 404 et fichiers effacés", async () => {
    const { kenji, lea, view, url } = await setup();
    const [row] = await db.select().from(stories);
    expect(await storage.size(row?.storageKey ?? "")).toBeGreaterThan(0);
    // Suppression par l'auteur.
    expect((await req(kenji, "DELETE", `/me/stories/${view.id}`)).status).toBe(204);
    expect((await req(lea, "GET", url)).status).toBe(404);
    expect(await storage.size(row?.storageKey ?? "")).toBeNull();
    expect(await storage.size(row?.posterKey ?? "")).toBeNull();
  });

  it("expire à 24 h : plus servie, fichiers effacés par le balayage", async () => {
    const { lea, url } = await setup();
    const [row] = await db.select().from(stories);
    clock.advance(25 * 3_600_000);
    expect((await req(lea, "GET", url)).status).toBe(404);
    await storiesExpire.run();
    expect(await storage.size(row?.storageKey ?? "")).toBeNull();
    expect(await storage.size(row?.posterKey ?? "")).toBeNull();
  });
});

// ─── Tour 2 : envoi brut en flux, garde-fous avant lecture, position GPS effacée, plafond d'octets en attente ──────────────

const MB = 1024 * 1024;

/** Corps qui n'avance qu'à la demande : `reading` se réalise quand le serveur commence à le lire, `release` livre les octets. */
function pausedBody(bytes: Uint8Array) {
  let started!: () => void;
  let go!: () => void;
  const reading = new Promise<void>((resolve) => {
    started = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    go = resolve;
  });
  const stream = new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        started();
        await gate;
        controller.enqueue(bytes);
        controller.close();
      },
    },
    { highWaterMark: 0 },
  );
  return { stream, reading, release: go, length: bytes.length };
}

/** Corps dont on compte les lectures : il ne doit jamais être lu quand l'envoi est refusé d'avance. */
function untouchedBody() {
  const state = { pulls: 0 };
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        state.pulls++;
        controller.enqueue(new Uint8Array(1024));
      },
    },
    { highWaterMark: 0 },
  );
  return { stream, state };
}

const storedVideoFiles = () => readdir(join(storageDir, "private", "story-videos")).catch(() => [] as string[]);
/** Fichiers de vidéos de plus qu'au début du test (le dossier de stockage n'est pas vidé entre deux tests). */
let filesAtStart = 0;
beforeEach(async () => {
  filesAtStart = (await storedVideoFiles()).length;
});
const newFiles = async () => (await storedVideoFiles()).length - filesAtStart;

describe("envoi brut d'une vidéo (route dédiée)", () => {
  it("garde-fous avant lecture : le 3e envoi est refusé sans lire son corps, une personne n'en a qu'un, la place est rendue ensuite", async () => {
    const [a, b, c] = [await signUp("Anna"), await signUp("Boris"), await signUp("Chloe")];
    const data = new Uint8Array(await fixture("story-2s.mp4"));
    const first = pausedBody(data);
    const second = pausedBody(data);
    const pa = uploadRaw(a, first.stream, {}, first.length);
    await Promise.race([first.reading, pa]);
    const pb = uploadRaw(b, second.stream, {}, second.length);
    await Promise.race([second.reading, pb]);

    const third = untouchedBody();
    const refused = await uploadRaw(c, third.stream, {}, data.length);
    expect([refused.status, refused.json.error.code]).toEqual([429, "rate_limited"]);
    expect(third.state.pulls).toBe(0);

    // Anna a déjà un envoi en cours : un second est refusé aussi, sans lecture.
    const again = untouchedBody();
    expect((await uploadRaw(a, again.stream, {}, data.length)).status).toBe(429);
    expect(again.state.pulls).toBe(0);

    first.release();
    second.release();
    expect((await pa).status).toBe(201);
    expect((await pb).status).toBe(201);
    // Les places sont rendues (`finally`) : Chloé passe, et Anna peut renvoyer.
    expect((await upload(c, "story_video", Buffer.from(data))).status).toBe(201);
    expect((await upload(a, "story_video", Buffer.from(data))).status).toBe(201);
  });

  it("rend la place quand l'envoi échoue (fichier illisible, coupure en route)", async () => {
    const kenji = await signUp("Kenji");
    const lea = await signUp("Lea");
    const marc = await signUp("Marc");
    for (const who of [kenji, lea, marc]) {
      expect((await upload(who, "story_video", Buffer.from("pas une vidéo, du tout"))).status).toBe(415);
    }
    const broken = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(new Error("connexion coupée"));
      },
    });
    expect((await uploadRaw(kenji, broken, {}, 5000)).status).toBeGreaterThanOrEqual(400);
    expect((await upload(kenji, "story_video", await fixture("story-2s.mp4"))).status).toBe(201);
    expect(await newFiles()).toBe(1);
  });

  it("un corps plus long ou plus court que Content-Length est refusé et ne laisse aucun fichier", async () => {
    const kenji = await signUp("Kenji");
    const data = await fixture("story-2s.mp4");
    const longer = await uploadRaw(kenji, new Uint8Array(Buffer.concat([data, randomBytes(500)])), {}, data.length);
    expect([longer.status, longer.json.error.code]).toEqual([400, "validation_error"]);
    const shorter = await uploadRaw(kenji, new Uint8Array(data.subarray(0, 1000)), {}, data.length);
    expect([shorter.status, shorter.json.error.code]).toEqual([400, "validation_error"]);
    expect(await newFiles()).toBe(0);
    expect(await db.query.uploads.findMany({})).toHaveLength(0);
    // Le compte exact passe.
    expect((await uploadRaw(kenji, new Uint8Array(data), {}, data.length)).status).toBe(201);
  });

  it("coupe au-delà de 60 Mo : déclaré trop gros, refusé sans lecture ; déclaré 60 Mo mais plus long, coupé en route", async () => {
    const kenji = await signUp("Kenji");
    const untouched = untouchedBody();
    const tooBig = await uploadRaw(kenji, untouched.stream, {}, STORY_VIDEO_MAX_BYTES + 1);
    expect([tooBig.status, tooBig.json.error.code]).toEqual([413, "payload_too_large"]);
    expect(untouched.state.pulls).toBe(0);
    const huge = await uploadRaw(kenji, untouchedBody().stream, {}, 70 * MB);
    expect([huge.status, huge.json.error.code]).toEqual([413, "payload_too_large"]);

    let sent = 0;
    const endless = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          sent += MB;
          controller.enqueue(new Uint8Array(MB));
          if (sent >= 80 * MB) controller.close();
        },
      },
      { highWaterMark: 0 },
    );
    const cut = await uploadRaw(kenji, endless, {}, STORY_VIDEO_MAX_BYTES);
    expect([cut.status, cut.json.error.code]).toEqual([400, "validation_error"]);
    // Coupé à l'octet 60 Mo + 1 : le serveur n'a pas lu le reste (quelques morceaux d'avance au plus).
    expect(sent).toBeLessThan(STORY_VIDEO_MAX_BYTES + 6 * MB);
    expect(await newFiles()).toBe(0);
  });

  it("exige Content-Length (411), un type vidéo (415) ; l'ancienne route ne prend plus de vidéo (400)", async () => {
    const kenji = await signUp("Kenji");
    const data = new Uint8Array(await fixture("story-2s.mp4"));
    const noLength = await uploadRaw(kenji, data, {}, null);
    expect([noLength.status, noLength.json.error.message]).toEqual([411, storyVideoLabels.apiLengthRequired]);
    const form = await uploadRaw(kenji, data, { "content-type": "multipart/form-data; boundary=x" });
    expect(form.status).toBe(415);
    expect((await uploadRaw(kenji, data, { "content-type": "application/octet-stream" })).status).toBe(415);
    expect((await uploadRaw(kenji, data, { "content-type": "video/quicktime" })).status).toBe(201);
    // Multipart sur `/me/uploads` : la vidéo n'y passe plus.
    const fd = new FormData();
    fd.append("purpose", "story_video");
    fd.append("file", new File([data], "v.mp4", { type: "video/mp4" }));
    const old = await app.request("/api/me/uploads", {
      method: "POST",
      headers: { origin: ORIGIN, cookie: kenji.cookie },
      body: fd,
    });
    expect(old.status).toBe(400);
    expect(await newFiles()).toBe(1);
  });

  it("efface le lieu du fichier enregistré : udta/©xyz, uuid et meta vidés, même taille, vidéo lisible, images intactes", async () => {
    const kenji = await signUp("Kenji");
    const original = await fixture("story-2s.mp4");
    const located = withLocation(original);
    expect(located.includes("+42.6887")).toBe(true);
    expect(located.includes(Buffer.from([0xa9, 0x78, 0x79, 0x7a]))).toBe(true);
    const res = await upload(kenji, "story_video", located);
    expect(res.status, JSON.stringify(res.json)).toBe(201);
    const stored = (await storage.get(res.json.key)) as Buffer;
    expect(stored.length).toBe(located.length);
    for (const trace of ["+42.6887", "002.8948", "Perpignan", "ISO6709", "udta", "uuid", "ilst"]) {
      expect(stored.includes(trace), trace).toBe(false);
    }
    expect(stored.includes(Buffer.from([0xa9, 0x78, 0x79, 0x7a]))).toBe(false);
    const info = await readMp4Buffer(stored);
    expect([info.width, info.height, info.h264]).toEqual([720, 1280, true]);
    // Les images (mdat) n'ont pas bougé d'un octet.
    const mdatAt = original.indexOf("mdat") - 4;
    const mdatSize = original.readUInt32BE(mdatAt);
    expect(stored.subarray(mdatAt, mdatAt + mdatSize).equals(original.subarray(mdatAt, mdatAt + mdatSize))).toBe(true);
  });

  it("refuse un fichier qui annonce 10 s dans mvhd et plus dans une piste, ou qui n'a aucune image", async () => {
    const kenji = await signUp("Kenji");
    const base = await fixture("story-2s.mp4");
    const long = Buffer.from(withDuration(base, 10));
    // `mdhd` de la piste vidéo (première) : 40 s dans l'échelle de temps de la piste.
    const mdhd = long.indexOf("mdhd") + 4;
    long.writeUInt32BE(Math.round(long.readUInt32BE(mdhd + 4 + 8) * 40), mdhd + 4 + 12);
    const res = await upload(kenji, "story_video", long);
    expect([res.status, res.json.error.code]).toEqual([400, "too_long"]);
    // Plus aucune image : `stsz` vide.
    const empty = Buffer.from(base);
    empty.writeUInt32BE(0, empty.indexOf("stsz") + 4 + 4);
    empty.writeUInt32BE(0, empty.indexOf("stsz") + 4 + 4 + 4);
    const none = await upload(kenji, "story_video", empty);
    expect([none.status, none.json.error.code]).toEqual([415, "unsupported_media_type"]);
  });
});

describe("plafond d'octets de vidéos en attente", () => {
  const pendingRow = (userId: string, bytes: number, createdAt: Date) =>
    db.insert(uploads).values({
      key: `private/story-videos/${randomBytes(8).toString("hex")}.mp4`,
      userId,
      purpose: "story_video",
      width: 720,
      height: 1280,
      bytes,
      createdAt,
    });

  it("refuse au-delà de 300 Mo non publiés, sans lire le corps ; les envois de plus de 24 h et ceux de quelqu'un d'autre ne comptent pas", async () => {
    const kenji = await signUp("Kenji");
    const lea = await signUp("Lea");
    const data = await fixture("story-2s.mp4");
    await pendingRow(kenji.id, STORY_VIDEO_PENDING_MAX_BYTES - 100_000, clock.now);
    const untouched = untouchedBody();
    const full = await uploadRaw(kenji, untouched.stream, {}, data.length);
    expect([full.status, full.json.error.code, full.json.error.message]).toEqual([
      429,
      "rate_limited",
      storyVideoLabels.apiPendingFull,
    ]);
    expect(full.json.error.message).toContain("300 Mo");
    expect(untouched.state.pulls).toBe(0);
    // Quelqu'un d'autre n'est pas gêné.
    expect((await upload(lea, "story_video", data)).status).toBe(201);
    // Un envoi abandonné depuis plus de 24 h ne compte plus (et sera effacé par la règle existante).
    await db
      .update(uploads)
      .set({ createdAt: new Date(clock.now.getTime() - 25 * 3_600_000) })
      .where(eq(uploads.userId, kenji.id));
    expect((await upload(kenji, "story_video", data)).status).toBe(201);
  });
});
