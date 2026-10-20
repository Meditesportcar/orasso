// Lot 47, relecture : le rendu de l'affiche ne fait jamais échouer une requête (reprise par une tâche), rendus
// limités à trois à la fois, rendu périmé ignoré, régénération (ville, récurrence, nom de la structure), repli de
// `posterUrl` sur l'affiche perso, textes difficiles (émojis, droite à gauche, caractères de contrôle).
import { fromWallTime } from "@orasso/shared";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { call, createEvent, createStructure, resetDb, signUp, type TestUser, useClock } from "../../../../test/helpers";
import { app } from "../../../app";
import { db, pool } from "../../../db/client";
import { events } from "../../../db/schema";
import { storage } from "../../../lib/storage";
import { activeRenders, clearPosterCache, MAX_CONCURRENT_RENDERS, posterEngine, render } from "./render";
import { posterService } from "./service";

afterAll(async () => {
  await pool.end();
});

const ORIGIN = process.env.PUBLIC_URL ?? "http://localhost:5173";
const paris = (month: number, day: number, hour: number, minute = 0) =>
  fromWallTime({ year: 2026, month, day, hour, minute });
const realRender = posterEngine.render;

let clock: ReturnType<typeof useClock>;
let orga: TestUser;
let structureId: string;

beforeEach(async () => {
  await resetDb();
  clearPosterCache();
  clock = useClock(paris(10, 1, 10));
  orga = await signUp("Damien", { twoFactor: true });
  structureId = (await createStructure(orga.id)).id;
});

afterEach(() => {
  posterEngine.render = realRender;
});

const posterJobs = () => clock.jobs.jobs.filter((j) => j.name === "event.poster-render");

describe("rendu en échec", () => {
  it("l'événement est enregistré (200), une tâche reprend le rendu, l'affiche arrive à la reprise", async () => {
    const e = await createEvent(structureId, { startsAt: paris(10, 24, 19), endsAt: paris(10, 24, 23) });
    posterEngine.render = async () => {
      throw new Error("rendu cassé");
    };
    const res = await call(orga, "PATCH", `/events/${e.id}`, { poster: { style: "neon", title: "Nocturne" } });
    expect(res.status).toBe(200);
    expect(res.json.posterSettings).toMatchObject({ style: "neon", title: "Nocturne" });
    expect(res.json.poster).toBeNull();
    // Une seule tâche par événement, avec reprise.
    await call(orga, "POST", `/events/${e.id}/poster/generate`, { style: "neon", title: "Nocturne" });
    expect(posterJobs()).toHaveLength(1);
    expect(posterJobs()[0]?.options).toMatchObject({ singletonKey: `poster:${e.id}`, retryLimit: 5 });
    // La tâche échoue tant que le moteur échoue (pg-boss reprendra), puis réussit.
    await expect(posterService.renderJob(e.id)).rejects.toThrow("rendu cassé");
    posterEngine.render = realRender;
    await posterService.renderJob(e.id);
    const page = await call(null, "GET", `/events/by-slug/${e.slug}`);
    expect(page.json.poster.style).toBe("neon");
  }, 60_000);

  it("création et duplication réussissent aussi quand le rendu échoue ; les anciens rendus restent", async () => {
    const e = await createEvent(structureId, { startsAt: paris(10, 24, 19), endsAt: paris(10, 24, 23) });
    const first = await call(orga, "PATCH", `/events/${e.id}`, { poster: { style: "swiss", title: "Rasso" } });
    const url = first.json.poster.postUrl as string;
    posterEngine.render = async () => {
      throw new Error("rendu cassé");
    };
    // Nouveau style : le rendu échoue, l'affiche en place reste servie (jamais remise à nul avant un rendu réussi).
    const changed = await call(orga, "PATCH", `/events/${e.id}`, { poster: { style: "retro", title: "Rasso" } });
    expect(changed.status).toBe(200);
    expect(changed.json.poster.postUrl).toBe(url);
    expect(await storage.get(url.replace("/api/files/", ""))).not.toBeNull();
    const copy = await call(orga, "POST", `/events/${e.id}/duplicate`);
    expect(copy.status).toBe(201);
    expect(copy.json.posterSettings).toMatchObject({ style: "retro" });
    expect(posterJobs().map((j) => j.data.eventId)).toEqual(expect.arrayContaining([e.id, copy.json.id]));
  }, 60_000);
});

describe("régénération", () => {
  it("changement de ville : nouvelle affiche ; rendu périmé (ville changée pendant le rendu) ignoré", async () => {
    const e = await createEvent(structureId, { startsAt: paris(10, 24, 19), endsAt: paris(10, 24, 23) });
    const first = await call(orga, "PATCH", `/events/${e.id}`, { poster: { style: "minimal", title: "Rasso" } });
    const moved = await call(orga, "PATCH", `/events/${e.id}`, { city: "Perpignan", lat: 42.69, lng: 2.89 });
    expect(moved.json.poster.postUrl).not.toBe(first.json.poster.postUrl);
    // Rendu commencé avec l'ancienne ville : il ne s'écrit pas.
    const row = await db.query.events.findFirst({ where: eq(events.id, e.id) });
    if (!row) throw new Error("événement");
    await db.update(events).set({ city: "Elne" }).where(eq(events.id, e.id));
    const after = await posterService.regenerate(row);
    expect(after.city).toBe("Elne");
    expect(after.posterPostKey).toBe(row.posterPostKey);
  }, 60_000);

  it("récurrence : chaque occurrence a son affiche, à sa date", async () => {
    const e = await createEvent(structureId, {
      startsAt: paris(10, 4, 9),
      endsAt: paris(10, 4, 12),
      status: "draft",
      publishedAt: null,
    });
    await call(orga, "PATCH", `/events/${e.id}`, { poster: { style: "jdm", title: "Cars & Coffee" } });
    const res = await call(orga, "POST", `/events/${e.id}/recurrence`, {
      rule: { kind: "weekly", interval: 1, count: 2 },
    });
    expect(res.status).toBe(201);
    const urls = res.json.map((c: { posterUrl: string | null }) => c.posterUrl);
    expect(urls.length).toBeGreaterThan(0);
    for (const u of urls) expect(u).toMatch(/poster-post-/);
    expect(new Set(urls).size).toBe(urls.length);
  }, 60_000);

  it("nouveau nom de structure : les affiches à venir sont remises en file", async () => {
    const e = await createEvent(structureId, { startsAt: paris(10, 24, 19), endsAt: paris(10, 24, 23) });
    await call(orga, "PATCH", `/events/${e.id}`, { poster: { style: "neon", title: "Rasso" } });
    expect(posterJobs()).toHaveLength(0);
    const res = await call(orga, "PATCH", `/structures/${structureId}`, { name: "Club renommé" });
    expect(res.status).toBe(200);
    expect(posterJobs().map((j) => j.data.eventId)).toEqual([e.id]);
  }, 60_000);
});

describe("repli de posterUrl et sécurité de l'aperçu", () => {
  it("sans affiche générée, les cartes montrent l'affiche perso", async () => {
    const e = await createEvent(structureId, { posterKey: "events/x/poster-perso.webp" });
    const list = await call(null, "GET", "/events");
    expect(list.json.items.find((c: { id: string }) => c.id === e.id).posterUrl).toBe(
      "/api/files/events/x/poster-perso.webp",
    );
    // Lot 44 : l'appli lit l'affiche générée seule et dessine le gabarit « Minimal » sans elle.
    expect(list.json.items.find((c: { id: string }) => c.id === e.id).generatedPosterUrl).toBeNull();
    const page = await call(null, "GET", `/events/by-slug/${e.slug}`);
    expect(page.json.customPosterUrl).toBe("/api/files/events/x/poster-perso.webp");
    expect(page.json.poster).toBeNull();
  });

  it("aperçu sans compte : 401", async () => {
    const res = await app.request("/api/posters/preview", {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json" },
      body: JSON.stringify({ style: "neon", title: "Rasso", date: paris(10, 24, 19).toISOString() }),
    });
    expect(res.status).toBe(401);
  });
});

describe("moteur", () => {
  const base = {
    startsAt: paris(10, 24, 19),
    timezone: "Europe/Paris",
    structureName: "MéditeSportCar",
    photo: null,
    logo: null,
  };

  it("émojis, droite à gauche, caractères de contrôle, ville très longue : rendu valide", async () => {
    for (const [style, title, place] of [
      ["neon", "Nocturne 🚗🔥 de Canet", "Canet"],
      ["mag", "تجمع السيارات", "Saint-Laurent-de-la-Salanque-et-Villelongue-dels-Monts"],
      ["damier", "Rasso\u0000\u0007\u001b du lac", "Elne\u0008"],
      ["minimal", "<b>&amp;</b>", "Port d'Avall"],
    ] as const) {
      const png = await render({ ...base, style, title, place }, "post", 540);
      const meta = await sharp(png).metadata();
      expect([meta.format, meta.width, meta.height], style).toEqual(["png", 540, 675]);
    }
  }, 60_000);

  it(`trois rendus au plus en même temps (${MAX_CONCURRENT_RENDERS})`, async () => {
    let peak = 0;
    posterEngine.render = async (input, format, width) => {
      peak = Math.max(peak, activeRenders());
      await new Promise((r) => setTimeout(r, 30));
      return realRender(input, format, width);
    };
    await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        render({ ...base, style: "minimal", title: `Rasso ${i}`, place: "Elne" }, "post", 120),
      ),
    );
    expect(peak).toBeLessThanOrEqual(MAX_CONCURRENT_RENDERS);
    expect(peak).toBeGreaterThan(1);
    expect(activeRenders()).toBe(0);
  }, 60_000);
});
