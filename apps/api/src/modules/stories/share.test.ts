// Partager un contenu d'Orasso (lot R7f4) : cartes liées rendues par le serveur (dimensions, plaque floutée, tête d'affiche),
// story sans média, contenu devenu privé → carte inerte, organisateur prévenu (compte public) ou non (privé), export d'une
// story (auteur seul, refusé pour un crew, signature), publication du Fil en 4:5, carte au Fil, feuille « Partager ».
// Aucune plaque lisible : les photos d'essai sont du bruit coloré.

import { randomUUID } from "node:crypto";
import { fromWallTime, STORY_H, STORY_W, shareLabels } from "@orasso/shared";
import { and, eq, sql } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  allCategoriesId,
  blurPlatesOf,
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
  audiencePrizeResults,
  eventInvitations,
  events,
  notifications,
  profiles,
  stories,
  storyTags,
  userFollows,
  vehiclePhotos,
} from "../../db/schema";
import { resetRateLimits } from "../../lib/rateLimit";
import { storage } from "../../lib/storage";
import { blurPlateRegions } from "../vehicles/photos-blur";
import { CANVAS_H, CANVAS_W, renderCard, renderGround, signFile } from "./card";

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
  const buf = Buffer.from(await res.arrayBuffer());
  let json: // biome-ignore lint/suspicious/noExplicitAny: réponses JSON lues librement dans les tests
  any = null;
  try {
    json = JSON.parse(buf.toString("utf8"));
  } catch {
    json = null;
  }
  return { status: res.status, json, buf, headers: res.headers };
}

/** Bruit coloré : très « texturé », sans texte ni plaque. */
async function noise(width = 1600, height = 900) {
  const raw = Buffer.alloc(width * height * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 2654435761) % 251;
  return sharp(raw, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 95 })
    .toBuffer();
}

/** Variance des niveaux de gris d'une zone. */
async function variance(data: Buffer, r: { left: number; top: number; width: number; height: number }) {
  const { data: px } = await sharp(data).extract(r).greyscale().raw().toBuffer({ resolveWithObject: true });
  const mean = px.reduce((a, b) => a + b, 0) / px.length;
  return px.reduce((a, b) => a + (b - mean) ** 2, 0) / px.length;
}

/** Un véhicule à photo montrable : le fichier est du bruit (plaque floutée posée à l'envoi, comme le fait l'API). */
async function maskedVehicle(owner: TestUser) {
  const v = await createVehicle(owner.id, ref);
  const [photo] = await db.select().from(vehiclePhotos).where(eq(vehiclePhotos.vehicleId, v.id));
  await storage.put(
    photo?.storageKey as string,
    await sharp(await noise(1200, 800))
      .webp()
      .toBuffer(),
  );
  await blurPlatesOf(owner.id);
  return v;
}

const follow = async (a: TestUser, b: TestUser) => {
  await req(a, "POST", `/users/${b.pseudo}/follow`);
  await db
    .update(userFollows)
    .set({ status: "accepted", acceptedAt: clock.now })
    .where(and(eq(userFollows.followerId, a.id), eq(userFollows.followedId, b.id)));
};
const makePrivate = (u: TestUser) =>
  db.update(profiles).set({ visibility: "private" }).where(eq(profiles.userId, u.id));

type Over = Record<string, unknown>;
const share = (u: TestUser, linked: { type: string; id: string }, over: Over = {}) =>
  req(u, "POST", "/me/stories", { linked, clientId: randomUUID(), audience: "public", ...over });

async function structureEvent(owner: TestUser, over: Partial<typeof events.$inferInsert> = {}) {
  const s = await createStructure(owner.id);
  const e = await createEvent(s.id, { title: "Rassemblement du Lydia", city: "Le Barcarès", ...over });
  return { s, e };
}

const byAuthor = (u: TestUser, owner: TestUser) => req(u, "GET", `/stories/by-author/u:${owner.id}`);
const fileOf = (view: { mediaUrl: string }) => view.mediaUrl.replace(/^\/api/, "");

describe("carte rendue par le serveur", () => {
  it("1080 × 1350 à fond transparent, fond 1080 × 1920 en couverture", async () => {
    const card = await renderCard({
      kicker: "Sport · @damien_66",
      title: "Toyota GR Supra",
      subtitle: "Toyota · A90 · Blanche",
      badge: "1re · 19 voix",
      stats: [{ label: "Puissance", value: "340", unit: "ch" }],
      stripe: true,
      photo: await noise(),
    });
    const meta = await sharp(card).metadata();
    expect([meta.width, meta.height, meta.hasAlpha]).toEqual([CANVAS_W, CANVAS_H, true]);
    // Les coins du canevas sont transparents (la carte est posée avec ses marges et penchée).
    const corner = await sharp(card).extract({ left: 0, top: 0, width: 4, height: 4 }).raw().toBuffer();
    expect(corner[3]).toBe(0);
    const ground = await renderGround(await noise(), 1080, 1920);
    const gm = await sharp(ground).metadata();
    expect([gm.width, gm.height]).toEqual([1080, 1920]);
  });

  it("un nom très long reste entier sur une ligne, sans photo : le cadre de la marque", async () => {
    const card = await renderCard({
      kicker: "Voiture",
      title: "Mercedes-Benz AMG GT Black Series Édition Spéciale Pack Carbone",
      subtitle: "",
      badge: null,
      stats: [],
      stripe: false,
      photo: null,
    });
    expect((await sharp(card).metadata()).height).toBe(CANVAS_H);
  });

  it("la plaque floutée de la photo reste floutée sur la carte (variance de la zone)", async () => {
    // Photo de 1600 × 900 dont une bande centrale est floutée comme le fait l'API à l'envoi.
    const src = await noise();
    const rect = { x: 0.3, y: 0.4, w: 0.4, h: 0.2 };
    const blurred = (await blurPlateRegions(src, [rect])).data;
    const spec = { kicker: "Voiture", title: "Test", subtitle: "", badge: null, stats: [], stripe: false };
    const plain = await renderCard({ ...spec, photo: src });
    const masked = await renderCard({ ...spec, photo: blurred });
    // Dans la carte (860 × 620 de photo, posée à (110, 145)), le centre de la bande est à (540, 455).
    const band = { left: 480, top: 430, width: 120, height: 50 };
    const away = { left: 150, top: 200, width: 120, height: 50 };
    const before = await variance(plain, band);
    const after = await variance(masked, band);
    expect(before).toBeGreaterThan(50);
    expect(after).toBeLessThan(before * 0.2);
    expect(Math.abs((await variance(masked, away)) - (await variance(plain, away)))).toBeLessThan(80);
  });
});

describe("story sans média : une voiture", () => {
  it("compose le 9:16, garde le lien, rend la carte touchable ; la reprise rend la même story", async () => {
    const kenji = await signUp("Kenji");
    const nina = await signUp("Nina");
    const v = await maskedVehicle(kenji);
    const clientId = randomUUID();
    const res = await share(
      kenji,
      { type: "vehicle", id: v.id },
      { clientId, frame: { scale: 1.3, offsetX: 40, offsetY: -80 } },
    );
    expect(res.status, JSON.stringify(res.json)).toBe(201);
    expect(res.json.status).toBe("ready");
    const [row] = await db.select().from(stories).where(eq(stories.id, res.json.id));
    expect(row).toMatchObject({ linkedType: "vehicle", linkedId: v.id, plateState: "blurred", mediaKind: "photo" });
    const view = (await byAuthor(nina, kenji)).json.stories[0];
    expect(view.linked).toMatchObject({ type: "vehicle", id: v.id, label: "Voir la voiture" });
    const file = await req(nina, "GET", fileOf(view));
    const meta = await sharp(file.buf).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([STORY_W, STORY_H, "webp"]);
    // Même `clientId` : la même story, pas de doublon.
    const again = await req(kenji, "POST", "/me/stories", {
      linked: { type: "vehicle", id: v.id },
      clientId,
      audience: "public",
    });
    expect(again.status).toBe(201);
    expect(again.json.id).toBe(res.json.id);
    expect(await db.select().from(stories)).toHaveLength(1);
  });

  it("sans photo montrable (plaque non décidée) : refusé, aucune story ; la voiture d'un autre : introuvable", async () => {
    const kenji = await signUp("Kenji");
    const nina = await signUp("Nina");
    const v = await createVehicle(kenji.id, ref);
    const refused = await share(kenji, { type: "vehicle", id: v.id });
    expect(refused.status).toBe(409);
    expect(refused.json.error.code).toBe("no_masked_photo");
    expect(await db.select().from(stories)).toHaveLength(0);
    await blurPlatesOf(kenji.id);
    expect((await share(nina, { type: "vehicle", id: v.id })).status).toBe(404);
  });

  it("la voiture archivée ou passée à un autre : la carte devient inerte (linked null), rien de la voiture n'est renvoyé", async () => {
    const kenji = await signUp("Kenji");
    const nina = await signUp("Nina");
    const v = await maskedVehicle(kenji);
    await share(kenji, { type: "vehicle", id: v.id });
    expect((await byAuthor(nina, kenji)).json.stories[0].linked).not.toBeNull();
    await db.execute(sql`update vehicles set status = 'sold' where id = ${v.id}`);
    const after = (await byAuthor(nina, kenji)).json.stories[0];
    expect(after.linked).toBeNull();
    expect(JSON.stringify(after)).not.toContain(v.id);
  });
});

describe("story sans média : un événement", () => {
  it("compte public : la structure est identifiée et son propriétaire prévenu ; la carte ouvre l'événement", async () => {
    const kenji = await signUp("Kenji");
    const orga = await signUp("Orga");
    const nina = await signUp("Nina");
    const { s, e } = await structureEvent(orga);
    const res = await share(kenji, { type: "event", id: e.id });
    expect(res.status, JSON.stringify(res.json)).toBe(201);
    expect(res.json.skipped).toEqual([]);
    const tags = await db.select().from(storyTags).where(eq(storyTags.storyId, res.json.id));
    expect(tags).toEqual([expect.objectContaining({ targetKind: "structure", targetId: s.id })]);
    const told = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, orga.id), eq(notifications.type, "story_mention")));
    expect(told).toHaveLength(1);
    const view = (await byAuthor(nina, kenji)).json.stories[0];
    expect(view.linked).toMatchObject({ type: "event", slug: e.slug, label: "Voir l'événement" });
  });

  it("compte privé : la story part, sans identification ni notification (la feuille le dit)", async () => {
    const kenji = await signUp("Kenji");
    const orga = await signUp("Orga");
    const { e } = await structureEvent(orga);
    await makePrivate(kenji);
    const info = await req(kenji, "GET", `/me/share/info?type=event&id=${e.id}`);
    expect(info.json.organizerNotified).toBe(false);
    const res = await share(kenji, { type: "event", id: e.id }, { audience: "followers" });
    expect(res.status, JSON.stringify(res.json)).toBe(201);
    expect(res.json.skipped).toEqual([]);
    expect(await db.select().from(storyTags)).toHaveLength(0);
    expect(await db.select().from(notifications).where(eq(notifications.type, "story_mention"))).toHaveLength(0);
    const [row] = await db.select().from(stories).where(eq(stories.id, res.json.id));
    expect(row?.linkedType).toBe("event");
  });

  it("un brouillon ou un événement sur invitation ne se partage pas ; devenu brouillon, la carte devient inerte", async () => {
    const kenji = await signUp("Kenji");
    const nina = await signUp("Nina");
    const orga = await signUp("Orga");
    const draft = await structureEvent(orga, { status: "draft" });
    expect((await share(kenji, { type: "event", id: draft.e.id })).status).toBe(404);
    const { e } = await structureEvent(orga);
    await share(kenji, { type: "event", id: e.id });
    expect((await byAuthor(nina, kenji)).json.stories[0].linked).not.toBeNull();
    await db.update(events).set({ status: "draft" }).where(eq(events.id, e.id));
    const view = (await byAuthor(nina, kenji)).json.stories[0];
    expect(view.linked).toBeNull();
    expect(JSON.stringify(view)).not.toContain(e.slug);
  });

  it("une story de crew avec un événement : pas d'identification de la structure", async () => {
    const kenji = await signUp("Kenji");
    const orga = await signUp("Orga");
    const { e } = await structureEvent(orga);
    const crew = (await req(kenji, "POST", "/crews", { name: "Crew partage", department: "66" })).json;
    const res = await share(kenji, { type: "event", id: e.id }, { audience: "crew", crewId: crew.id });
    expect(res.status, JSON.stringify(res.json)).toBe(201);
    expect(await db.select().from(storyTags)).toHaveLength(0);
  });
});

describe("autres contenus liés", () => {
  it("un souvenir sans tampon : introuvable ; un vote pas encore clos : 409 ; une publication inconnue : 404", async () => {
    const kenji = await signUp("Kenji");
    const orga = await signUp("Orga");
    const { e } = await structureEvent(orga);
    expect((await share(kenji, { type: "memory", id: e.id })).status).toBe(404);
    const voteId = await allCategoriesId(e.id);
    const open = await share(kenji, { type: "vote_result", id: voteId });
    expect(open.status).toBe(409);
    expect(open.json.error.code).toBe("vote_open");
    expect((await share(kenji, { type: "feed_post", id: randomUUID() })).status).toBe(404);
  });

  it("une publication du Fil : repartageable si l'auteur est public (ou moi) ; refusée si l'auteur est privé", async () => {
    const kenji = await signUp("Kenji");
    const nina = await signUp("Nina");
    const lea = await signUp("Lea");
    const photoUp = async (u: TestUser) => {
      const form = new FormData();
      form.append("purpose", "feed_post");
      form.append("file", new File([new Uint8Array(await noise(800, 1000))], "p.jpg", { type: "image/jpeg" }));
      const r = await app.request("/api/me/uploads", {
        method: "POST",
        headers: { origin: ORIGIN, cookie: u.cookie },
        body: form,
      });
      return ((await r.json()) as { key: string }).key;
    };
    const posted = await req(nina, "POST", "/me/feed-posts", {
      caption: "Belle sortie",
      photos: [{ uploadKey: await photoUp(nina), noPlateConfirmed: true }],
      aspect: "portrait_4_5",
    });
    expect(posted.status, JSON.stringify(posted.json)).toBe(201);
    const ok = await share(kenji, { type: "feed_post", id: posted.json.id });
    expect(ok.status, JSON.stringify(ok.json)).toBe(201);
    const [row] = await db.select().from(stories).where(eq(stories.id, ok.json.id));
    expect(row).toMatchObject({ linkedType: "feed_post", plateState: "none_confirmed" });
    // L'auteur passe en privé : Léa ne le suit pas, la publication n'est plus visible pour elle, la carte devient inerte.
    expect((await byAuthor(lea, kenji)).json.stories[0].linked).not.toBeNull();
    // « Vers l'extérieur » : pas proposé pour la publication d'un autre (l'export la refuserait), ni à un autre lecteur.
    expect((await byAuthor(kenji, kenji)).json.stories[0].exportable).toBe(false);
    expect((await req(kenji, "GET", `/stories/${ok.json.id}/export`)).status).toBe(403);
    expect((await byAuthor(lea, kenji)).json.stories[0].exportable).toBe(false);
    await makePrivate(nina);
    const view = (await byAuthor(lea, kenji)).json.stories[0];
    expect(view.linked).toBeNull();
    expect((await share(kenji, { type: "feed_post", id: posted.json.id })).status).toBe(404);
    // Suivi accepté : visible, mais un compte privé ne se repartage pas.
    await follow(kenji, nina);
    const refused = await share(kenji, { type: "feed_post", id: posted.json.id });
    expect(refused.status).toBe(403);
    expect(refused.json.error.code).toBe("private_author");
    // L'auteur partage sa propre publication, même privée.
    const own = await share(nina, { type: "feed_post", id: posted.json.id }, { audience: "followers" });
    expect(own.status).toBe(201);
    expect((await byAuthor(nina, nina)).json.stories[0].exportable).toBe(true);
  });
});

describe("la feuille « Partager »", () => {
  it("destinations ouvertes et raisons des fermées", async () => {
    const kenji = await signUp("Kenji");
    const orga = await signUp("Orga");
    const { e } = await structureEvent(orga);
    const ev = (await req(kenji, "GET", `/me/share/info?type=event&id=${e.id}`)).json;
    expect(ev.destinations).toEqual({ story: true, feed: true, message: true, external: true });
    expect(ev.linkLabel).toBe("Voir l'événement");
    expect(ev.organizerNotified).toBe(true);
    expect(ev.url).toContain(`/e/${e.slug}`);
    const v = await createVehicle(kenji.id, ref);
    const car = (await req(kenji, "GET", `/me/share/info?type=vehicle&id=${v.id}`)).json;
    // L'affiche du lot 50 (qui produit elle-même une photo sûre) reste ouverte ; story et Fil montreraient la photo nette.
    expect(car.destinations).toEqual({ story: false, feed: false, message: true, external: true });
    expect(car.reasons.external).toBeUndefined();
    expect(car.formats).toEqual([]);
    expect((await req(kenji, "GET", `/me/share/export?type=vehicle&id=${v.id}&format=story`)).status).toBe(409);
    expect(car.reasons.story).toContain("plaque floutée");
    // Sans photo montrable, « En message » porte tout de même la page publique de la voiture (jamais l'accueil).
    expect(car.destinations.message).toBe(true);
    expect(car.url).toContain(`/v/${v.id}`);
    // Le nom de la voiture reste (en-tête de la feuille) et le message final le porte : jamais « Partager : https://… ».
    expect(car.title).toBeTruthy();
    expect(shareLabels.messageBody(car.title || shareLabels.title, car.url)).toBe(`${car.title} : ${car.url}`);
    expect(shareLabels.messageBody(car.title || shareLabels.title, car.url)).not.toMatch(/^Partager/);
    await blurPlatesOf(kenji.id);
    const ready = (await req(kenji, "GET", `/me/share/info?type=vehicle&id=${v.id}`)).json;
    expect(ready.destinations).toEqual({ story: true, feed: true, message: true, external: true });
    expect((await req(null, "GET", `/me/share/info?type=event&id=${e.id}`)).status).toBe(401);
    expect((await req(kenji, "GET", `/me/share/info?type=event&id=${randomUUID()}`)).status).toBe(404);
  });
});

describe("fichiers qui sortent d'Orasso", () => {
  it("ma story en 9:16 signé « orasso.fr » (la zone de la signature n'est plus unie) ; pas celle d'un autre", async () => {
    const kenji = await signUp("Kenji");
    const nina = await signUp("Nina");
    const orga = await signUp("Orga");
    const { e } = await structureEvent(orga);
    const res = await share(kenji, { type: "event", id: e.id });
    const out = await req(kenji, "GET", `/stories/${res.json.id}/export`);
    expect(out.status).toBe(200);
    expect(out.headers.get("content-type")).toBe("image/jpeg");
    const meta = await sharp(out.buf).metadata();
    expect([meta.width, meta.height]).toEqual([STORY_W, STORY_H]);
    // Le coin bas droit (au-dessus de la zone recouverte par l'application de destination) porte la signature.
    const corner = { left: 700, top: STORY_H - 250 - 80, width: 320, height: 80 };
    const stored = await req(kenji, "GET", fileOf((await req(kenji, "GET", "/me/stories")).json.stories[0]));
    expect(await variance(out.buf, corner)).toBeGreaterThan((await variance(stored.buf, corner)) + 300);
    expect((await req(nina, "GET", `/stories/${res.json.id}/export`)).status).toBe(403);
    expect((await req(null, "GET", `/stories/${res.json.id}/export`)).status).toBe(401);
  });

  it("une story de crew ne sort jamais : 403 crew_only, pour l'auteur comme pour un autre", async () => {
    const kenji = await signUp("Kenji");
    const nina = await signUp("Nina");
    const orga = await signUp("Orga");
    const { e } = await structureEvent(orga);
    const crew = (await req(kenji, "POST", "/crews", { name: "Crew sortie", department: "66" })).json;
    const res = await share(kenji, { type: "event", id: e.id }, { audience: "crew", crewId: crew.id });
    for (const u of [kenji, nina]) {
      const out = await req(u, "GET", `/stories/${res.json.id}/export`);
      expect(out.status).toBe(403);
      expect(out.json.error.code).toBe("crew_only");
    }
  });

  it("une publication du Fil sort en 4:5 signé, pour son auteur seul", async () => {
    const kenji = await signUp("Kenji");
    const nina = await signUp("Nina");
    const form = new FormData();
    form.append("purpose", "feed_post");
    form.append("file", new File([new Uint8Array(await noise(1350, 1080))], "p.jpg", { type: "image/jpeg" }));
    const up = await app.request("/api/me/uploads", {
      method: "POST",
      headers: { origin: ORIGIN, cookie: kenji.cookie },
      body: form,
    });
    const posted = await req(kenji, "POST", "/me/feed-posts", {
      photos: [{ uploadKey: ((await up.json()) as { key: string }).key, noPlateConfirmed: true }],
      aspect: "landscape",
    });
    expect(posted.status, JSON.stringify(posted.json)).toBe(201);
    const out = await req(kenji, "GET", `/feed-posts/${posted.json.id}/export`);
    expect(out.status).toBe(200);
    const meta = await sharp(out.buf).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([1080, 1350, "jpeg"]);
    expect((await req(nina, "GET", `/feed-posts/${posted.json.id}/export`)).status).toBe(403);
    // Une publication d'un autre ne part pas non plus par la route des contenus partagés.
    expect((await req(nina, "GET", `/me/share/export?type=feed_post&id=${posted.json.id}&format=post`)).status).toBe(
      403,
    );
  });

  it("un événement en 9:16 ou en 4:5, signé ; une voiture sans photo montrable est refusée", async () => {
    const kenji = await signUp("Kenji");
    const orga = await signUp("Orga");
    const { e } = await structureEvent(orga);
    const story = await req(kenji, "GET", `/me/share/export?type=event&id=${e.id}&format=story`);
    expect(story.status).toBe(200);
    expect((await sharp(story.buf).metadata()).height).toBe(STORY_H);
    const post = await req(kenji, "GET", `/me/share/export?type=event&id=${e.id}&format=post&download=1`);
    expect(post.headers.get("content-disposition")).toContain("attachment");
    expect((await sharp(post.buf).metadata()).height).toBe(CANVAS_H);
    const v = await createVehicle(kenji.id, ref);
    expect((await req(kenji, "GET", `/me/share/export?type=vehicle&id=${v.id}&format=story`)).status).toBe(409);
    await blurPlatesOf(kenji.id);
    expect((await req(kenji, "GET", `/me/share/export?type=vehicle&id=${v.id}&format=story`)).status).toBe(200);
  });

  it("la signature se pose sur n'importe quelle image 9:16 ou 4:5", async () => {
    const base = await sharp({ create: { width: 1080, height: 1350, channels: 3, background: "#202020" } })
      .png()
      .toBuffer();
    const out = await signFile(base, { width: 1080, height: 1350 });
    expect(await variance(out, { left: 700, top: 1350 - 44 - 70, width: 320, height: 70 })).toBeGreaterThan(300);
  });
});

describe("carte au Fil en 4:5", () => {
  it("un événement et une voiture se publient au Fil : image rendue 1080 × 1350, plaque décidée, lien posé", async () => {
    const kenji = await signUp("Kenji");
    const nina = await signUp("Nina");
    const orga = await signUp("Orga");
    const { e } = await structureEvent(orga);
    const v = await maskedVehicle(kenji);
    const ev = await req(kenji, "POST", "/me/feed-posts", {
      linked: { type: "event", id: e.id },
      clientId: randomUUID(),
      caption: "On y va",
    });
    expect(ev.status, JSON.stringify(ev.json)).toBe(201);
    expect(ev.json.event.slug).toBe(e.slug);
    expect(ev.json.aspect).toBe("portrait_4_5");
    expect(ev.json.photos).toHaveLength(1);
    expect([ev.json.photos[0].width, ev.json.photos[0].height]).toEqual([1080, 1350]);
    const car = await req(kenji, "POST", "/me/feed-posts", {
      linked: { type: "vehicle", id: v.id },
      clientId: randomUUID(),
    });
    expect(car.status, JSON.stringify(car.json)).toBe(201);
    expect(car.json.vehicle.id).toBe(v.id);
    // La photo est servie par la route protégée (session) ; Nina la voit (compte public).
    const photo = await req(nina, "GET", car.json.photos[0].url.replace(/^\/api/, ""));
    expect(photo.status).toBe(200);
    // Sans photo montrable : refus, et l'envoi d'une photo seule ou d'un lien seul reste exigé.
    const bare = await createVehicle(nina.id, ref);
    expect(
      (await req(nina, "POST", "/me/feed-posts", { linked: { type: "vehicle", id: bare.id }, clientId: randomUUID() }))
        .status,
    ).toBe(409);
    expect((await req(kenji, "POST", "/me/feed-posts", { clientId: randomUUID() })).status).toBe(400);
    // Seuls un événement et une voiture se partagent au Fil.
    expect((await req(kenji, "POST", "/me/feed-posts", { linked: { type: "memory", id: e.id } })).status).toBe(400);
    // Reprise : le même `clientId` rend la même publication.
    const clientId = randomUUID();
    const first = await req(kenji, "POST", "/me/feed-posts", { linked: { type: "event", id: e.id }, clientId });
    const again = await req(kenji, "POST", "/me/feed-posts", { linked: { type: "event", id: e.id }, clientId });
    expect(again.json.id).toBe(first.json.id);
  });
});

// --- Tour 2 : contenus privés et plaques dans ce qui sort ---------------------------------------------------------------

/** Dépose une photo de Fil (bruit) et publie : l'identifiant de la publication. */
async function postFeed(u: TestUser, over: Over = {}) {
  const form = new FormData();
  form.append("purpose", "feed_post");
  form.append("file", new File([new Uint8Array(await noise(800, 1000))], "p.jpg", { type: "image/jpeg" }));
  const up = await app.request("/api/me/uploads", {
    method: "POST",
    headers: { origin: ORIGIN, cookie: u.cookie },
    body: form,
  });
  const posted = await req(u, "POST", "/me/feed-posts", {
    caption: "Belle sortie",
    photos: [{ uploadKey: ((await up.json()) as { key: string }).key, noPlateConfirmed: true }],
    aspect: "portrait_4_5",
    ...over,
  });
  expect(posted.status, JSON.stringify(posted.json)).toBe(201);
  return posted.json.id as string;
}

/** Un événement terminé dont le vote « Toutes catégories » est clos et réglé, gagné par la voiture de `exhibitor`. */
async function closedVote(
  orga: TestUser,
  exhibitor: TestUser,
  over: Partial<typeof events.$inferInsert> = {},
  photo: "blurred" | "none_confirmed" = "blurred",
) {
  const structure = await createStructure(orga.id);
  const car = await maskedVehicle(exhibitor);
  if (photo === "none_confirmed") {
    await db
      .update(vehiclePhotos)
      .set({ plateBlurred: false, noPlateConfirmed: true })
      .where(eq(vehiclePhotos.vehicleId, car.id));
  }
  const ended = new Date(clock.now.getTime() - 26 * 3_600_000);
  const event = await createEvent(structure.id, {
    title: "Nocturne du port",
    city: "Argelès",
    startsAt: new Date(ended.getTime() - 4 * 3_600_000),
    endsAt: ended,
    ...over,
  });
  const [win] = await db
    .insert(applications)
    .values({
      eventId: event.id,
      userId: exhibitor.id,
      vehicleId: car.id,
      status: "accepted",
      rulesAcceptedAt: clock.now,
      followStructure: false,
      decidedAt: new Date(ended.getTime() - 40 * 3_600_000),
    })
    .returning();
  const voteId = await allCategoriesId(event.id);
  await db.insert(audiencePrizeResults).values({
    eventId: event.id,
    voteId,
    applicationId: win?.id as string,
    rank: 1,
    votes: 9,
    winner: true,
    createdAt: clock.now,
  });
  await db.update(events).set({ settledAt: clock.now }).where(eq(events.id, event.id));
  return { event, voteId };
}

describe("tour 2 : un classement d'un événement sur invitation ne se repartage pas", () => {
  it("ouvert à tous : partageable ; passé sur invitation, un invité ne peut ni le publier ni l'exporter, la carte devient inerte", async () => {
    const guest = await signUp("Invite");
    const orga = await signUp("Orga");
    const winner = await signUp("Gagnant");
    const { event, voteId } = await closedVote(orga, winner);
    const ok = await share(guest, { type: "vote_result", id: voteId });
    expect(ok.status, JSON.stringify(ok.json)).toBe(201);
    expect((await byAuthor(winner, guest)).json.stories[0].linked).not.toBeNull();

    await db.update(events).set({ admission: "invite_only" }).where(eq(events.id, event.id));
    await db
      .insert(eventInvitations)
      .values({ eventId: event.id, userId: guest.id, token: randomUUID(), status: "pending" });
    // L'invité voit encore le résultat (lire), mais ne le repartage pas : ni en story publique, ni en fichier.
    expect((await req(guest, "GET", `/events/${event.id}/votes/${voteId}`)).status).toBe(200);
    const refused = await share(guest, { type: "vote_result", id: voteId });
    expect(refused.status).toBe(404);
    expect((await req(guest, "GET", `/me/share/export?type=vote_result&id=${voteId}&format=story`)).status).toBe(404);
    expect((await req(guest, "GET", `/me/share/export?type=vote_result&id=${voteId}&format=post`)).status).toBe(404);
    expect((await req(guest, "GET", `/me/share/info?type=vote_result&id=${voteId}`)).status).toBe(404);
    // La story déjà publiée : la carte devient inerte et son fichier ne sort plus.
    expect((await byAuthor(winner, guest)).json.stories[0].linked).toBeNull();
    expect((await req(guest, "GET", `/stories/${ok.json.id}/export`)).status).toBe(404);
  });

  it("un événement non publié (annulé) : même refus", async () => {
    const guest = await signUp("Invite");
    const orga = await signUp("Orga");
    const winner = await signUp("Gagnant");
    const { event, voteId } = await closedVote(orga, winner);
    expect((await share(guest, { type: "vote_result", id: voteId })).status).toBe(201);
    await db.update(events).set({ status: "cancelled" }).where(eq(events.id, event.id));
    expect((await share(guest, { type: "vote_result", id: voteId })).status).toBe(404);
  });

  it("la plaque de la story d'un vote suit la vraie photo du gagnant (floutée, ou confirmée sans plaque)", async () => {
    const guest = await signUp("Invite");
    const orga = await signUp("Orga");
    const winner = await signUp("Gagnant");
    const a = await closedVote(orga, winner);
    const first = await share(guest, { type: "vote_result", id: a.voteId });
    expect((await db.select().from(stories).where(eq(stories.id, first.json.id)))[0]?.plateState).toBe("blurred");
    const orga2 = await signUp("Orga2");
    const winner2 = await signUp("Gagnant2");
    const b = await closedVote(orga2, winner2, {}, "none_confirmed");
    const second = await share(guest, { type: "vote_result", id: b.voteId });
    expect(second.status, JSON.stringify(second.json)).toBe(201);
    expect((await db.select().from(stories).where(eq(stories.id, second.json.id)))[0]?.plateState).toBe(
      "none_confirmed",
    );
  });
});

describe("tour 2 : l'export d'une story garde la provenance de son contenu", () => {
  it("la publication d'un autre, partagée en story puis exportée : 403 author_only ; la mienne sort", async () => {
    const kenji = await signUp("Kenji");
    const nina = await signUp("Nina");
    const post = await postFeed(nina);
    const copy = await share(kenji, { type: "feed_post", id: post });
    expect(copy.status, JSON.stringify(copy.json)).toBe(201);
    const refused = await req(kenji, "GET", `/stories/${copy.json.id}/export`);
    expect(refused.status).toBe(403);
    expect(refused.json.error.code).toBe("author_only");
    // Pareil par la route des contenus pas encore partagés (déjà refusé avant ce tour).
    expect((await req(kenji, "GET", `/me/share/export?type=feed_post&id=${post}&format=post`)).status).toBe(403);
    // L'auteur partage sa propre publication en story : elle sort.
    const own = await share(nina, { type: "feed_post", id: post }, { audience: "followers" });
    expect((await req(nina, "GET", `/stories/${own.json.id}/export`)).status).toBe(200);
  });
});

/** La photo de la carte (860 × 620 posée à (110, 145)) : le cadre sombre uni, hors du O de la marque. */
const photoCorner = { left: 140, top: 190, width: 90, height: 50 };

describe("tour 2 : l'affiche d'un événement ne sort jamais nette (pas de décision de plaque)", () => {
  it("carte, 9:16 et 4:5 : le cadre de la marque et un fond illisible, même si l'affiche porte une zone de plaque", async () => {
    const kenji = await signUp("Kenji");
    const orga = await signUp("Orga");
    const { e } = await structureEvent(orga);
    // Affiche = bruit très contrasté de bout en bout : une « plaque » lisible partout si elle sortait nette.
    const key = `private/test-affiche-${randomUUID()}.jpg`;
    const poster = await noise(1600, 900);
    await storage.put(key, poster);
    await db.update(events).set({ posterPhotoKey: key }).where(eq(events.id, e.id));
    expect(await variance(poster, { left: 600, top: 400, width: 120, height: 50 })).toBeGreaterThan(500);

    const card = await req(kenji, "GET", `/me/share/card?type=event&id=${e.id}&part=card`);
    expect(card.status).toBe(200);
    // La photo de la carte (860 × 620 posée à (110, 145)) : le cadre sombre uni, hors du O de la marque.
    expect(await variance(card.buf, photoCorner)).toBeLessThan(40);
    const ground = await req(kenji, "GET", `/me/share/card?type=event&id=${e.id}&part=ground`);
    expect(await variance(ground.buf, { left: 300, top: 900, width: 120, height: 50 })).toBeLessThan(40);

    const edge = { left: 0, top: 0, width: 30, height: 30 };
    const story = await req(kenji, "GET", `/me/share/export?type=event&id=${e.id}&format=story`);
    expect(await variance(story.buf, { left: 20, top: 20, width: 200, height: 200 })).toBeLessThan(40);
    expect(await variance(story.buf, { left: 140, top: 480, width: 90, height: 50 })).toBeLessThan(40);
    const post = await req(kenji, "GET", `/me/share/export?type=event&id=${e.id}&format=post`);
    expect(await variance(post.buf, edge)).toBeLessThan(40);
    expect(await variance(post.buf, photoCorner)).toBeLessThan(40);

    // Une story d'événement : son 9:16 stocké n'est pas net non plus, et la plaque décidée est « floutée » (rien de lisible).
    const made = await share(kenji, { type: "event", id: e.id });
    const stored = await req(kenji, "GET", fileOf((await req(kenji, "GET", "/me/stories")).json.stories[0]));
    expect(await variance(stored.buf, { left: 140, top: 480, width: 90, height: 50 })).toBeLessThan(40);
    const [row] = await db.select().from(stories).where(eq(stories.id, made.json.id));
    expect(row?.plateState).toBe("blurred");
  });

  it("la publication d'un événement au Fil : photo rendue sans l'affiche nette", async () => {
    const kenji = await signUp("Kenji");
    const orga = await signUp("Orga");
    const { e } = await structureEvent(orga);
    const key = `private/test-affiche-${randomUUID()}.jpg`;
    await storage.put(key, await noise(1600, 900));
    await db.update(events).set({ posterPhotoKey: key }).where(eq(events.id, e.id));
    const ev = await req(kenji, "POST", "/me/feed-posts", {
      linked: { type: "event", id: e.id },
      clientId: randomUUID(),
    });
    expect(ev.status, JSON.stringify(ev.json)).toBe(201);
    const photo = await req(kenji, "GET", ev.json.photos[0].url.replace(/^\/api/, ""));
    expect(await variance(photo.buf, photoCorner)).toBeLessThan(40);
  });
});

describe("tour 4 : `exportable` suit exactement l'export", () => {
  const exportOf = (u: TestUser, storyId: string) => req(u, "GET", `/stories/${storyId}/export`);

  it("événement annulé après la publication : la carte reste, exportable faux, export refusé", async () => {
    const kenji = await signUp("Kenji");
    const orga = await signUp("Orga");
    const { e } = await structureEvent(orga);
    const posted = await share(kenji, { type: "event", id: e.id });
    expect((await byAuthor(kenji, kenji)).json.stories[0].exportable).toBe(true);
    expect((await exportOf(kenji, posted.json.id)).status).toBe(200);
    await db.update(events).set({ status: "cancelled" }).where(eq(events.id, e.id));
    const view = (await byAuthor(kenji, kenji)).json.stories[0];
    expect(view.exportable).toBe(false);
    expect((await exportOf(kenji, posted.json.id)).status).toBe(404);
  });

  it("événement passé sur invitation : exportable faux et export refusé", async () => {
    const kenji = await signUp("Kenji");
    const orga = await signUp("Orga");
    const { e } = await structureEvent(orga);
    const posted = await share(kenji, { type: "event", id: e.id });
    await db.update(events).set({ admission: "invite_only" }).where(eq(events.id, e.id));
    expect((await byAuthor(kenji, kenji)).json.stories[0].exportable).toBe(false);
    expect((await exportOf(kenji, posted.json.id)).status).toBe(404);
  });

  it("vote sans classement : exportable faux et export refusé (409), de façon cohérente", async () => {
    const guest = await signUp("Invite");
    const orga = await signUp("Orga");
    const winner = await signUp("Gagnant");
    const { voteId } = await closedVote(orga, winner);
    const posted = await share(guest, { type: "vote_result", id: voteId });
    expect(posted.status, JSON.stringify(posted.json)).toBe(201);
    expect((await byAuthor(guest, guest)).json.stories[0].exportable).toBe(true);
    expect((await exportOf(guest, posted.json.id)).status).toBe(200);
    await db.delete(audiencePrizeResults).where(eq(audiencePrizeResults.voteId, voteId));
    const view = (await byAuthor(guest, guest)).json.stories[0];
    expect(view.exportable).toBe(false);
    expect((await exportOf(guest, posted.json.id)).status).toBe(409);
  });

  it("voiture sans photo montrable après la publication : exportable faux et export refusé", async () => {
    const kenji = await signUp("Kenji");
    const car = await maskedVehicle(kenji);
    const posted = await share(kenji, { type: "vehicle", id: car.id });
    expect((await byAuthor(kenji, kenji)).json.stories[0].exportable).toBe(true);
    await db
      .update(vehiclePhotos)
      .set({ plateBlurred: false, noPlateConfirmed: false })
      .where(eq(vehiclePhotos.vehicleId, car.id));
    const view = (await byAuthor(kenji, kenji)).json.stories[0];
    expect(view.exportable).toBe(false);
    expect((await exportOf(kenji, posted.json.id)).status).toBe(409);
  });
});
