// Fil d'un crew (lot R5c1) : appartenance (membre, chef, ancien membre, retiré, non-membre, compte suspendu), D36
// (aucune photo du fil hors du crew : vitrine, profil, garage, recherche, Explorer, plateau ; route protégée ; un membre
// qui part perd l'accès tout de suite), EXIF retiré et format d'origine, droits de retrait, flamme, commentaires et
// leurs notifications regroupées, sondage (une voix, changement, clos, fin passée), pagination stable avec les
// événements automatiques, export RGPD, suppression du compte, signalement, limite de débit.
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
} from "../../../../test/helpers";
import { app } from "../../../app";
import { db, pool } from "../../../db/client";
import { applications, crewPostPhotos, notifications, profiles } from "../../../db/schema";
import { resetRateLimits } from "../../../lib/rateLimit";
import { storage } from "../../../lib/storage";
import { accountService } from "../../account/service";

afterAll(async () => {
  await pool.end();
});

const ORIGIN = process.env.PUBLIC_URL ?? "http://localhost:5173";
const paris = (month: number, day: number, hour: number) => fromWallTime({ year: 2026, month, day, hour, minute: 0 });

let clock: ReturnType<typeof useClock>;
let ref: Awaited<ReturnType<typeof seedReference>>;

beforeEach(async () => {
  await resetDb();
  clock = useClock(paris(10, 1, 10));
  ref = await seedReference();
});

const bearerOf = (cookie: string) => {
  const raw = cookie
    .split("; ")
    .find((c) => c.startsWith("better-auth.session_token="))
    ?.slice("better-auth.session_token=".length);
  return raw ? decodeURIComponent(raw) : "";
};

async function req(u: TestUser | null, method: string, path: string, body?: unknown, bearer = false) {
  const res = await app.request(`/api${path}`, {
    method,
    headers: {
      origin: ORIGIN,
      ...(u && !bearer ? { cookie: u.cookie } : {}),
      ...(u && bearer ? { authorization: `Bearer ${bearerOf(u.cookie)}` } : {}),
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
    json = text;
  }
  return { status: res.status, json, text };
}

async function raw(u: TestUser | null, path: string, bearer = false) {
  return app.request(`/api${path}`, {
    headers: {
      origin: ORIGIN,
      ...(u && !bearer ? { cookie: u.cookie } : {}),
      ...(u && bearer ? { authorization: `Bearer ${bearerOf(u.cookie)}` } : {}),
    },
  });
}

/** Photo JPEG d'essai, avec des métadonnées EXIF (position GPS) quand `gps` est vrai. */
async function jpeg(width: number, height: number, gps = false) {
  let img = sharp({ create: { width, height, channels: 3, background: { r: 120, g: 60, b: 30 } } }).jpeg();
  if (gps) {
    img = img.withExif({
      IFD0: { Copyright: "Orasso test", Make: "Pixel" },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "42/1 41/1 0/1", GPSLongitudeRef: "E", GPSLongitude: "2/1 53/1 0/1" },
    });
  }
  return img.toBuffer();
}

async function upload(u: TestUser, data: Buffer, purpose = "crew_post") {
  const form = new FormData();
  form.append("purpose", purpose);
  form.append("file", new File([new Uint8Array(data)], "photo.jpg", { type: "image/jpeg" }));
  const res = await app.request("/api/me/uploads", {
    method: "POST",
    headers: { origin: ORIGIN, cookie: u.cookie },
    body: form,
  });
  return { status: res.status, json: (await res.json()) as { key: string; width: number; height: number } };
}

let counter = 0;
async function newCrew(leader: TestUser) {
  const res = await req(leader, "POST", "/crews", { name: `Crew fil ${++counter}`, department: "66" });
  expect(res.status).toBe(201);
  return res.json as { id: string; slug: string; name: string };
}

async function addToCrew(crewId: string, leader: TestUser, member: TestUser) {
  expect((await req(member, "POST", `/crews/${crewId}/requests`, { message: null })).status).toBe(201);
  expect((await req(leader, "POST", `/crews/${crewId}/requests/${member.id}/accept`)).status).toBe(204);
}

async function crewOf3() {
  const kenji = await signUp("Kenji");
  const nina = await signUp("Nina");
  const lea = await signUp("Lea");
  const crew = await newCrew(kenji);
  await addToCrew(crew.id, kenji, nina);
  await addToCrew(crew.id, kenji, lea);
  return { kenji, nina, lea, crew };
}

async function photoPost(u: TestUser, crewId: string, sizes: [number, number][] = [[1200, 600]], text = "Lavée") {
  const keys: string[] = [];
  for (const [w, h] of sizes) {
    const up = await upload(u, await jpeg(w, h));
    expect(up.status).toBe(201);
    keys.push(up.json.key);
  }
  const res = await req(u, "POST", `/crews/${crewId}/posts`, { kind: "photo", text, photoKeys: keys });
  expect(res.status).toBe(201);
  return res.json as { id: string; photos: { url: string; width: number; height: number }[] };
}

describe("appartenance", () => {
  it("membre et chef lisent le fil ; non-membre, ancien membre, retiré, suspendu : 404 comme un crew inconnu", async () => {
    const { kenji, nina, lea, crew } = await crewOf3();
    const paul = await signUp("Paul");
    const post = await photoPost(nina, crew.id);
    expect((await req(kenji, "GET", `/crews/${crew.id}/feed`)).status).toBe(200);
    expect((await req(nina, "GET", `/crews/${crew.id}/feed`, undefined, true)).status).toBe(200);
    const unknown = await req(paul, "GET", "/crews/00000000-0000-4000-8000-000000000000/feed");
    const outsider = await req(paul, "GET", `/crews/${crew.id}/feed`);
    expect(outsider.status).toBe(404);
    expect(outsider.json).toEqual(unknown.json);
    // Écritures d'un non-membre : 404 aussi.
    expect((await req(paul, "POST", `/crews/${crew.id}/posts`, { kind: "text", text: "Salut" })).status).toBe(404);
    expect((await req(paul, "PUT", `/crews/${crew.id}/posts/${post.id}/reaction`)).status).toBe(404);
    expect((await req(paul, "GET", `/crews/${crew.id}/posts/${post.id}/comments`)).status).toBe(404);
    expect((await req(paul, "GET", `/crews/${crew.id}/post-options`)).status).toBe(404);
    // Léa part : plus rien, tout de suite (fil, photo).
    expect((await req(lea, "DELETE", `/crews/${crew.id}/members/${lea.id}`)).status).toBe(204);
    expect((await req(lea, "GET", `/crews/${crew.id}/feed`)).status).toBe(404);
    expect((await raw(lea, post.photos[0]!.url.replace(/^\/api/, ""))).status).toBe(404);
    // Nina retirée par le chef : pareil.
    expect((await raw(nina, post.photos[0]!.url.replace(/^\/api/, ""))).status).toBe(200);
    expect((await req(kenji, "DELETE", `/crews/${crew.id}/members/${nina.id}`)).status).toBe(204);
    expect((await req(nina, "GET", `/crews/${crew.id}/feed`)).status).toBe(404);
    expect((await raw(nina, post.photos[0]!.url.replace(/^\/api/, ""))).status).toBe(404);
    expect((await req(nina, "POST", `/crews/${crew.id}/posts`, { kind: "text", text: "Encore là ?" })).status).toBe(
      404,
    );
    // Chef suspendu : 404 aussi (lecture comprise).
    await db
      .update(profiles)
      .set({ suspendedUntil: new Date(clock.now.getTime() + 7 * 24 * HOUR) })
      .where(eq(profiles.userId, kenji.id));
    expect((await req(kenji, "GET", `/crews/${crew.id}/feed`)).status).toBe(404);
  });

  it("les publications d'un auteur suspendu disparaissent du fil, puis reviennent", async () => {
    const { kenji, nina, crew } = await crewOf3();
    await req(nina, "POST", `/crews/${crew.id}/posts`, { kind: "text", text: "Coucou" });
    const count = async () =>
      (await req(kenji, "GET", `/crews/${crew.id}/feed`)).json.items.filter((i: { type: string }) => i.type === "post")
        .length;
    expect(await count()).toBe(1);
    await db
      .update(profiles)
      .set({ suspendedUntil: new Date(clock.now.getTime() + 24 * HOUR) })
      .where(eq(profiles.userId, nina.id));
    expect(await count()).toBe(0);
    clock.advance(25 * HOUR);
    expect(await count()).toBe(1);
  });
});

describe("photos (D36)", () => {
  it("format d'origine, EXIF retiré, adresse protégée, jamais servie par /api/files", async () => {
    const { kenji, nina, lea, crew } = await crewOf3();
    const withGps = await jpeg(1200, 600, true);
    expect((await sharp(withGps).metadata()).exif).toBeDefined();
    const up1 = await upload(nina, withGps);
    const up2 = await upload(nina, await jpeg(1000, 3000));
    expect(up1.json.key).toMatch(/^private\/crew-posts\/[0-9a-f-]{36}\.webp$/);
    const res = await req(nina, "POST", `/crews/${crew.id}/posts`, {
      kind: "photo",
      text: "Deux formats",
      photoKeys: [up1.json.key, up2.json.key],
    });
    expect(res.status).toBe(201);
    // Format d'origine : paysage 2:1 gardé, portrait réduit à 2048 px de haut (jamais un carré).
    expect(res.json.photos.map((p: { width: number; height: number }) => [p.width, p.height])).toEqual([
      [1200, 600],
      [683, 2048],
    ]);
    const url: string = res.json.photos[0].url;
    expect(url).toMatch(new RegExp(`^/api/crews/${crew.id}/photos/[0-9a-f-]{36}\\.webp$`));
    // EXIF retiré du fichier gardé et servi.
    const [stored] = await db.select().from(crewPostPhotos).where(eq(crewPostPhotos.storageKey, up1.json.key));
    const file = await storage.get(stored!.storageKey);
    const meta = await sharp(file!).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.format).toBe("webp");
    const served = await raw(lea, url.replace(/^\/api/, ""), true);
    expect(served.status).toBe(200);
    expect(served.headers.get("cache-control")).toBe("private, no-cache");
    expect((await sharp(Buffer.from(await served.arrayBuffer())).metadata()).exif).toBeUndefined();
    // Jamais public : /api/files refuse les clés privées ; un autre crew ne la sert pas.
    expect((await raw(kenji, `/files/${up1.json.key}`)).status).toBe(404);
    const other = await newCrew(lea);
    expect((await raw(lea, `/crews/${other.id}/photos/${url.split("/").at(-1)}`)).status).toBe(404);
    // Une clé déjà rattachée ne se rattache pas deux fois.
    const again = await req(nina, "POST", `/crews/${crew.id}/posts`, { kind: "photo", photoKeys: [up1.json.key] });
    expect(again.status).toBe(400);
    // La clé d'un autre ne se rattache pas.
    const up3 = await upload(lea, await jpeg(400, 300));
    expect(
      (await req(nina, "POST", `/crews/${crew.id}/posts`, { kind: "photo", photoKeys: [up3.json.key] })).status,
    ).toBe(400);
  });

  it("aucune photo du fil hors du crew : vitrine, profil, garage, recherche, Explorer, plateau", async () => {
    const { kenji, nina, crew } = await crewOf3();
    const paul = await signUp("Paul");
    const vehicle = await createVehicle(nina.id, ref);
    const up = await upload(nina, await jpeg(800, 600));
    const post = await req(nina, "POST", `/crews/${crew.id}/posts`, {
      kind: "photo",
      text: "Ma voiture",
      photoKeys: [up.json.key],
      vehicleId: vehicle.id,
    });
    expect(post.status).toBe(201);
    expect(post.json.vehicle.id).toBe(vehicle.id);
    const name = up.json.key.split("/").at(-1);
    const structure = await createStructure(kenji.id);
    const event = await createEvent(structure.id, { startsAt: new Date(clock.now.getTime() + 5 * 24 * HOUR) });
    const outside = [
      await req(paul, "GET", `/crews/by-slug/${crew.slug}`),
      await req(nina, "GET", `/crews/by-slug/${crew.slug}`),
      await req(nina, "GET", `/crews/${crew.id}/members`),
      await req(paul, "GET", `/users/${nina.pseudo}`),
      await req(kenji, "GET", `/users/${nina.pseudo}`),
      await req(nina, "GET", "/me/vehicles"),
      await req(nina, "GET", `/me/vehicles/${vehicle.id}`),
      await req(paul, "GET", `/search?q=${encodeURIComponent(nina.pseudo.slice(0, 4))}`),
      await req(paul, "GET", `/crews/search?q=${encodeURIComponent("Crew fil")}`),
      await req(paul, "GET", "/events"),
      await req(paul, "GET", `/events/${event.id}/lineup`),
      await req(nina, "GET", "/me/crews"),
    ];
    for (const r of outside) {
      expect(r.status, r.text.slice(0, 200)).toBeLessThan(500);
      expect(r.text).not.toContain("crew-posts");
      expect(r.text).not.toContain(name);
      expect(r.text).not.toContain("/photos/");
    }
  });
});

describe("droits de retrait", () => {
  it("l'auteur ou le chef retire une publication ou un commentaire ; un autre membre : 403", async () => {
    const { kenji, nina, lea, crew } = await crewOf3();
    const post = await photoPost(nina, crew.id, [
      [600, 400],
      [400, 600],
    ]);
    const keys = (await db.select().from(crewPostPhotos)).map((p) => p.storageKey);
    expect(keys).toHaveLength(2);
    const comment = await req(lea, "POST", `/crews/${crew.id}/posts/${post.id}/comments`, { text: "Belle !" });
    expect(comment.status).toBe(201);
    expect(comment.json).toEqual({
      id: expect.any(String),
      author: { userId: lea.id, pseudo: lea.pseudo, avatarUrl: null, grade: "rodage" },
      text: "Belle !",
      createdAt: expect.any(String),
      mine: true,
      canRemove: true,
    });
    // Liste blanche : ce que voit Nina (autrice de la publication) du commentaire de Léa.
    const seen = await req(nina, "GET", `/crews/${crew.id}/posts/${post.id}/comments`);
    expect(seen.json.items[0]).toMatchObject({ mine: false, canRemove: false });
    expect(Object.keys(seen.json.items[0]).sort()).toEqual(["author", "canRemove", "createdAt", "id", "mine", "text"]);
    expect((await req(nina, "DELETE", `/crews/${crew.id}/comments/${comment.json.id}`)).status).toBe(403);
    expect((await req(kenji, "DELETE", `/crews/${crew.id}/comments/${comment.json.id}`)).status).toBe(204);
    expect((await req(nina, "GET", `/crews/${crew.id}/posts/${post.id}/comments`)).json.items).toHaveLength(0);
    expect((await req(lea, "DELETE", `/crews/${crew.id}/posts/${post.id}`)).status).toBe(403);
    // Le chef retire : la publication disparaît, ses photos aussi (fichiers et lignes), l'adresse ne sert plus rien.
    expect((await req(kenji, "DELETE", `/crews/${crew.id}/posts/${post.id}`)).status).toBe(204);
    expect((await raw(nina, post.photos[0]!.url.replace(/^\/api/, ""))).status).toBe(404);
    expect(await db.select().from(crewPostPhotos)).toHaveLength(0);
    for (const k of keys) expect(await storage.get(k)).toBeNull();
    expect((await req(nina, "DELETE", `/crews/${crew.id}/posts/${post.id}`)).status).toBe(404);
    // L'auteur retire la sienne.
    const own = await req(lea, "POST", `/crews/${crew.id}/posts`, { kind: "text", text: "Oups" });
    expect((await req(lea, "DELETE", `/crews/${crew.id}/posts/${own.json.id}`)).status).toBe(204);
    const feed = await req(kenji, "GET", `/crews/${crew.id}/feed`);
    expect(feed.json.items.filter((i: { type: string }) => i.type === "post")).toHaveLength(0);
  });
});

describe("flamme et commentaires", () => {
  it("une flamme par personne, comptée ; commentaires notifiés à l'auteur, regroupés, sans image ni texte", async () => {
    const { kenji, nina, lea, crew } = await crewOf3();
    const post = await photoPost(nina, crew.id);
    for (let i = 0; i < 2; i++) {
      const on = await req(kenji, "PUT", `/crews/${crew.id}/posts/${post.id}/reaction`);
      expect(on.json).toEqual({ firesCount: 1, firedByMe: true });
    }
    expect((await req(lea, "PUT", `/crews/${crew.id}/posts/${post.id}/reaction`)).json).toEqual({
      firesCount: 2,
      firedByMe: true,
    });
    expect((await req(kenji, "DELETE", `/crews/${crew.id}/posts/${post.id}/reaction`)).json).toEqual({
      firesCount: 1,
      firedByMe: false,
    });
    await req(nina, "POST", `/crews/${crew.id}/posts/${post.id}/comments`, { text: "Merci" });
    await req(kenji, "POST", `/crews/${crew.id}/posts/${post.id}/comments`, { text: "Top la STI" });
    await req(lea, "POST", `/crews/${crew.id}/posts/${post.id}/comments`, { text: "Trop belle" });
    const notes = await db.select().from(notifications).where(eq(notifications.type, "crew_post_comment"));
    expect(notes).toHaveLength(1);
    expect(notes[0]!.userId).toBe(nina.id);
    expect(notes[0]!.body).toContain("et 1 autre ont commenté");
    expect(notes[0]!.family).toBe("social");
    const blob = JSON.stringify(notes[0]);
    expect(blob).not.toContain("Top la STI");
    expect(blob).not.toContain("crew-posts");
    expect(blob).not.toContain("/photos/");
    // Lue, la suivante en crée une nouvelle.
    await db.update(notifications).set({ readAt: clock.now }).where(eq(notifications.id, notes[0]!.id));
    await req(kenji, "POST", `/crews/${crew.id}/posts/${post.id}/comments`, { text: "Encore" });
    expect(await db.select().from(notifications).where(eq(notifications.type, "crew_post_comment"))).toHaveLength(2);
    const feed = await req(lea, "GET", `/crews/${crew.id}/feed`);
    const item = feed.json.items.find((i: { type: string }) => i.type === "post");
    expect(item.post).toMatchObject({
      firesCount: 1,
      firedByMe: true,
      commentsCount: 4,
      mine: false,
      canRemove: false,
    });
    expect(Object.keys(item.post).sort()).toEqual(
      [
        "author",
        "canRemove",
        "commentsCount",
        "createdAt",
        "crewId",
        "event",
        "firedByMe",
        "firesCount",
        "id",
        "kind",
        "mine",
        "photos",
        "poll",
        "text",
        "vehicle",
      ].sort(),
    );
    // Commentaire trop long : 400.
    expect(
      (await req(lea, "POST", `/crews/${crew.id}/posts/${post.id}/comments`, { text: "x".repeat(301) })).status,
    ).toBe(400);
  });
});

describe("sondage", () => {
  it("une voix modifiable, résultats sans les votants, « ton choix », clos par l'auteur ou le chef", async () => {
    const { kenji, nina, lea, crew } = await crewOf3();
    const created = await req(nina, "POST", `/crews/${crew.id}/posts`, {
      kind: "poll",
      poll: { question: "On roule où dimanche ?", options: ["Les Aspres", "La côte", "Le Canigou"] },
    });
    expect(created.status).toBe(201);
    const poll = created.json.poll;
    expect(poll).toMatchObject({
      question: "On roule où dimanche ?",
      totalVotes: 0,
      myOptionId: null,
      open: true,
      canClose: true,
    });
    const [aspres, cote] = poll.options;
    // Les autres membres sont prévenus, une fois.
    const notes = await db.select().from(notifications).where(eq(notifications.type, "crew_poll_new"));
    expect(notes.map((n) => n.userId).sort()).toEqual([kenji.id, lea.id].sort());
    expect(
      (await req(kenji, "PUT", `/crews/${crew.id}/posts/${created.json.id}/vote`, { optionId: aspres.id })).status,
    ).toBe(200);
    expect(
      (await req(lea, "PUT", `/crews/${crew.id}/posts/${created.json.id}/vote`, { optionId: aspres.id })).status,
    ).toBe(200);
    // Léa change d'avis : toujours une seule voix.
    const changed = await req(lea, "PUT", `/crews/${crew.id}/posts/${created.json.id}/vote`, { optionId: cote.id });
    expect(changed.json.poll.totalVotes).toBe(2);
    expect(changed.json.poll.myOptionId).toBe(cote.id);
    expect(changed.json.poll.options.map((o: { votes: number }) => o.votes)).toEqual([1, 1, 0]);
    expect(changed.json.poll.canClose).toBe(false);
    // Jamais qui a voté quoi.
    expect(JSON.stringify(changed.json.poll)).not.toContain(kenji.id);
    expect(Object.keys(changed.json.poll.options[0]).sort()).toEqual(["id", "label", "votes"]);
    // Réponse d'un autre sondage : 400.
    expect(
      (await req(lea, "PUT", `/crews/${crew.id}/posts/${created.json.id}/vote`, { optionId: crew.id })).status,
    ).toBe(400);
    // Voix simultanées : jamais de 500.
    const both = await Promise.all([
      req(kenji, "PUT", `/crews/${crew.id}/posts/${created.json.id}/vote`, { optionId: cote.id }),
      req(kenji, "PUT", `/crews/${crew.id}/posts/${created.json.id}/vote`, { optionId: aspres.id }),
    ]);
    for (const r of both) expect([200, 409]).toContain(r.status);
    // Clore : Léa non, le chef oui ; ensuite plus de voix.
    expect((await req(lea, "POST", `/crews/${crew.id}/posts/${created.json.id}/close`)).status).toBe(403);
    const closed = await req(kenji, "POST", `/crews/${crew.id}/posts/${created.json.id}/close`);
    expect(closed.json.poll).toMatchObject({ open: false, canClose: false });
    expect(closed.json.poll.closedAt).not.toBeNull();
    const late = await req(lea, "PUT", `/crews/${crew.id}/posts/${created.json.id}/vote`, { optionId: aspres.id });
    expect(late.status).toBe(400);
    expect(late.json.error.message).toBe("Ce sondage est clos.");
  });

  it("date de fin : dans le futur, au plus 90 jours ; une fois passée, le sondage est clos", async () => {
    const { nina, lea, crew } = await crewOf3();
    const base = { question: "Samedi ou dimanche ?", options: ["Samedi", "Dimanche"] };
    const past = await req(nina, "POST", `/crews/${crew.id}/posts`, {
      kind: "poll",
      poll: { ...base, endsAt: new Date(clock.now.getTime() - HOUR).toISOString() },
    });
    expect(past.status).toBe(400);
    const far = await req(nina, "POST", `/crews/${crew.id}/posts`, {
      kind: "poll",
      poll: { ...base, endsAt: new Date(clock.now.getTime() + 91 * 24 * HOUR).toISOString() },
    });
    expect(far.status).toBe(400);
    const one = await req(nina, "POST", `/crews/${crew.id}/posts`, {
      kind: "poll",
      poll: { ...base, options: ["Seul"] },
    });
    expect(one.status).toBe(400);
    const same = await req(nina, "POST", `/crews/${crew.id}/posts`, {
      kind: "poll",
      poll: { ...base, options: ["Oui", "oui"] },
    });
    expect(same.status).toBe(400);
    const ok = await req(nina, "POST", `/crews/${crew.id}/posts`, {
      kind: "poll",
      poll: { ...base, endsAt: new Date(clock.now.getTime() + 2 * HOUR).toISOString() },
    });
    expect(ok.status).toBe(201);
    const optionId = ok.json.poll.options[0].id;
    expect((await req(lea, "PUT", `/crews/${crew.id}/posts/${ok.json.id}/vote`, { optionId })).status).toBe(200);
    clock.advance(3 * HOUR);
    expect((await req(lea, "PUT", `/crews/${crew.id}/posts/${ok.json.id}/vote`, { optionId })).status).toBe(400);
    const feed = await req(lea, "GET", `/crews/${crew.id}/feed`);
    const item = feed.json.items.find((i: { type: string; post?: { id: string } }) => i.post?.id === ok.json.id);
    expect(item.post.poll).toMatchObject({ open: false, totalVotes: 1, myOptionId: optionId });
  });
});

describe("fil : sources et pagination", () => {
  it("20 par page, curseur stable même à date égale, avec les arrivées et le crew retenu", async () => {
    const { kenji, nina, lea, crew } = await crewOf3();
    // Crew retenu : deux membres retenus à un événement publié, inscrits en crew.
    const structure = await createStructure(kenji.id);
    const event = await createEvent(structure.id, {
      title: "Cars & Coffee",
      startsAt: new Date(clock.now.getTime() + 5 * 24 * HOUR),
    });
    for (const u of [nina, lea]) {
      const vehicle = await createVehicle(u.id, ref);
      await db.insert(applications).values({
        eventId: event.id,
        userId: u.id,
        vehicleId: vehicle.id,
        status: "accepted",
        rulesAcceptedAt: clock.now,
        followStructure: false,
        crewId: crew.id,
        decidedAt: clock.now,
      });
    }
    // 24 publications à la même seconde (horloge figée) : départage par identifiant.
    for (let i = 0; i < 24; i++) {
      if (i === 20) resetRateLimits();
      expect((await req(nina, "POST", `/crews/${crew.id}/posts`, { kind: "text", text: `Message ${i}` })).status).toBe(
        201,
      );
    }
    const seen: string[] = [];
    const dates: number[] = [];
    // biome-ignore lint/suspicious/noExplicitAny: entrées du fil lues librement
    const all: any[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page = await req(kenji, "GET", `/crews/${crew.id}/feed${cursor ? `?cursor=${cursor}` : ""}`);
      expect(page.status).toBe(200);
      expect(page.json.items.length).toBeLessThanOrEqual(20);
      for (const it of page.json.items) {
        seen.push(it.key);
        all.push(it);
        dates.push(new Date(it.at).getTime());
      }
      cursor = page.json.nextCursor;
      pages++;
    } while (cursor && pages < 5);
    expect(pages).toBe(2);
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.filter((k) => k.startsWith("post:"))).toHaveLength(24);
    expect(seen.filter((k) => k.startsWith("member_joined:")).sort()).toEqual(
      [`member_joined:${nina.id}`, `member_joined:${lea.id}`].sort(),
    );
    expect(seen).toContain(`crew_accepted:${event.id}`);
    const accepted = all.find((i: { type: string }) => i.type === "crew_accepted");
    expect(accepted).toMatchObject({
      event: { id: event.id, title: "Cars & Coffee" },
      members: expect.arrayContaining([nina.pseudo, lea.pseudo]),
    });
    const joined = all.find((i: { type: string }) => i.type === "member_joined");
    expect(Object.keys(joined).sort()).toEqual(["at", "key", "person", "type", "vehicleLabel"]);
    // 24 publications, 2 arrivées, 1 crew retenu ; les dates décroissent d'une page à l'autre.
    expect(seen).toHaveLength(27);
    expect(dates).toEqual([...dates].sort((a, b) => b - a));
    // Curseur illisible : la première page.
    expect((await req(kenji, "GET", `/crews/${crew.id}/feed?cursor=nimporte`)).status).toBe(200);
  });

  it("les plus récentes d'abord ; le chef n'a pas d'arrivée ; publication texte avec véhicule et événement", async () => {
    const { kenji, nina, crew } = await crewOf3();
    const structure = await createStructure(kenji.id);
    const event = await createEvent(structure.id, { startsAt: new Date(clock.now.getTime() + 3 * 24 * HOUR) });
    const vehicle = await createVehicle(nina.id, ref);
    clock.advance(HOUR);
    const first = await req(nina, "POST", `/crews/${crew.id}/posts`, {
      kind: "text",
      text: "Premier",
      vehicleId: vehicle.id,
      eventId: event.id,
    });
    expect(first.json.vehicle).toMatchObject({ id: vehicle.id, label: expect.any(String), vehicleType: "car" });
    expect(first.json.event).toMatchObject({ id: event.id, slug: event.slug });
    clock.advance(HOUR);
    await req(nina, "POST", `/crews/${crew.id}/posts`, { kind: "text", text: "Second" });
    const feed = (await req(kenji, "GET", `/crews/${crew.id}/feed`)).json.items;
    expect(feed[0].post.text).toBe("Second");
    expect(feed[1].post.text).toBe("Premier");
    expect(feed.some((i: { key: string }) => i.key === `member_joined:${kenji.id}`)).toBe(false);
    // Véhicule d'un autre : refusé.
    const other = await createVehicle(kenji.id, ref);
    expect(
      (await req(nina, "POST", `/crews/${crew.id}/posts`, { kind: "text", text: "X", vehicleId: other.id })).status,
    ).toBe(400);
    // Texte vide sans photo : refusé.
    expect((await req(nina, "POST", `/crews/${crew.id}/posts`, { kind: "text", text: "  " })).status).toBe(400);
    expect((await req(nina, "POST", `/crews/${crew.id}/posts`, { kind: "photo", photoKeys: [] })).status).toBe(400);
    // Options du composeur : mes véhicules, l'événement, le nombre de membres.
    const opts = await req(nina, "GET", `/crews/${crew.id}/post-options`);
    expect(opts.json.crew).toMatchObject({ id: crew.id, membersCount: 3 });
    expect(opts.json.vehicles.map((v: { id: string }) => v.id)).toEqual([vehicle.id]);
  });
});

describe("compte, export, signalement, débit", () => {
  it("export RGPD : publications, commentaires, voix ; suppression du compte : tout part, photos comprises", async () => {
    const { kenji, nina, crew } = await crewOf3();
    const post = await photoPost(nina, crew.id);
    const poll = await req(kenji, "POST", `/crews/${crew.id}/posts`, {
      kind: "poll",
      poll: { question: "Quand ?", options: ["Samedi", "Dimanche"] },
    });
    await req(nina, "PUT", `/crews/${crew.id}/posts/${poll.json.id}/vote`, { optionId: poll.json.poll.options[1].id });
    await req(nina, "POST", `/crews/${crew.id}/posts/${poll.json.id}/comments`, { text: "Dimanche pour moi" });
    await req(kenji, "POST", `/crews/${crew.id}/posts/${post.id}/comments`, { text: "Belle" });
    const exp = await req(nina, "GET", "/me/export");
    expect(exp.status).toBe(200);
    expect(exp.json.crewFeed.posts).toHaveLength(1);
    expect(exp.json.crewFeed.posts[0]).toMatchObject({ crew: crew.name, kind: "photo", text: "Lavée" });
    expect(exp.json.crewFeed.comments).toEqual([expect.objectContaining({ text: "Dimanche pour moi" })]);
    expect(exp.json.crewFeed.votes).toEqual([expect.objectContaining({ question: "Quand ?", answer: "Dimanche" })]);
    expect(JSON.stringify(exp.json.crewFeed)).not.toContain("Belle");
    const keys = (await db.select().from(crewPostPhotos)).map((p) => p.storageKey);
    await accountService.anonymize(nina.id, null);
    const feed = (await req(kenji, "GET", `/crews/${crew.id}/feed`)).json.items;
    expect(
      feed.filter((i: { type: string }) => i.type === "post").map((i: { post: { id: string } }) => i.post.id),
    ).toEqual([poll.json.id]);
    const after = feed.find((i: { type: string }) => i.type === "post").post;
    expect(after.commentsCount).toBe(0);
    expect(after.poll.totalVotes).toBe(0);
    expect(await db.select().from(crewPostPhotos)).toHaveLength(0);
    for (const k of keys) expect(await storage.get(k)).toBeNull();
    expect(await db.select().from(notifications).where(eq(notifications.type, "crew_post_comment"))).toHaveLength(0);
  });

  it("signalement : un membre signale une publication ou un commentaire, un non-membre ne la voit pas", async () => {
    const { kenji, nina, lea, crew } = await crewOf3();
    const paul = await signUp("Paul");
    const post = await photoPost(nina, crew.id);
    const comment = await req(kenji, "POST", `/crews/${crew.id}/posts/${post.id}/comments`, { text: "Hmm" });
    const report = (u: TestUser, targetType: string, targetId: string) =>
      req(u, "POST", "/reports", { targetType, targetId, reason: targetType === "crew_post" ? "shocking" : "spam" });
    expect((await report(lea, "crew_post", post.id)).status).toBe(201);
    expect((await report(lea, "crew_comment", comment.json.id)).status).toBe(201);
    expect((await report(paul, "crew_post", post.id)).status).toBe(404);
    expect((await report(paul, "crew_comment", comment.json.id)).status).toBe(404);
  });

  it("limite de débit : 429 « Trop de publications »", async () => {
    const { nina, crew } = await crewOf3();
    for (let i = 0; i < 20; i++) {
      expect((await req(nina, "POST", `/crews/${crew.id}/posts`, { kind: "text", text: `n°${i}` })).status).toBe(201);
    }
    const res = await req(nina, "POST", `/crews/${crew.id}/posts`, { kind: "text", text: "de trop" });
    expect(res.status).toBe(429);
    expect(res.json.error.message).toBe("Trop de publications : réessaie plus tard.");
  });
});
