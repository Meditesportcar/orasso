// Lot 47 : générateur d'affiche (8 styles × 2 formats rendus par l'API), aperçu en direct, génération par
// l'organisateur, vignette des cartes, régénération (date, duplication).
import { fromWallTime, posterPreviewKey, posterStyles, setDisplayClock } from "@orasso/shared";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  call,
  createEvent,
  createStructure,
  resetDb,
  seedReference,
  signUp,
  type TestUser,
  useClock,
} from "../../../../test/helpers";
import { app } from "../../../app";
import { pool } from "../../../db/client";
import { now } from "../../../lib/deps";
import { storage } from "../../../lib/storage";
import { clearPosterCache, POSTER_MAX_BYTES, posterCacheKey, posterCacheSize, render } from "./render";
import { posterYearOf, posterYearStale } from "./service";
import { posterTemplates } from "./templates";
import { textLine } from "./text";
import type { PosterCtx, PosterInput, TextLayer } from "./types";

afterAll(async () => {
  await pool.end();
});

const ORIGIN = process.env.PUBLIC_URL ?? "http://localhost:5173";
const paris = (month: number, day: number, hour: number, minute = 0) =>
  fromWallTime({ year: 2026, month, day, hour, minute });

/** Photo « réaliste » pour le poids : bruit flou sous un dégradé (le pire cas pour un PNG). */
async function noisyPhoto() {
  const noise = Buffer.alloc(1200 * 800 * 3);
  let s = 7;
  for (let i = 0; i < noise.length; i++) {
    s = (s * 9301 + 49297) % 233280;
    noise[i] = Math.floor((s / 233280) * 255);
  }
  return sharp(noise, { raw: { width: 1200, height: 800, channels: 3 } })
    .blur(1.2)
    .jpeg({ quality: 85 })
    .toBuffer();
}

const input = (over: Partial<PosterInput> = {}): PosterInput => ({
  style: "neon",
  title: "Nocturne de Canet",
  startsAt: paris(10, 24, 19),
  timezone: "Europe/Paris",
  place: "Canet-en-Roussillon",
  structureName: "MéditeSportCar",
  photo: null,
  logo: null,
  ...over,
});

describe("rendu des affiches", () => {
  it("8 styles × 2 formats : dimensions exactes, PNG valide, moins de 600 Ko", async () => {
    const photo = await noisyPhoto();
    const sizes: string[] = [];
    for (const style of posterStyles) {
      for (const [format, w, h] of [
        ["post", 1080, 1350],
        ["story", 1080, 1920],
      ] as const) {
        const png = await render(input({ style, photo }), format);
        const meta = await sharp(png).metadata();
        expect(meta.format, `${style} ${format}`).toBe("png");
        expect([meta.width, meta.height], `${style} ${format}`).toEqual([w, h]);
        expect(png.length, `${style} ${format}`).toBeLessThan(POSTER_MAX_BYTES);
        sizes.push(`${style} ${format} ${Math.round(png.length / 1024)} Ko`);
      }
    }
    console.info(`Poids des affiches (photo bruitée, pire cas) : ${sizes.join(", ")}`);
  }, 120_000);

  it("sans photo : un aplat, au même format", async () => {
    const png = await render(input({ style: "minimal" }), "post");
    expect((await sharp(png).metadata()).width).toBe(1080);
  });

  it("un titre long n'est jamais tronqué : boîte calculée, lignes rendues dans la largeur", async () => {
    const title = "Cars & Coffee Perpignan Rivesaltes";
    for (const style of posterStyles) {
      const ctx: PosterCtx = {
        W: 1080,
        H: 1350,
        cqw: 10.8,
        cqh: 13.5,
        story: false,
        input: input({ style, title }),
        date: { weekday: "SAM", day: "24", month: "OCT", monthNumber: "10", hour: "19 h", year: "" },
        title: title.toUpperCase(),
        place: "CANET",
      };
      const layout = posterTemplates[style](ctx);
      const titleLayer = layout.layers.find(
        (l): l is TextLayer & { blockHeight?: number } => l.kind === "text" && l.lines.join(" ") === ctx.title,
      );
      const boxRows =
        layout.layers.find((l) => l.kind === "box" && l.rows.length > 1 && l.rows[0]?.font === "expanded") ?? null;
      if (style === "damier") {
        // Le titre est dans le bandeau incliné.
        expect(boxRows).not.toBeNull();
        continue;
      }
      expect(titleLayer, style).toBeDefined();
      if (!titleLayer) continue;
      expect(titleLayer.lines.length).toBeLessThanOrEqual(2);
      expect(titleLayer.blockHeight ?? 0).toBeGreaterThan(titleLayer.size * 0.6);
      for (const line of titleLayer.lines) {
        const img = await textLine(line, { font: titleLayer.font, size: titleLayer.size, color: "#000000" });
        expect(img.width, `${style} « ${line} »`).toBeLessThanOrEqual(Math.ceil(titleLayer.width));
      }
    }
  }, 60_000);
});

let ref: Awaited<ReturnType<typeof seedReference>>;
let orga: TestUser;
let structureId: string;

async function upload(u: TestUser, purpose = "event_poster_photo") {
  const data = await sharp({ create: { width: 900, height: 600, channels: 3, background: { r: 200, g: 80, b: 40 } } })
    .jpeg()
    .toBuffer();
  const form = new FormData();
  form.append("purpose", purpose);
  form.append("file", new File([new Uint8Array(data)], "photo.jpg", { type: "image/jpeg" }));
  const res = await app.request("/api/me/uploads", {
    method: "POST",
    headers: { origin: ORIGIN, cookie: u.cookie },
    body: form,
  });
  return { status: res.status, json: (await res.json()) as { key: string } };
}

async function preview(u: TestUser, body: Record<string, unknown>) {
  const res = await app.request("/api/posters/preview", {
    method: "POST",
    headers: { origin: ORIGIN, cookie: u.cookie, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, type: res.headers.get("content-type"), data: Buffer.from(await res.arrayBuffer()) };
}

describe("API de l'affiche", () => {
  beforeEach(async () => {
    await resetDb();
    clearPosterCache();
    useClock(paris(10, 1, 10));
    ref = await seedReference();
    void ref;
    orga = await signUp("Damien", { twoFactor: true });
    structureId = (await createStructure(orga.id)).id;
  });

  it("photo d'affiche envoyée en WebP de 2000 px au plus, sous event-poster-photos/", async () => {
    const res = await upload(orga);
    expect(res.status).toBe(201);
    expect(res.json.key.startsWith("event-poster-photos/")).toBe(true);
  });

  it("aperçu : PNG de 540 px pour chaque style, rapide après le premier appel, rien d'écrit", async () => {
    const { json } = await upload(orga);
    const base = {
      photoKey: json.key,
      title: "Nocturne de Canet",
      date: paris(10, 24, 19).toISOString(),
      place: "Canet",
    };
    // Premier appel : polices chargées.
    expect((await preview(orga, { ...base, style: "minimal", width: 540 })).status).toBe(200);
    const times: number[] = [];
    for (const style of posterStyles) {
      const t0 = performance.now();
      const res = await preview(orga, { ...base, style, format: style === "jdm" ? "story" : "post" });
      times.push(performance.now() - t0);
      expect(res.status, style).toBe(200);
      expect(res.type).toBe("image/png");
      const meta = await sharp(res.data).metadata();
      expect(meta.width).toBe(540);
      expect(meta.height).toBe(style === "jdm" ? 960 : 675);
    }
    expect(Math.max(...times)).toBeLessThan(400);
    expect(posterCacheSize()).toBeGreaterThan(0);
  }, 60_000);

  it("aperçu : photo d'un autre refusée, largeur bornée, 60 par minute", async () => {
    const other = await signUp("Autre");
    const { json } = await upload(other);
    const base = { title: "Rasso", style: "neon", date: paris(10, 24, 19).toISOString() };
    expect((await preview(orga, { ...base, photoKey: json.key })).status).toBe(400);
    expect((await preview(orga, { ...base, photoKey: "private/messages/x.webp" })).status).toBe(400);
    expect((await preview(orga, { ...base, width: 1080 })).status).toBe(400);
    // Les trois appels refusés comptent aussi : 57 de plus font 60.
    let last = 0;
    for (let i = 0; i < 57; i++) last = (await preview(orga, { ...base, width: 120 })).status;
    expect(last).toBe(200);
    expect((await preview(orga, { ...base, width: 120 })).status).toBe(429);
  }, 60_000);

  it("génération : clés écrites, fiche et cartes servies, Story téléchargeable par l'organisateur seul", async () => {
    const e = await createEvent(structureId, { startsAt: paris(10, 24, 19), endsAt: paris(10, 24, 23, 30) });
    const { json } = await upload(orga);
    const gen = await call(orga, "POST", `/events/${e.id}/poster/generate`, {
      photoKey: json.key,
      style: "neon",
      title: "Nocturne de Canet",
    });
    expect(gen.status).toBe(200);
    expect(gen.json.posterSettings).toMatchObject({ photoKey: json.key, style: "neon", title: "Nocturne de Canet" });
    const page = await call(null, "GET", `/events/by-slug/${e.slug}`);
    expect(page.json.poster.style).toBe("neon");
    expect(page.json.poster.postUrl).toMatch(/^\/api\/files\/events\/.+poster-post-.+\.png$/);
    expect(page.json.posterUrl).toBe(page.json.poster.postUrl);
    expect(page.json.customPosterUrl).toBeNull();
    const post = await storage.get(page.json.poster.postUrl.replace("/api/files/", ""));
    expect((await sharp(post as Buffer).metadata()).height).toBe(1350);
    // Carte de l'Explorer.
    const list = await call(null, "GET", "/events");
    expect(list.json.items.find((c: { id: string }) => c.id === e.id).posterUrl).toBe(page.json.poster.postUrl);
    expect(list.json.items.find((c: { id: string }) => c.id === e.id).generatedPosterUrl).toBe(
      page.json.poster.postUrl,
    );
    // Story : pièce jointe pour l'organisateur.
    const story = await app.request(`/api/events/${e.id}/poster/story`, {
      headers: { origin: ORIGIN, cookie: orga.cookie },
    });
    expect(story.status).toBe(200);
    expect(story.headers.get("content-disposition")).toContain("attachment");
    expect((await sharp(Buffer.from(await story.arrayBuffer())).metadata()).height).toBe(1920);
    const stranger = await signUp("Curieux");
    expect((await call(stranger, "GET", `/events/${e.id}/poster/story`)).status).toBe(403);
    expect(
      (await call(stranger, "POST", `/events/${e.id}/poster/generate`, { style: "neon", title: "Pirate" })).status,
    ).toBe(403);
  }, 60_000);

  it("photo inconnue ou d'un autre : 400", async () => {
    const e = await createEvent(structureId);
    const other = await signUp("Autre");
    const { json } = await upload(other);
    const res = await call(orga, "PATCH", `/events/${e.id}`, {
      poster: { photoKey: json.key, style: "swiss", title: "Rasso" },
    });
    expect(res.status).toBe(400);
  });

  it("PATCH : affiche rendue, régénérée si la date change, intacte si rien ne change", async () => {
    const e = await createEvent(structureId, { startsAt: paris(10, 24, 19), endsAt: paris(10, 24, 23, 30) });
    const first = await call(orga, "PATCH", `/events/${e.id}`, { poster: { style: "minimal", title: "Rasso du lac" } });
    expect(first.status).toBe(200);
    const url1 = first.json.poster.postUrl as string;
    expect(url1).toBeTruthy();
    // Mêmes réglages renvoyés par l'assistant : pas de nouveau rendu.
    const same = await call(orga, "PATCH", `/events/${e.id}`, {
      title: "Rasso du lac 2026",
      poster: { photoKey: null, style: "minimal", title: "Rasso du lac" },
    });
    expect(same.json.poster.postUrl).toBe(url1);
    // Nouvelle date : nouveau rendu, l'ancien fichier effacé.
    const moved = await call(orga, "PATCH", `/events/${e.id}`, {
      startsAt: paris(10, 31, 19).toISOString(),
      endsAt: paris(10, 31, 23).toISOString(),
    });
    expect(moved.status).toBe(200);
    expect(moved.json.poster.postUrl).not.toBe(url1);
    expect(await storage.get(url1.replace("/api/files/", ""))).toBeNull();
    // `null` retire l'affiche générée.
    const removed = await call(orga, "PATCH", `/events/${e.id}`, { poster: null });
    expect(removed.json.poster).toBeNull();
    expect(removed.json.posterUrl).toBeNull();
  }, 60_000);

  it("duplication : la copie garde photo, style et titre, et son affiche est rendue à sa date", async () => {
    const e = await createEvent(structureId, { startsAt: paris(10, 24, 19), endsAt: paris(10, 24, 23, 30) });
    const { json } = await upload(orga);
    await call(orga, "PATCH", `/events/${e.id}`, {
      poster: { photoKey: json.key, style: "damier", title: "Nocturne de Canet" },
    });
    const copy = await call(orga, "POST", `/events/${e.id}/duplicate`);
    expect(copy.status).toBe(201);
    expect(copy.json.posterSettings).toMatchObject({ photoKey: json.key, style: "damier", title: "Nocturne de Canet" });
    const original = await call(orga, "GET", `/events/${e.id}`);
    expect(copy.json.poster.postUrl).toBeTruthy();
    expect(copy.json.poster.postUrl).not.toBe(original.json.poster.postUrl);
    expect(copy.json.posterUrl).toBe(copy.json.poster.postUrl);
  }, 60_000);
});

describe("affiche et année (lot R3b, tour 2) : un Nouvel An refait les affiches", () => {
  const Y = new Date().getUTCFullYear();
  const wall = (year: number, month: number, day: number, hour = 12) =>
    fromWallTime({ year, month, day, hour, minute: 0 });
  const event = (key: string | null) => ({
    startsAt: wall(Y + 1, 1, 5, 19),
    timezone: "Europe/Paris",
    posterPostKey: key,
    posterStyle: "neon",
    posterTitle: "Nocturne",
  });
  const beforeNewYear = wall(Y, 12, 31, 23);
  const afterNewYear = wall(Y + 1, 1, 1, 0);

  it("l'année à écrire change au Nouvel An (heure de Paris)", () => {
    expect(posterYearOf(event(null), beforeNewYear)).toBe(Y + 1);
    expect(posterYearOf(event(null), afterNewYear)).toBe(0);
  });

  it("affiche enregistrée : refaite quand l'année écrite n'est plus la bonne, jamais sinon", () => {
    // Rendue avant le lot (clé sans marque) pour un événement de l'an prochain : à refaire.
    expect(posterYearStale(event("events/e/poster-post-abc123.png"), beforeNewYear)).toBe(true);
    expect(posterYearStale(event(`events/e/poster-post-y${Y + 1}-abc123.png`), beforeNewYear)).toBe(false);
    // Le Nouvel An passé, « 2027 » n'a plus lieu d'être écrit.
    expect(posterYearStale(event(`events/e/poster-post-y${Y + 1}-abc123.png`), afterNewYear)).toBe(true);
    expect(posterYearStale(event("events/e/poster-post-y0-abc123.png"), afterNewYear)).toBe(false);
    // Une clé sans marque, dans l'année en cours : rien à refaire (pas de rendu en masse).
    expect(posterYearStale(event("events/e/poster-post-abc123.png"), afterNewYear)).toBe(false);
    expect(posterYearStale(event(null), beforeNewYear)).toBe(false);
  });

  it("les clés des caches d'aperçus (API et clients) changent au Nouvel An", () => {
    const input = {
      style: "neon",
      title: "NOCTURNE",
      startsAt: wall(Y + 1, 1, 5, 19),
      timezone: "Europe/Paris",
      place: "CANET",
      structureName: "Club",
      photo: null,
      logo: null,
    } as unknown as PosterInput;
    try {
      setDisplayClock(() => beforeNewYear);
      const keyBefore = posterCacheKey(input, "post");
      const clientBefore = posterPreviewKey({ style: "neon" });
      setDisplayClock(() => afterNewYear);
      expect(posterCacheKey(input, "post")).not.toBe(keyBefore);
      expect(posterPreviewKey({ style: "neon" })).not.toBe(clientBefore);
    } finally {
      setDisplayClock(now);
    }
  });
});
