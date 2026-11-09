// Lot R7e1 : l'API du Fil. Vie privée d'abord : jamais un contenu de crew, jamais la publication d'un compte privé non
// suivi, jamais un compte suspendu, jamais une photo dont la plaque n'est pas traitée, jamais sans session ; décision de
// plaque obligatoire à la publication ; curseur sans doublon ni trou ; signalement et média réservés à la modération.
import { randomBytes, randomUUID } from "node:crypto";
import { FEED_CURSOR_MAX, type FeedCard, type FeedCardKind, feedCardKinds } from "@orasso/shared";
import { eq, inArray } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  allCategoriesId,
  blurPlatesOf,
  call,
  createEvent,
  createPro,
  createStructure,
  createVehicle,
  resetDb,
  seedReference,
  signUp,
  signUpExtras,
  type TestUser,
  useClock,
} from "../../../test/helpers";
import { app } from "../../app";
import { db, pool } from "../../db/client";
import {
  applications,
  audiencePrizeResults,
  eventAnnouncements,
  events,
  feedPostPhotos,
  feedPostReactions,
  feedPosts,
  profiles,
  reports,
  structureFollows,
  uploads,
  userFollows,
  vehiclePhotos,
  vehicles,
} from "../../db/schema";
import { storage } from "../../lib/storage";
import { withTx } from "../../lib/tx";
import { retryRemove } from "../vehicles/photos-blur";
import { anonymizeFeedForDeletedAccount } from "./anonymize";
import { cursorCardId, decodeCursor, encodeCursor } from "./cursor";
import { feedPhotoKey } from "./posts";

afterAll(async () => {
  await pool.end();
});

let ref: Awaited<ReturnType<typeof seedReference>>;
let clock: ReturnType<typeof useClock>;

const HOUR = 3_600_000;
const ORIGIN = process.env.PUBLIC_URL ?? "http://localhost:5173";

beforeEach(async () => {
  await resetDb();
  // Un peu en avance sur l'horloge de la base : les lignes créées « maintenant » sont avant l'instant du parcours.
  clock = useClock(new Date(Date.now() + 10 * 60_000));
  ref = await seedReference();
});

const hoursAgo = (h: number) => new Date(clock.now.getTime() - h * HOUR);

async function person(
  pseudo: string,
  opts: { visibility?: "public" | "private"; departments?: string[]; role?: "moderator" | "super_admin" } = {},
) {
  const u = await signUp(pseudo, opts.role ? { twoFactor: true, role: opts.role } : {});
  await db
    .update(profiles)
    .set({ visibility: opts.visibility ?? "public", departments: opts.departments ?? ["66"] })
    .where(eq(profiles.userId, u.id));
  return u;
}

const follow = (a: TestUser, b: TestUser, status: "accepted" | "pending" = "accepted") =>
  db
    .insert(userFollows)
    .values({ followerId: a.id, followedId: b.id, status, acceptedAt: status === "accepted" ? new Date() : null });

/** Une publication insérée directement (sans passer par l'envoi de fichiers). */
async function dbPost(
  author: TestUser,
  over: Partial<typeof feedPosts.$inferInsert> & { photos?: { blurred?: boolean; noPlate?: boolean }[] } = {},
) {
  const { photos, ...rest } = over;
  const id = randomUUID();
  await db.insert(feedPosts).values({ id, authorId: author.id, department: "66", createdAt: hoursAgo(1), ...rest });
  for (const [position, p] of (photos ?? [{ noPlate: true }]).entries()) {
    await db.insert(feedPostPhotos).values({
      postId: id,
      storageKey: feedPhotoKey(id, randomBytes(16).toString("hex")),
      width: 1080,
      height: 1350,
      position,
      plateBlurred: p.blurred ?? false,
      noPlateConfirmed: p.noPlate ?? false,
    });
  }
  return id;
}

async function fil(u: TestUser | null, query = "") {
  const res = await call(u, "GET", `/fil${query}`);
  return {
    ...res,
    items: (res.json?.items ?? []) as FeedCard[],
    next: (res.json?.nextCursor ?? null) as string | null,
  };
}
const ids = (items: FeedCard[]) => items.map((c) => c.id);
const kinds = (items: FeedCard[]) => new Set(items.map((c) => c.kind));
const postIdsOf = (items: FeedCard[]) =>
  items.flatMap((c) => (c.kind === "feed_post" ? [(c.payload as { post: { id: string } }).post.id] : []));

async function jpeg(width: number, height: number) {
  // Rayures contrastées : un flou les change.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${Array.from({ length: 40 }, (_, i) => `<rect x="${(i * width) / 40}" y="0" width="${width / 80}" height="${height}" fill="${i % 2 ? "#fff" : "#000"}"/>`).join("")}</svg>`;
  return sharp(Buffer.from(svg)).jpeg().toBuffer();
}

async function upload(u: TestUser, data: Buffer, purpose = "feed_post") {
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

/** Clé de stockage (privée) d'une photo, d'après son adresse protégée `/api/feed-posts/<id>/photos/<nom>`. */
const keyOfUrl = (url: string) => {
  const m = /^\/api\/feed-posts\/([0-9a-f-]{36})\/photos\/([0-9a-f]{32}\.webp)$/.exec(url);
  if (!m) throw new Error(`Adresse de photo inattendue : ${url}`);
  return `private/feed/${m[1]}/${m[2]}`;
};

/** Lecture brute d'une photo (route protégée), avec la session de `u` (ou sans). */
async function getPhoto(u: TestUser | null, url: string, headers: Record<string, string> = {}) {
  return app.request(url, { headers: { origin: ORIGIN, ...(u ? { cookie: u.cookie } : {}), ...headers } });
}

async function publish(u: TestUser, body: Record<string, unknown>) {
  return call(u, "POST", "/me/feed-posts", body);
}

describe("sources du Fil", () => {
  it("chaque source est présente, sans doublon, et aucune carte n'expose d'identifiant de compte ni de plaque", async () => {
    const viewer = await person("Viewer_Sources");
    const kenji = await person("Kenji_Sources");
    const orga = await person("Orga_Sources");
    const structure = await createStructure(orga.id);
    await db.insert(structureFollows).values({ structureId: structure.id, userId: viewer.id, source: "manual" });
    // événement à venir
    const upcoming = await createEvent(structure.id, { department: "66", title: "Rassemblement à venir" });
    // voiture publique (photo floutée)
    const car = await createVehicle(kenji.id, ref);
    await blurPlatesOf(kenji.id);
    // plateau du jour : événement en cours avec une voiture retenue
    const running = await createEvent(structure.id, {
      department: "66",
      title: "Plateau du jour",
      startsAt: hoursAgo(1),
      endsAt: new Date(clock.now.getTime() + 3 * HOUR),
    });
    const exhibitor = await person("Expo_Sources");
    const exCar = await createVehicle(exhibitor.id, ref);
    await db.update(vehiclePhotos).set({ plateBlurred: true }).where(eq(vehiclePhotos.vehicleId, exCar.id));
    await db.insert(applications).values({
      eventId: running.id,
      userId: exhibitor.id,
      vehicleId: exCar.id,
      status: "accepted",
      rulesAcceptedAt: new Date(),
      followStructure: false,
      decidedAt: hoursAgo(5),
    });
    // résultat de vote : événement terminé avec un gagnant
    const past = await createEvent(structure.id, {
      department: "66",
      title: "Soirée passée",
      startsAt: hoursAgo(30),
      endsAt: hoursAgo(26),
    });
    const [winApp] = await db
      .insert(applications)
      .values({
        eventId: past.id,
        userId: exhibitor.id,
        vehicleId: exCar.id,
        status: "accepted",
        rulesAcceptedAt: new Date(),
        followStructure: false,
        decidedAt: hoursAgo(40),
      })
      .returning();
    await db.insert(audiencePrizeResults).values({
      eventId: past.id,
      voteId: await allCategoriesId(past.id),
      applicationId: winApp!.id,
      rank: 1,
      votes: 7,
      winner: true,
      createdAt: hoursAgo(24),
    });
    // annonce publique d'une structure suivie
    await db.insert(eventAnnouncements).values({
      eventId: upcoming.id,
      kind: "announcement",
      audience: "public",
      body: "Ouverture des portes à 18 h",
      publishedAt: hoursAgo(2),
    });
    await db.insert(eventAnnouncements).values({
      eventId: upcoming.id,
      kind: "announcement",
      audience: "participants",
      body: "Réservée aux participants",
      publishedAt: hoursAgo(2),
    });
    // pro du département
    await createPro(orga.id, { name: "Garage du Fil", publishedAt: hoursAgo(3) });
    // publication
    const postId = await dbPost(kenji, { caption: "Sortie du matin" });

    const res = await fil(viewer);
    expect(res.status).toBe(200);
    expect(kinds(res.items)).toEqual(
      new Set<FeedCardKind>([
        "event_recommended",
        "vehicle_public",
        "lineup",
        "vote_result",
        "announcement",
        "pro",
        "feed_post",
      ]),
    );
    expect(new Set(ids(res.items)).size).toBe(res.items.length);
    expect(postIdsOf(res.items)).toContain(postId);
    const text = JSON.stringify(res.json);
    // Ni la plaque, ni un identifiant de compte, ni l'annonce réservée aux participants.
    expect(text).not.toContain(car.plate as string);
    expect(text).not.toContain(kenji.id);
    expect(text).not.toContain(viewer.id);
    expect(text).not.toContain("Réservée aux participants");
    expect(text).toContain("Ouverture des portes à 18 h");
    // chaque carte a une raison lisible
    for (const c of res.items) {
      expect(c.reason.label.length).toBeGreaterThan(0);
      expect(typeof c.at).toBe("string");
    }
  });

  it("l'annonce d'une structure non suivie n'entre pas dans le Fil", async () => {
    const viewer = await person("Viewer_Annonce");
    const orga = await person("Orga_Annonce");
    const structure = await createStructure(orga.id);
    const e = await createEvent(structure.id, { department: "66" });
    await db.insert(eventAnnouncements).values({
      eventId: e.id,
      kind: "announcement",
      audience: "public",
      body: "Pas suivie",
      publishedAt: hoursAgo(1),
    });
    expect(kinds((await fil(viewer)).items).has("announcement")).toBe(false);
  });

  it("jamais un contenu de crew : ni la publication, ni sa photo, même pour un équipier du crew", async () => {
    const kenji = await person("Kenji_Crew");
    const nina = await person("Nina_Crew");
    const created = await call(kenji, "POST", "/crews", { name: "Crew secret", department: "66" });
    expect(created.status).toBe(201);
    expect((await call(nina, "POST", `/crews/${created.json.id}/requests`, { message: null })).status).toBe(201);
    expect((await call(kenji, "POST", `/crews/${created.json.id}/requests/${nina.id}/accept`)).status).toBe(204);
    expect(
      (await call(kenji, "POST", `/crews/${created.json.id}/posts`, { kind: "text", text: "Réunion secrète du crew" }))
        .status,
    ).toBe(201);
    for (const u of [nina, kenji]) {
      const res = await fil(u);
      expect(JSON.stringify(res.json)).not.toContain("Réunion secrète");
      expect(JSON.stringify(res.json)).not.toContain("crew-posts");
      expect([...kinds(res.items)].every((k) => feedCardKinds.includes(k))).toBe(true);
    }
  });
});

describe("vie privée : comptes privés, suspendus, photos", () => {
  it("compte privé non suivi absent ; demande en attente absente ; abonné accepté présent", async () => {
    const viewer = await person("Viewer_Prive");
    const priv = await person("Prive_Auteur", { visibility: "private" });
    const postId = await dbPost(priv);
    await createVehicle(priv.id, ref);
    await blurPlatesOf(priv.id);
    expect(postIdsOf((await fil(viewer)).items)).not.toContain(postId);
    expect(kinds((await fil(viewer)).items).has("vehicle_public")).toBe(false);
    await follow(viewer, priv, "pending");
    expect(postIdsOf((await fil(viewer)).items)).not.toContain(postId);
    expect((await call(viewer, "GET", `/feed-posts/${postId}`)).status).toBe(404);
    await db.update(userFollows).set({ status: "accepted", acceptedAt: new Date() });
    const after = await fil(viewer);
    expect(postIdsOf(after.items)).toContain(postId);
    expect(kinds(after.items).has("vehicle_public")).toBe(true);
    expect((await call(viewer, "GET", `/feed-posts/${postId}`)).status).toBe(200);
    // l'auteur voit les siennes
    expect(postIdsOf((await fil(priv)).items)).toContain(postId);
  });

  it("compte suspendu, banni ou supprimé : ses publications et ses voitures sortent du Fil", async () => {
    const viewer = await person("Viewer_Susp");
    const a = await person("Suspendu_A");
    const b = await person("Banni_B");
    const c = await person("Supprime_C");
    const okAuthor = await person("Ok_Auteur");
    const posts = {
      a: await dbPost(a),
      b: await dbPost(b),
      c: await dbPost(c),
      ok: await dbPost(okAuthor),
    };
    for (const u of [a, b, c]) {
      await createVehicle(u.id, ref);
      await blurPlatesOf(u.id);
    }
    await db
      .update(profiles)
      .set({ suspendedUntil: new Date(clock.now.getTime() + 24 * HOUR) })
      .where(eq(profiles.userId, a.id));
    await db.update(profiles).set({ bannedAt: new Date() }).where(eq(profiles.userId, b.id));
    await db.update(profiles).set({ deletedAt: new Date() }).where(eq(profiles.userId, c.id));
    const res = await fil(viewer);
    expect(postIdsOf(res.items)).toEqual([posts.ok]);
    expect(JSON.stringify(res.json)).not.toContain("Suspendu_A");
    for (const id of [posts.a, posts.b, posts.c]) {
      expect((await call(viewer, "GET", `/feed-posts/${id}`)).status).toBe(404);
    }
  });

  it("une photo dont la plaque n'est pas traitée ne sort pas ; floutée, confirmée ou véhicule non immatriculé : oui", async () => {
    const viewer = await person("Viewer_Photo");
    const raw = await person("Photo_Brute");
    const blurred = await person("Photo_Floutee");
    const confirmed = await person("Photo_Confirmee");
    const unreg = await person("Photo_NonImmat");
    await createVehicle(raw.id, ref);
    await createVehicle(blurred.id, ref);
    await blurPlatesOf(blurred.id);
    const vc = await createVehicle(confirmed.id, ref);
    await db.update(vehiclePhotos).set({ noPlateConfirmed: true }).where(eq(vehiclePhotos.vehicleId, vc.id));
    const vu = await createVehicle(unreg.id, ref, { unregistered: true, plate: null, plateNormalized: null });
    void vu;
    const res = await fil(viewer);
    const owners = res.items
      .filter((c) => c.kind === "vehicle_public")
      .map((c) => (c.payload as { owner: { pseudo: string } }).owner.pseudo);
    expect(owners).not.toContain("Photo_Brute");
    expect(owners.sort()).toEqual(["Photo_Confirmee", "Photo_Floutee", "Photo_NonImmat"]);
    for (const c of res.items) {
      if (c.kind === "vehicle_public")
        expect((c.payload as { vehicle: { photoUrl: string } }).vehicle.photoUrl).toBeTruthy();
    }
  });

  it("jamais sans session", async () => {
    const author = await person("Auteur_Visiteur");
    const id = await dbPost(author);
    expect((await fil(null)).status).toBe(401);
    expect((await call(null, "GET", `/feed-posts/${id}`)).status).toBe(401);
    expect((await call(null, "PUT", `/feed-posts/${id}/reaction`)).status).toBe(401);
    expect((await call(null, "POST", "/me/feed-posts", {})).status).toBe(401);
    expect((await call(null, "GET", "/me/fil/less")).status).toBe(401);
  });

  it("un compte suspendu lit le Fil mais ne publie pas (lecture seule)", async () => {
    const u = await person("Suspendu_Lecteur");
    const other = await person("Autre_Lecteur");
    const id = await dbPost(other);
    await db
      .update(profiles)
      .set({ suspendedUntil: new Date(clock.now.getTime() + 24 * HOUR) })
      .where(eq(profiles.userId, u.id));
    expect(postIdsOf((await fil(u)).items)).toContain(id);
    const sent = await upload(
      u,
      await sharp({ create: { width: 8, height: 8, channels: 3, background: "#888" } })
        .png()
        .toBuffer(),
    );
    expect(sent.status).toBe(403);
    expect(
      (await publish(u, { photos: [{ uploadKey: `private/feed-posts/${randomUUID()}.webp`, noPlateConfirmed: true }] }))
        .status,
    ).toBe(403);
  });
});

describe("filtres, diversité, « moins de ce genre »", () => {
  it("« Mes abonnements » : seulement ce que la personne suit, jamais ses propres publications", async () => {
    const viewer = await person("Viewer_Suivis");
    const followed = await person("Suivi_A");
    const stranger = await person("Etranger_B");
    const orga = await person("Orga_Suivis");
    const structure = await createStructure(orga.id);
    await follow(viewer, followed);
    const mine = await dbPost(viewer);
    const a = await dbPost(followed);
    const b = await dbPost(stranger);
    await createEvent(structure.id, { department: "66" });
    const res = await fil(viewer, "?filter=following");
    expect(postIdsOf(res.items)).toEqual([a]);
    expect(postIdsOf(res.items)).not.toContain(b);
    expect(postIdsOf(res.items)).not.toContain(mine);
    // l'événement d'une structure non suivie n'y est pas
    expect(kinds(res.items).has("event_recommended")).toBe(false);
    await db.insert(structureFollows).values({ structureId: structure.id, userId: viewer.id, source: "manual" });
    expect(kinds((await fil(viewer, "?filter=following")).items).has("event_recommended")).toBe(true);
    // « Pour toi » garde les siennes
    expect(postIdsOf((await fil(viewer)).items)).toContain(mine);
  });

  it("« Autour de moi » : le département et ses voisins, pas Paris ; sans département, rien", async () => {
    const viewer = await person("Viewer_Pres", { departments: ["66"] });
    const near = await person("Pres_66");
    const neighbour = await person("Pres_11");
    const paris = await person("Loin_75");
    const p66 = await dbPost(near, { department: "66" });
    const p11 = await dbPost(neighbour, { department: "11" });
    const p75 = await dbPost(paris, { department: "75" });
    const res = await fil(viewer, "?filter=nearby");
    expect(postIdsOf(res.items).sort()).toEqual([p66, p11].sort());
    expect(postIdsOf(res.items)).not.toContain(p75);
    // « Pour toi » les montre tous (le 75 est seulement moins bien classé)
    expect(postIdsOf((await fil(viewer)).items).sort()).toEqual([p66, p11, p75].sort());
    const nowhere = await person("Viewer_SansCoin", { departments: [] });
    expect((await fil(nowhere, "?filter=nearby")).items).toEqual([]);
  });

  it("proximité et affinité classent : un auteur suivi du coin passe avant un inconnu lointain de même âge", async () => {
    const viewer = await person("Viewer_Rang");
    const followed = await person("Rang_Suivi");
    const far = await person("Rang_Loin");
    await follow(viewer, followed);
    const first = await dbPost(far, { department: "75", createdAt: hoursAgo(1) });
    const second = await dbPost(followed, { department: "66", createdAt: hoursAgo(1) });
    const order = postIdsOf((await fil(viewer)).items);
    expect(order.indexOf(second)).toBeLessThan(order.indexOf(first));
  });

  it("jamais trois cartes de suite du même genre tant qu'il reste autre chose", async () => {
    const viewer = await person("Viewer_Diversite");
    const author = await person("Diversite_Auteur");
    const orga = await person("Orga_Diversite");
    const structure = await createStructure(orga.id);
    for (let i = 0; i < 10; i++) await dbPost(author, { createdAt: hoursAgo(1 + i / 10) });
    for (let i = 0; i < 4; i++) await createEvent(structure.id, { department: "66", title: `Événement ${i}` });
    const res = await fil(viewer);
    const k = res.items.map((c) => c.kind);
    expect(k.length).toBeGreaterThanOrEqual(14);
    for (let i = 2; i < k.length; i++) {
      if (k[i] === k[i - 1] && k[i] === k[i - 2]) expect(k.slice(i + 1).every((x) => x === k[i])).toBe(true);
    }
    expect(k.slice(0, 3)).not.toEqual(["feed_post", "feed_post", "feed_post"]);
  });

  it("« Moins de ce genre » : enregistré, idempotent, retirable, et le genre descend dans le Fil", async () => {
    const viewer = await person("Viewer_Moins");
    const author = await person("Moins_Auteur");
    const pro = await person("Moins_Pro");
    await createPro(pro.id, { publishedAt: hoursAgo(3) });
    await dbPost(author, { createdAt: hoursAgo(0.5) });
    const before = (await fil(viewer)).items.map((c) => c.kind);
    expect(before.indexOf("feed_post")).toBeLessThan(before.indexOf("pro"));
    expect((await call(viewer, "POST", "/me/feed/less", { kind: "feed_post" })).json.kinds).toEqual(["feed_post"]);
    expect((await call(viewer, "POST", "/me/feed/less", { kind: "feed_post" })).json.kinds).toEqual(["feed_post"]);
    expect((await call(viewer, "GET", "/me/fil/less")).json.kinds).toEqual(["feed_post"]);
    const after = (await fil(viewer)).items.map((c) => c.kind);
    expect(after.indexOf("pro")).toBeLessThan(after.indexOf("feed_post"));
    expect((await call(viewer, "POST", "/me/feed/less", { kind: "inconnu" })).status).toBe(400);
    expect((await call(viewer, "DELETE", "/me/feed/less/inconnu")).status).toBe(400);
    expect((await call(viewer, "DELETE", "/me/feed/less/feed_post")).json.kinds).toEqual([]);
    expect((await call(viewer, "DELETE", "/me/feed/less/feed_post")).json.kinds).toEqual([]);
  });

  it("le compte officiel Orasso : raison « Proposé par Orasso » ; un abonné voit « Tu suis … »", async () => {
    const viewer = await person("Viewer_Raison");
    // Le compte officiel se reconnaît à `profiles.official` (posé par le seed), jamais à son pseudo.
    const official = await person("Compte_Officiel");
    await db.update(profiles).set({ pseudo: "Orasso", official: true }).where(eq(profiles.userId, official.id));
    const kenji = await person("Kenji_Raison");
    await follow(viewer, kenji);
    const o = await dbPost(official);
    const k = await dbPost(kenji);
    const res = await fil(viewer);
    const reasonOf = (id: string) =>
      res.items.find((c) => c.kind === "feed_post" && (c.payload as { post: { id: string } }).post.id === id)?.reason;
    expect(reasonOf(o)).toEqual({ code: "from_orasso", label: "Proposé par Orasso" });
    expect(reasonOf(k)).toEqual({ code: "following_author", label: "Tu suis Kenji_Raison" });
  });
});

describe("curseur", () => {
  it("parcourt 55 publications étalées sur 9 jours : aucun doublon, aucun trou, dans l'ordre sans retour en arrière", async () => {
    const viewer = await person("Viewer_Curseur");
    const author = await person("Curseur_Auteur");
    const expected: string[] = [];
    for (let i = 0; i < 55; i++) expected.push(await dbPost(author, { createdAt: hoursAgo(1 + i * 4) }));
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const res = await fil(viewer, cursor ? `?cursor=${encodeURIComponent(cursor)}` : "");
      expect(res.status).toBe(200);
      expect(res.items.length).toBeLessThanOrEqual(20);
      seen.push(...postIdsOf(res.items));
      cursor = res.next;
      pages += 1;
    } while (cursor && pages < 10);
    expect(cursor).toBeNull();
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.sort()).toEqual([...expected].sort());
    expect(pages).toBe(3);
  });

  it("des publications arrivées pendant le parcours n'entrent pas dans les pages suivantes", async () => {
    const viewer = await person("Viewer_Stable");
    const author = await person("Stable_Auteur");
    for (let i = 0; i < 30; i++) await dbPost(author, { createdAt: hoursAgo(1 + i) });
    const first = await fil(viewer);
    expect(first.next).not.toBeNull();
    // une publication toute neuve, datée après le début du parcours
    const late = await dbPost(author, { createdAt: new Date(clock.now.getTime() - 1000) });
    clock.advance(60_000);
    const second = await fil(viewer, `?cursor=${encodeURIComponent(first.next as string)}`);
    expect(postIdsOf(second.items)).not.toContain(late);
    expect(postIdsOf(first.items).filter((id) => postIdsOf(second.items).includes(id))).toEqual([]);
  });

  it("curseur mal formé : 400, et un filtre inconnu : 400", async () => {
    const viewer = await person("Viewer_Mauvais");
    expect((await call(viewer, "GET", "/fil?cursor=pas-un-curseur")).status).toBe(400);
    expect((await call(viewer, "GET", "/fil?filter=amis")).status).toBe(400);
  });
});

describe("publier", () => {
  it("sans décision de plaque : 400 plate_decision_required (rien n'est rattaché ni publié)", async () => {
    const u = await person("Pub_SansPlaque");
    const sent = await upload(u, await jpeg(1080, 1350));
    expect(sent.status).toBe(201);
    const res = await publish(u, { photos: [{ uploadKey: sent.json.key }] });
    expect(res.status).toBe(400);
    expect(res.json.error.code).toBe("plate_decision_required");
    expect(res.json.error.details.photoIndex).toBe(0);
    expect(await db.select().from(feedPosts)).toHaveLength(0);
    // la photo reste utilisable une fois la décision prise
    const ok = await publish(u, { photos: [{ uploadKey: sent.json.key, noPlateConfirmed: true }] });
    expect(ok.status).toBe(201);
  });

  it("une seule photo sans décision parmi plusieurs suffit à refuser, et dit laquelle", async () => {
    const u = await person("Pub_Une");
    const a = await upload(u, await jpeg(1080, 1350));
    const b = await upload(u, await jpeg(1080, 1350));
    const res = await publish(u, {
      photos: [{ uploadKey: a.json.key, noPlateConfirmed: true }, { uploadKey: b.json.key }],
    });
    expect(res.status).toBe(400);
    expect(res.json.error.code).toBe("plate_decision_required");
    expect(res.json.error.details.photoIndex).toBe(1);
  });

  it("4:5 : publication créée, photo sous private/feed/<id>/, envoi privé effacé, réponse en liste blanche", async () => {
    const u = await person("Pub_Ok");
    const v = await createVehicle(u.id, ref);
    const sent = await upload(u, await jpeg(1080, 1350));
    expect(sent.json.key).toMatch(/^private\/feed-posts\/[0-9a-f-]{36}\.webp$/);
    const res = await publish(u, {
      caption: "  Ma E36 au lever du soleil  ",
      vehicleId: v.id,
      photos: [{ uploadKey: sent.json.key, noPlateConfirmed: true }],
    });
    expect(res.status).toBe(201);
    const post = res.json;
    expect(Object.keys(post).sort()).toEqual(
      [
        "aspect",
        "author",
        "caption",
        "createdAt",
        "event",
        "id",
        "mine",
        "photos",
        "reactedByMe",
        "reactionsCount",
        "vehicle",
      ].sort(),
    );
    expect(Object.keys(post.author).sort()).toEqual(["avatarUrl", "grade", "official", "pseudo"]);
    expect(post.caption).toBe("Ma E36 au lever du soleil");
    expect(post.aspect).toBe("portrait_4_5");
    expect(post.mine).toBe(true);
    expect(post.vehicle.id).toBe(v.id);
    expect(JSON.stringify(post)).not.toContain(v.plate as string);
    expect(post.photos).toHaveLength(1);
    expect(post.photos[0].url).toMatch(new RegExp(`^/api/feed-posts/${post.id}/photos/[0-9a-f]{32}.webp$`));
    // la photo est privée (route protégée), l'envoi privé a été effacé
    expect(keyOfUrl(post.photos[0].url)).toMatch(/^private\/feed\//);
    expect(await storage.get(keyOfUrl(post.photos[0].url))).not.toBeNull();
    expect(await storage.get(sent.json.key)).toBeNull();
    const [row] = await db.select().from(feedPostPhotos);
    expect(row).toMatchObject({ plateBlurred: false, noPlateConfirmed: true, position: 0 });
    expect((await getPhoto(u, post.photos[0].url)).status).toBe(200);
    // jamais par l'adresse publique des fichiers
    expect((await app.request(`/api/files/${keyOfUrl(post.photos[0].url)}`)).status).toBe(404);
    // servie dans le Fil de la personne
    expect(postIdsOf((await fil(u)).items)).toContain(post.id);
    // la clé d'envoi ne se réutilise pas
    const again = await publish(u, { photos: [{ uploadKey: sent.json.key, noPlateConfirmed: true }] });
    expect(again.status).toBe(400);
  });

  it("cadres de plaque : floutés par le serveur, photo marquée floutée, aucun original gardé", async () => {
    const u = await person("Pub_Flou");
    const raw = await jpeg(1080, 1350);
    const sent = await upload(u, raw);
    const original = (await storage.get(sent.json.key)) as Buffer;
    const res = await publish(u, {
      photos: [{ uploadKey: sent.json.key, plateRects: [{ x: 0.2, y: 0.4, w: 0.5, h: 0.2 }] }],
    });
    expect(res.status).toBe(201);
    const [row] = await db.select().from(feedPostPhotos);
    expect(row).toMatchObject({ plateBlurred: true, noPlateConfirmed: false });
    const stored = (await storage.get(row!.storageKey)) as Buffer;
    const a = await sharp(original).raw().toBuffer({ resolveWithObject: true });
    const b = await sharp(stored).raw().toBuffer({ resolveWithObject: true });
    expect(b.info.width).toBe(a.info.width);
    const at = (img: typeof a, x: number, y: number) => img.data[(y * img.info.width + x) * img.info.channels];
    // hors cadre : inchangé (à la compression près) ; dans le cadre : rayures lissées
    const spread = (img: typeof a) => {
      const vals = Array.from({ length: 200 }, (_, i) => at(img, 220 + i, 600) ?? 0);
      return Math.max(...vals) - Math.min(...vals);
    };
    expect(spread(a)).toBeGreaterThan(150);
    expect(spread(b)).toBeLessThan(60);
    expect(await storage.get(sent.json.key)).toBeNull();
  });

  it("ratio hors tolérance refusé ; 1:1 et paysage acceptés ; format annoncé et photo doivent s'accorder", async () => {
    const u = await person("Pub_Ratio");
    const square = await upload(u, await jpeg(1080, 1080));
    const wide = await upload(u, await jpeg(1350, 1080));
    const portrait = await upload(u, await jpeg(1080, 1350));
    const slightly = await upload(u, await jpeg(1100, 1350)); // 0,815 : +1,9 %, dans la tolérance
    const off = await upload(u, await jpeg(1150, 1350)); // 0,852 : +6,5 %
    const bad = await publish(u, { photos: [{ uploadKey: square.json.key, noPlateConfirmed: true }] });
    expect(bad.status).toBe(400); // carré annoncé en 4:5 par défaut
    const bad2 = await publish(u, {
      aspect: "square",
      photos: [{ uploadKey: portrait.json.key, noPlateConfirmed: true }],
    });
    expect(bad2.status).toBe(400);
    expect((await publish(u, { photos: [{ uploadKey: off.json.key, noPlateConfirmed: true }] })).status).toBe(400);
    expect(
      (await publish(u, { aspect: "square", photos: [{ uploadKey: square.json.key, noPlateConfirmed: true }] })).status,
    ).toBe(201);
    expect(
      (await publish(u, { aspect: "landscape", photos: [{ uploadKey: wide.json.key, noPlateConfirmed: true }] }))
        .status,
    ).toBe(201);
    expect((await publish(u, { photos: [{ uploadKey: slightly.json.key, noPlateConfirmed: true }] })).status).toBe(201);
  });

  it("jusqu'à 6 photos ; 7 refusées ; légende de 500 caractères au plus", async () => {
    const u = await person("Pub_Six");
    const keys: string[] = [];
    for (let i = 0; i < 7; i++) keys.push((await upload(u, await jpeg(1080, 1350))).json.key);
    const photos = (n: number) => keys.slice(0, n).map((uploadKey) => ({ uploadKey, noPlateConfirmed: true }));
    expect((await publish(u, { photos: photos(7) })).status).toBe(400);
    expect((await publish(u, { caption: "x".repeat(501), photos: photos(1) })).status).toBe(400);
    const ok = await publish(u, { caption: "x".repeat(500), photos: photos(6) });
    expect(ok.status).toBe(201);
    expect(ok.json.photos).toHaveLength(6);
  });

  it("la photo d'un autre, un autre usage ou une clé inventée : refusés", async () => {
    const u = await person("Pub_Vol");
    const other = await person("Pub_Autre");
    const theirs = await upload(other, await jpeg(1080, 1350));
    expect((await publish(u, { photos: [{ uploadKey: theirs.json.key, noPlateConfirmed: true }] })).status).toBe(400);
    const crew = await upload(u, await jpeg(1080, 1350), "crew_post");
    expect((await publish(u, { photos: [{ uploadKey: crew.json.key, noPlateConfirmed: true }] })).status).toBe(400);
    expect(
      (await publish(u, { photos: [{ uploadKey: `private/feed-posts/${randomUUID()}.webp`, noPlateConfirmed: true }] }))
        .status,
    ).toBe(400);
    const [leftover] = await db.select().from(uploads).where(eq(uploads.userId, other.id));
    expect(leftover?.consumedAt).toBeNull();
  });

  it("véhicule d'un autre ou événement privé : refusés", async () => {
    const u = await person("Pub_Lien");
    const other = await person("Pub_Lien2");
    const theirs = await createVehicle(other.id, ref);
    const orga = await person("Orga_Lien");
    const structure = await createStructure(orga.id);
    const hidden = await createEvent(structure.id, { admission: "invite_only" });
    const visible = await createEvent(structure.id);
    const sent = async () => (await upload(u, await jpeg(1080, 1350))).json.key;
    const photo = async () => [{ uploadKey: await sent(), noPlateConfirmed: true }];
    expect((await publish(u, { vehicleId: theirs.id, photos: await photo() })).status).toBe(400);
    expect((await publish(u, { eventId: hidden.id, photos: await photo() })).status).toBe(400);
    const ok = await publish(u, { eventId: visible.id, photos: await photo() });
    expect(ok.status).toBe(201);
    expect(ok.json.event.slug).toBe(visible.slug);
  });

  it("rejouer le même envoi (clientId) rend la même publication, sans doublon", async () => {
    const u = await person("Pub_Rejeu");
    const clientId = randomUUID();
    const sent = await upload(u, await jpeg(1080, 1350));
    const body = { clientId, photos: [{ uploadKey: sent.json.key, noPlateConfirmed: true }] };
    const first = await publish(u, body);
    const second = await publish(u, body);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.json.id).toBe(first.json.id);
    expect(await db.select().from(feedPosts)).toHaveLength(1);
  });

  it("le département de l'auteur est celui de la publication ; sans département : chaîne vide, pas « autour de moi »", async () => {
    const u = await person("Pub_Dept", { departments: ["34", "66"] });
    const sent = await upload(u, await jpeg(1080, 1350));
    const res = await publish(u, { photos: [{ uploadKey: sent.json.key, noPlateConfirmed: true }] });
    const [row] = await db.select().from(feedPosts).where(eq(feedPosts.id, res.json.id));
    expect(row?.department).toBe("34");
  });
});

describe("lire, retirer, flamme", () => {
  it("GET /feed-posts/:id : mêmes champs pour moi, un abonné et un autre membre ; la flamme est la mienne", async () => {
    const author = await person("Lire_Auteur");
    const fan = await person("Lire_Fan");
    const stranger = await person("Lire_Autre");
    await follow(fan, author);
    const id = await dbPost(author);
    const mine = await call(author, "GET", `/feed-posts/${id}`);
    const theirs = await call(fan, "GET", `/feed-posts/${id}`);
    const other = await call(stranger, "GET", `/feed-posts/${id}`);
    for (const r of [mine, theirs, other]) expect(r.status).toBe(200);
    expect(Object.keys(mine.json).sort()).toEqual(Object.keys(other.json).sort());
    expect(mine.json.mine).toBe(true);
    expect(other.json.mine).toBe(false);
    expect(JSON.stringify(other.json)).not.toContain(author.id);
    expect((await call(fan, "GET", `/feed-posts/${randomUUID()}`)).status).toBe(404);
    expect((await call(fan, "GET", "/feed-posts/pas-un-uuid")).status).toBe(400);
  });

  it("la flamme est idempotente dans les deux sens et se compte une fois par personne", async () => {
    const author = await person("Flamme_Auteur");
    const a = await person("Flamme_A");
    const b = await person("Flamme_B");
    const id = await dbPost(author);
    expect((await call(a, "PUT", `/feed-posts/${id}/reaction`)).json).toEqual({ reactionsCount: 1, reactedByMe: true });
    expect((await call(a, "PUT", `/feed-posts/${id}/reaction`)).json).toEqual({ reactionsCount: 1, reactedByMe: true });
    expect((await call(b, "PUT", `/feed-posts/${id}/reaction`)).json.reactionsCount).toBe(2);
    expect((await call(a, "GET", `/feed-posts/${id}`)).json).toMatchObject({ reactionsCount: 2, reactedByMe: true });
    expect((await call(b, "DELETE", `/feed-posts/${id}/reaction`)).json).toEqual({
      reactionsCount: 1,
      reactedByMe: false,
    });
    expect((await call(b, "DELETE", `/feed-posts/${id}/reaction`)).json.reactionsCount).toBe(1);
    expect(await db.select().from(feedPostReactions)).toHaveLength(1);
  });

  it("une flamme sur une publication qu'on ne voit pas : 404, et rien n'est écrit", async () => {
    const priv = await person("Flamme_Prive", { visibility: "private" });
    const stranger = await person("Flamme_Etranger");
    const id = await dbPost(priv);
    expect((await call(stranger, "PUT", `/feed-posts/${id}/reaction`)).status).toBe(404);
    expect(await db.select().from(feedPostReactions)).toHaveLength(0);
  });

  it("l'auteur retire sa publication (404 pour un autre) : elle quitte le Fil et ses fichiers sont effacés", async () => {
    const u = await person("Retrait_Auteur");
    const other = await person("Retrait_Autre");
    const sent = await upload(u, await jpeg(1080, 1350));
    const res = await publish(u, { photos: [{ uploadKey: sent.json.key, noPlateConfirmed: true }] });
    const key = keyOfUrl(res.json.photos[0].url);
    expect(await storage.get(key)).not.toBeNull();
    expect((await call(other, "DELETE", `/me/feed-posts/${res.json.id}`)).status).toBe(404);
    expect((await call(u, "DELETE", `/me/feed-posts/${res.json.id}`)).status).toBe(204);
    expect((await call(u, "DELETE", `/me/feed-posts/${res.json.id}`)).status).toBe(404);
    expect(await storage.get(key)).toBeNull();
    expect(postIdsOf((await fil(other)).items)).toEqual([]);
    expect((await call(other, "GET", `/feed-posts/${res.json.id}`)).status).toBe(404);
    expect((await call(u, "GET", "/me/feed-posts")).json.items).toEqual([]);
  });

  it("GET /me/feed-posts : mes publications seulement, par pages de 20", async () => {
    const u = await person("Mes_Pubs");
    const other = await person("Mes_Pubs_Autre");
    await dbPost(other);
    for (let i = 0; i < 25; i++) await dbPost(u, { createdAt: hoursAgo(i + 1) });
    const first = await call(u, "GET", "/me/feed-posts");
    expect(first.json.items).toHaveLength(20);
    expect(first.json.nextCursor).not.toBeNull();
    const second = await call(u, "GET", `/me/feed-posts?cursor=${encodeURIComponent(first.json.nextCursor)}`);
    expect(second.json.items).toHaveLength(5);
    expect(second.json.nextCursor).toBeNull();
    const all = [...first.json.items, ...second.json.items] as { id: string; mine: boolean }[];
    expect(new Set(all.map((p) => p.id)).size).toBe(25);
    expect(all.every((p) => p.mine)).toBe(true);
  });
});

describe("signalement et modération", () => {
  async function reported() {
    const author = await person("Mod_Auteur");
    const reporter = await person("Mod_Signaleur");
    const sent = await upload(author, await jpeg(1080, 1350));
    const post = await publish(author, { photos: [{ uploadKey: sent.json.key, noPlateConfirmed: true }] });
    const report = await call(reporter, "POST", `/feed-posts/${post.json.id}/report`, { reason: "plate_or_face" });
    return { author, reporter, post: post.json, report };
  }

  it("signaler : 201 ; deux fois : 409 ; sa propre publication : 400 ; motif hors liste : 400 ; publication invisible : 404", async () => {
    const { author, reporter, post, report } = await reported();
    expect(report.status).toBe(201);
    expect((await call(reporter, "POST", `/feed-posts/${post.id}/report`, { reason: "spam" })).status).toBe(409);
    expect((await call(author, "POST", `/feed-posts/${post.id}/report`, { reason: "spam" })).status).toBe(400);
    expect(
      (await call(reporter, "POST", `/feed-posts/${post.id}/report`, { reason: "cancelled_unannounced" })).status,
    ).toBe(400);
    const priv = await person("Mod_Prive", { visibility: "private" });
    const hidden = await dbPost(priv);
    expect((await call(reporter, "POST", `/feed-posts/${hidden}/report`, { reason: "spam" })).status).toBe(404);
    expect((await call(null, "POST", `/feed-posts/${post.id}/report`, { reason: "spam" })).status).toBe(401);
  });

  it("la file de modération montre la photo (adresse de modération, jamais publique) ; seuls les modérateurs la lisent", async () => {
    const { reporter, post, report } = await reported();
    const mod = await person("Mod_Moderateur", { role: "moderator" });
    const detail = await call(mod, "GET", `/admin/reports/${report.json.id}`);
    expect(detail.status).toBe(200);
    expect(detail.json.targetType).toBe("feed_post");
    const url = detail.json.target.imageUrl as string;
    expect(url).toMatch(new RegExp(`^/api/admin/reports/${report.json.id}/media/[0-9a-f]{32}\\.webp$`));
    expect(detail.json.target.imageUrls).toEqual([url]);
    expect(detail.json.target.title).toContain("Mod_Auteur");
    const served = await app.request(url, { headers: { cookie: mod.cookie, origin: ORIGIN } });
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/webp");
    expect(served.headers.get("cache-control")).toBe("private, no-store");
    // un membre ordinaire, le signaleur lui-même et un visiteur : refusés
    for (const cookie of [reporter.cookie, ""]) {
      const denied = await app.request(url, { headers: { cookie, origin: ORIGIN } });
      expect([401, 403]).toContain(denied.status);
    }
    // un nom qui n'est pas une photo de la publication : introuvable
    const wrong = await app.request(`/api/admin/reports/${report.json.id}/media/${"a".repeat(32)}.webp`, {
      headers: { cookie: mod.cookie, origin: ORIGIN },
    });
    expect(wrong.status).toBe(404);
    const traversal = await app.request(`/api/admin/reports/${report.json.id}/media/..%2F..%2Fx.webp`, {
      headers: { cookie: mod.cookie, origin: ORIGIN },
    });
    expect(traversal.status).toBe(404);
    expect(post.photos).toHaveLength(1);
  });

  it("une story signalée n'existe pas encore : 404 (la cible est posée, R7f1 la branche)", async () => {
    const reporter = await person("Mod_Story");
    const res = await call(reporter, "POST", "/reports", {
      targetType: "story",
      targetId: randomUUID(),
      reason: "spam",
    });
    expect(res.status).toBe(404);
  });

  it("retrait par le super administrateur : publication retirée du Fil, photos effacées", async () => {
    const { reporter, post, report } = await reported();
    const admin = await person("Mod_Admin", { role: "super_admin" });
    const key = keyOfUrl(post.photos[0].url);
    const done = await call(admin, "POST", `/admin/reports/${report.json.id}/sanction`, { hideContent: true });
    expect(done.status).toBe(200);
    expect(await storage.get(key)).toBeNull();
    expect((await call(reporter, "GET", `/feed-posts/${post.id}`)).status).toBe(404);
    expect(postIdsOf((await fil(reporter)).items)).toEqual([]);
    const [row] = await db.select().from(feedPosts).where(eq(feedPosts.id, post.id));
    expect(row?.deletedBy).toBe(admin.id);
  });
});

describe("compte supprimé, forme des cartes", () => {
  it("la suppression d'un compte efface ses publications, ses photos et ses flammes (compteurs des autres corrigés)", async () => {
    const leaving = await person("Part_Compte");
    const stays = await person("Reste_Compte");
    const mine = await dbPost(leaving, { photos: [{ noPlate: true }, { noPlate: true }] });
    const theirs = await dbPost(stays);
    await call(leaving, "PUT", `/feed-posts/${theirs}/reaction`);
    await call(stays, "PUT", `/feed-posts/${mine}/reaction`);
    const photoKeys = (await db.select().from(feedPostPhotos))
      .filter((p) => p.postId === mine)
      .map((p) => p.storageKey);
    const keys = await withTx((tx) => anonymizeFeedForDeletedAccount(tx, leaving.id));
    expect(keys.sort()).toEqual(photoKeys.sort());
    expect(
      await db
        .select()
        .from(feedPosts)
        .where(inArray(feedPosts.id, [mine])),
    ).toHaveLength(0);
    expect(await db.select().from(feedPostReactions)).toHaveLength(0);
    const [still] = await db.select().from(feedPosts).where(eq(feedPosts.id, theirs));
    expect(still?.reactionsCount).toBe(0);
  });

  it("les cartes sont en liste blanche : événement, publication et voiture sans compte, sans plaque", async () => {
    const viewer = await person("Viewer_Forme");
    const kenji = await person("Kenji_Forme");
    const orga = await person("Orga_Forme");
    const structure = await createStructure(orga.id);
    await createEvent(structure.id, { department: "66" });
    await createVehicle(kenji.id, ref);
    await blurPlatesOf(kenji.id);
    await dbPost(kenji);
    const res = await fil(viewer);
    const payload = (kind: FeedCardKind) =>
      (res.items.find((c) => c.kind === kind)?.payload ?? {}) as Record<string, Record<string, unknown>>;
    expect(Object.keys(payload("event_recommended"))).toEqual(["event"]);
    expect(Object.keys(payload("event_recommended").event ?? {}).sort()).toEqual(
      [
        "city",
        "department",
        "endsAt",
        "format",
        "id",
        "photoUrl",
        "posterUrl",
        "slug",
        "startsAt",
        "structure",
        "title",
      ].sort(),
    );
    expect(Object.keys(payload("vehicle_public").vehicle ?? {}).sort()).toEqual(
      ["id", "label", "photoUrl", "vehicleType"].sort(),
    );
    expect(Object.keys(payload("vehicle_public").owner ?? {}).sort()).toEqual(
      ["avatarUrl", "grade", "official", "pseudo"].sort(),
    );
    for (const c of res.items) expect(Object.keys(c).sort()).toEqual(["at", "id", "kind", "payload", "reason"]);
  });
});

// --- Tour 2 (09/11) : corrections des relectures Opus et Codex ---------------------------------------------------------

/** Publications en nombre, insérées d'un coup (photos « aucune plaque » confirmées). */
async function bulkPosts(author: TestUser, dates: Date[]) {
  const rows = dates.map((createdAt) => ({ id: randomUUID(), authorId: author.id, department: "66", createdAt }));
  if (!rows.length) return [];
  await db.insert(feedPosts).values(rows);
  await db.insert(feedPostPhotos).values(
    rows.map((r) => ({
      postId: r.id,
      storageKey: feedPhotoKey(r.id, randomBytes(16).toString("hex")),
      width: 1080,
      height: 1350,
      position: 0,
      plateBlurred: false,
      noPlateConfirmed: true,
    })),
  );
  return rows.map((r) => r.id);
}

/** Parcourt tout le Fil (filtre donné) : les cartes de chaque page, dans l'ordre. */
async function walk(viewer: TestUser, filter = "", between?: (page: number, next: string) => Promise<void>) {
  const pages: FeedCard[][] = [];
  let cursor: string | null = null;
  do {
    const query: string = [filter && `filter=${filter}`, cursor && `cursor=${encodeURIComponent(cursor)}`]
      .filter(Boolean)
      .join("&");
    const res: Awaited<ReturnType<typeof fil>> = await fil(viewer, query ? `?${query}` : "");
    expect(res.status).toBe(200);
    expect(res.items.length).toBeLessThanOrEqual(20);
    // jamais de page vide avec une suite
    if (res.next) expect(res.items.length).toBeGreaterThan(0);
    pages.push(res.items);
    cursor = res.next;
    if (cursor && between) await between(pages.length, cursor);
    expect(pages.length).toBeLessThan(40);
  } while (cursor);
  return pages;
}

const allIds = (pages: FeedCard[][]) => pages.flat().map((c) => c.id);
const postCardId = (id: string) => `feed_post:${id}`;
const expectComplete = (pages: FeedCard[][], expected: string[]) => {
  const seen = allIds(pages);
  expect(new Set(seen).size).toBe(seen.length);
  expect([...seen].sort()).toEqual(expected.map(postCardId).sort());
};

async function freshWorld() {
  await resetDb();
  clock = useClock(new Date(Date.now() + 10 * 60_000));
  ref = await seedReference();
}

describe("curseur par clé (tour 2)", () => {
  it("une fenêtre de 48 h pleine à un multiple de 20 n'interdit pas les archives (20 et 40 cartes récentes)", async () => {
    for (const recent of [20, 40]) {
      await freshWorld();
      const viewer = await person(`Viewer_Mult${recent}`);
      const author = await person(`Auteur_Mult${recent}`);
      const fresh = await bulkPosts(
        author,
        Array.from({ length: recent }, (_, i) => hoursAgo(1 + i * 0.5)),
      );
      const archives = await bulkPosts(
        author,
        Array.from({ length: 7 }, (_, i) => hoursAgo(60 + i * 24)),
      );
      const pages = await walk(viewer);
      expectComplete(pages, [...fresh, ...archives]);
      // les archives viennent après toute la fenêtre
      const order = allIds(pages);
      expect(Math.min(...archives.map((id) => order.indexOf(postCardId(id))))).toBeGreaterThanOrEqual(recent);
    }
  });

  it("plus de 60 cartes d'une même source dans la fenêtre : toutes servies (61, puis plus que le plafond de 300)", async () => {
    const viewer = await person("Viewer_Beaucoup");
    const author = await person("Auteur_Beaucoup");
    const sixty1 = await bulkPosts(
      author,
      Array.from({ length: 61 }, (_, i) => hoursAgo(0.1 + i * 0.7)),
    );
    expectComplete(await walk(viewer), sixty1);
    // 305 cartes dans la fenêtre : 300 classées, les 5 plus anciennes passent en phase 2 sans être perdues
    const more = await bulkPosts(
      author,
      Array.from({ length: 244 }, (_, i) => hoursAgo(0.05 + i * 0.15)),
    );
    const total = [...sixty1, ...more];
    expect(total.length).toBe(305);
    const pages = await walk(viewer);
    expectComplete(pages, total);
    expect(pages.length).toBe(16);
  }, 120_000);

  it("22 cartes au même instant : aucune n'est cachée ni répétée, dans la fenêtre comme dans les archives", async () => {
    const viewer = await person("Viewer_Memes");
    const author = await person("Auteur_Memes");
    const recent = await bulkPosts(author, Array(22).fill(hoursAgo(5)));
    const old = await bulkPosts(author, Array(22).fill(hoursAgo(100)));
    expectComplete(await walk(viewer), [...recent, ...old]);
  });

  it("une carte retirée entre deux pages (la clé du curseur) ne fait sauter aucune autre carte", async () => {
    for (const [label, base] of [
      ["fenêtre", 1],
      ["archives", 60],
    ] as const) {
      await freshWorld();
      const viewer = await person(`Viewer_Retrait${label.length}`);
      const author = await person(`Auteur_Retrait${label.length}`);
      const posts = await bulkPosts(
        author,
        Array.from({ length: 50 }, (_, i) => hoursAgo(base + i * 0.5)),
      );
      const removed: string[] = [];
      const pages = await walk(viewer, "", async (page, next) => {
        if (page !== 1) return;
        // la clé du curseur est la dernière carte de la tranche (phase 1) ou de la page (phase 2) : on la retire
        const id = (cursorCardId(next) ?? "").replace("feed_post:", "");
        removed.push(id);
        await db.update(feedPosts).set({ deletedAt: new Date(), deletedBy: author.id }).where(eq(feedPosts.id, id));
      });
      expect(removed, label).toHaveLength(1);
      const seen = allIds(pages);
      expect(new Set(seen).size, label).toBe(seen.length);
      // seule la carte retirée peut manquer : aucune autre n'est sautée
      const missing = posts.filter((id) => !seen.includes(postCardId(id)));
      expect(
        missing.filter((id) => !removed.includes(id)),
        label,
      ).toEqual([]);
    }
  }, 120_000);

  it("deux sources mêlées (événements et publications) à cheval sur la fenêtre : parcours complet, sans doublon ni trou", async () => {
    const viewer = await person("Viewer_Mixte");
    const orga = await person("Orga_Mixte");
    const author = await person("Auteur_Mixte");
    const structure = await createStructure(orga.id);
    // événements publiés il y a longtemps, qui commencent dans 4 à 6 jours : datés 7 jours avant leur début
    const eventIds: string[] = [];
    for (let i = 0; i < 24; i++) {
      const e = await createEvent(structure.id, {
        department: "66",
        publishedAt: hoursAgo(500),
        startsAt: new Date(clock.now.getTime() + (4 + i * 0.09) * 24 * HOUR),
      });
      eventIds.push(e.id);
    }
    const posts = await bulkPosts(
      author,
      Array.from({ length: 30 }, (_, i) => hoursAgo(2 + i * 4.5)),
    );
    const pages = await walk(viewer);
    const seen = allIds(pages);
    expect(new Set(seen).size).toBe(seen.length);
    expect([...seen].sort()).toEqual(
      [...posts.map(postCardId), ...eventIds.map((id) => `event_recommended:${id}`)].sort(),
    );
  }, 120_000);

  it("un curseur trafiqué ou incomplet : 400", async () => {
    const viewer = await person("Viewer_Trafic");
    const encode = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    expect((await fil(viewer, `?cursor=${encode({ r: new Date().toISOString(), p: 1 })}`)).status).toBe(400);
    // un vrai curseur, tronqué ou rallongé d'un octet, ou d'une autre version
    const author = await person("Auteur_Trafic");
    await bulkPosts(
      author,
      Array.from({ length: 30 }, (_, i) => hoursAgo(1 + i)),
    );
    const good = (await fil(viewer)).next as string;
    expect(good).toBeTruthy();
    const raw = Buffer.from(good, "base64url");
    for (const bad of [
      raw.subarray(0, raw.length - 1),
      Buffer.concat([raw, Buffer.from([0])]),
      Buffer.concat([Buffer.from([1]), raw.subarray(1)]),
      Buffer.concat([raw.subarray(0, 1), Buffer.from([3]), raw.subarray(2)]),
    ]) {
      expect((await fil(viewer, `?cursor=${bad.toString("base64url")}`)).status).toBe(400);
    }
    expect((await fil(viewer, `?cursor=${good}`)).status).toBe(200);
  });
});

// --- Tour 3 (09/11) : un curseur stable du début à la fin ---------------------------------------------------------------

/** Événements en nombre, insérés d'un coup : la carte est datée de leur publication (`startsAt - 7 jours` est plus ancien). */
async function bulkEvents(structureId: string, publishedAt: Date[]) {
  const rows = publishedAt.map((at) => ({
    id: randomUUID(),
    plateSalt: randomBytes(16),
    structureId,
    slug: `evenement-${randomBytes(6).toString("hex")}`,
    title: "Rassemblement en nombre",
    addressLine: "1 quai du Port",
    city: "Canet-en-Roussillon",
    department: "66",
    format: "gathering" as const,
    startsAt: new Date(clock.now.getTime() + 6 * 24 * HOUR),
    endsAt: new Date(clock.now.getTime() + 6 * 24 * HOUR + 4 * HOUR),
    admittedVehicleTypes: ["car", "moto", "truck"] as ("car" | "moto" | "truck")[],
    admission: "filtered" as const,
    status: "published" as const,
    publishedAt: at,
    registrationsOpenAt: new Date(0),
  }));
  if (rows.length) await db.insert(events).values(rows);
  return rows.map((r) => r.id);
}
const eventCardId = (id: string) => `event_recommended:${id}`;

/** Tout ce qui est attendu a été vu une fois, sauf ce qui a été retiré (qui peut avoir été vu avant). */
function expectCompleteExcept(pages: FeedCard[][], expected: string[], removed: string[]) {
  const seen = allIds(pages);
  expect(new Set(seen).size).toBe(seen.length);
  expect(expected.filter((id) => !removed.includes(id) && !seen.includes(id))).toEqual([]);
  expect(seen.filter((id) => !expected.includes(id))).toEqual([]);
}

describe("curseur stable du début à la fin (tour 3)", () => {
  it("deux sources au-delà du plafond de 300 : parcours complet, sans doublon ni trou, curseurs courts", async () => {
    const viewer = await person("Viewer_DeuxSources");
    const author = await person("Auteur_DeuxSources");
    const orga = await person("Orga_DeuxSources");
    const structure = await createStructure(orga.id);
    const posts = await bulkPosts(
      author,
      Array.from({ length: 305 }, (_, i) => hoursAgo(0.05 + i * 0.15)),
    );
    const evts = await bulkEvents(
      structure.id,
      Array.from({ length: 302 }, (_, i) => hoursAgo(0.04 + i * 0.07)),
    );
    let longest = 0;
    const pages = await walk(viewer, "", async (_page, next) => {
      longest = Math.max(longest, next.length);
    });
    const seen = allIds(pages);
    expect(new Set(seen).size).toBe(seen.length);
    expect([...seen].sort()).toEqual([...posts.map(postCardId), ...evts.map(eventCardId)].sort());
    expect(longest).toBeGreaterThan(0);
    expect(longest).toBeLessThanOrEqual(FEED_CURSOR_MAX);
    console.info(
      `Tour 3 : plus long curseur d'un parcours à deux sources dépassant le plafond : ${longest} caractères`,
    );
  }, 300_000);

  it("un retrait en plein parcours ne fait pas entrer la 301e carte d'une source (elle reste en phase 2, servie une fois)", async () => {
    const viewer = await person("Viewer_301");
    const author = await person("Auteur_301");
    const posts = await bulkPosts(
      author,
      Array.from({ length: 305 }, (_, i) => hoursAgo(0.05 + i * 0.15)),
    );
    // la 250e carte (par date) n'est pas servie dans la première page : on la retire après
    const gone = posts[249] as string;
    const pages = await walk(viewer, "", async (page) => {
      if (page === 1)
        await db.update(feedPosts).set({ deletedAt: new Date(), deletedBy: author.id }).where(eq(feedPosts.id, gone));
    });
    expectCompleteExcept(pages, posts.map(postCardId), [postCardId(gone)]);
    expect(allIds(pages)).not.toContain(postCardId(gone));
    // et le même parcours sans retrait rend les 305
    await db.update(feedPosts).set({ deletedAt: null, deletedBy: null }).where(eq(feedPosts.id, gone));
    expectComplete(await walk(viewer), posts);
  }, 300_000);

  it("« Moins de ce genre » en plein parcours : ni doublon ni trou, et le même ordre que sans le geste (figé au curseur)", async () => {
    const viewer = await person("Viewer_MoinsMilieu");
    const author = await person("Auteur_MoinsMilieu");
    const orga = await person("Orga_MoinsMilieu");
    const structure = await createStructure(orga.id);
    const posts = await bulkPosts(
      author,
      Array.from({ length: 50 }, (_, i) => hoursAgo(1 + i * 0.5)),
    );
    const evts = await bulkEvents(
      structure.id,
      Array.from({ length: 30 }, (_, i) => hoursAgo(1 + i * 0.7)),
    );
    const plain = await walk(viewer);
    expect(allIds(plain)).toHaveLength(80);
    const during = await walk(viewer, "", async (page) => {
      if (page === 1) expect((await call(viewer, "POST", "/me/feed/less", { kind: "feed_post" })).status).toBe(200);
    });
    expect(allIds(during)).toEqual(allIds(plain));
    expect(allIds(during).sort()).toEqual([...posts.map(postCardId), ...evts.map(eventCardId)].sort());
    // un nouveau parcours, lui, tient compte du réglage
    const after = await walk(viewer);
    expect(allIds(after).sort()).toEqual(allIds(plain).sort());
    expect(allIds(after)).not.toEqual(allIds(plain));
  }, 300_000);

  it("un nouvel abonnement en plein parcours : `reset`, la liste repart de la première page, sans reset sinon", async () => {
    const viewer = await person("Viewer_Reset");
    const author = await person("Auteur_Reset");
    const other = await person("Autre_Reset");
    const old = await bulkPosts(
      author,
      Array.from({ length: 45 }, (_, i) => hoursAgo(1 + i * 0.5)),
    );
    await bulkPosts(
      other,
      Array.from({ length: 5 }, (_, i) => hoursAgo(30 + i)),
    );
    const first = await fil(viewer);
    expect(first.json.reset).toBeUndefined();
    const second = await fil(viewer, `?cursor=${encodeURIComponent(first.next as string)}`);
    expect(second.json.reset).toBeUndefined();
    // l'abonnement change le classement : le curseur n'est plus valable
    await follow(viewer, other);
    const third = await fil(viewer, `?cursor=${encodeURIComponent(second.next as string)}`);
    expect(third.status).toBe(200);
    expect(third.json.reset).toBe(true);
    const fresh = await fil(viewer);
    expect(ids(third.items)).toEqual(ids(fresh.items));
    // le parcours repris est complet et sans doublon
    const rest: FeedCard[][] = [third.items];
    let cursor = third.next;
    while (cursor) {
      const res = await fil(viewer, `?cursor=${encodeURIComponent(cursor)}`);
      expect(res.json.reset).toBeUndefined();
      rest.push(res.items);
      cursor = res.next;
    }
    const seen = allIds(rest);
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toHaveLength(50);
    expect(old.every((id) => seen.includes(postCardId(id)))).toBe(true);
  }, 120_000);

  it("21 publications mieux classées qu'une voiture : la voiture est dans la première page (diversité pendant la sélection)", async () => {
    const viewer = await person("Viewer_Voiture");
    const author = await person("Auteur_Voiture");
    const owner = await person("Proprio_Voiture");
    await bulkPosts(
      author,
      Array.from({ length: 21 }, (_, i) => hoursAgo(1 + i * 0.01)),
    );
    const car = await createVehicle(owner.id, ref);
    await blurPlatesOf(owner.id);
    await db
      .update(vehicles)
      .set({ createdAt: hoursAgo(20) })
      .where(eq(vehicles.id, car.id));
    const res = await fil(viewer);
    expect(res.items).toHaveLength(20);
    const k = res.items.map((c) => c.kind);
    expect(k).toContain("vehicle_public");
    // jamais trois publications de suite tant qu'il reste autre chose
    expect(k.slice(0, 3)).toContain("vehicle_public");
    const car2 = k.indexOf("vehicle_public");
    for (let i = 2; i < k.length; i++) {
      if (k[i] === "feed_post" && k[i - 1] === "feed_post" && k[i - 2] === "feed_post") expect(car2).toBeLessThan(i);
    }
  });

  it("un genre qui domine ne fait pas perdre la diversité d'une page à l'autre : parcours complet, jamais trois de suite", async () => {
    const viewer = await person("Viewer_Domine");
    const author = await person("Auteur_Domine");
    const orga = await person("Orga_Domine");
    const structure = await createStructure(orga.id);
    const posts = await bulkPosts(
      author,
      Array.from({ length: 70 }, (_, i) => hoursAgo(1 + i * 0.1)),
    );
    // 12 événements classés parmi les 40 premières cartes (un peu plus bas que les publications du même âge)
    const evts = await bulkEvents(
      structure.id,
      Array.from({ length: 12 }, (_, i) => hoursAgo(1.5 + i * 0.3)),
    );
    const pages = await walk(viewer);
    const seen = allIds(pages);
    expect(new Set(seen).size).toBe(seen.length);
    expect([...seen].sort()).toEqual([...posts.map(postCardId), ...evts.map(eventCardId)].sort());
    // jamais trois publications de suite tant qu'il reste un événement à placer, y compris d'une page à l'autre
    const k = pages.flat().map((c) => c.kind);
    expect(k.slice(0, 20).filter((x) => x === "event_recommended").length).toBeGreaterThanOrEqual(7);
    for (let i = 2; i < k.length; i++) {
      if (k[i] === "feed_post" && k[i - 1] === "feed_post" && k[i - 2] === "feed_post") {
        expect(k.slice(i + 1).every((x) => x === "feed_post")).toBe(true);
      }
    }
  }, 120_000);

  it("aucune page vide avec une suite, pour les trois filtres, sur un Fil mêlé de plusieurs sources", async () => {
    const viewer = await person("Viewer_Vide");
    const author = await person("Auteur_Vide");
    const orga = await person("Orga_Vide");
    const structure = await createStructure(orga.id);
    await follow(viewer, author);
    await bulkPosts(
      author,
      Array.from({ length: 70 }, (_, i) => hoursAgo(1 + i * 3)),
    );
    await bulkEvents(
      structure.id,
      Array.from({ length: 40 }, (_, i) => hoursAgo(2 + (i % 20))),
    );
    for (const filter of ["", "following", "nearby"]) {
      const pages = await walk(viewer, filter);
      expect(pages.flat().length, filter).toBeGreaterThan(0);
      for (const p of pages.slice(0, -1)) expect(p.length, filter).toBeGreaterThan(0);
    }
  }, 120_000);

  it("le plus grand curseur possible reste dans la limite acceptée par l'API", async () => {
    const viewer = await person("Viewer_Plafond");
    const id = (kind: string, n: number) => `${kind}:00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    const key = (n: number) => ({
      at: new Date(clock.now.getTime() - n * HOUR),
      id: id(feedCardKinds[n % 10] as string, n),
    });
    const biggest = {
      ref: clock.now,
      fp: "ffffffffffff",
      less: new Set(feedCardKinds),
      offset: 100_000,
      x: Array.from({ length: 16 }, (_, n) => key(n)),
      phase: 1 as const,
      score: Number.MAX_VALUE,
      frontier: id("event_recommended", 999),
      kinds: ["event_recommended", "sponsored"] as FeedCardKind[],
      deferred: Array.from({ length: 20 }, (_, n) => id("event_recommended", 100 + n)),
    };
    const raw = encodeCursor(biggest);
    expect(raw.length).toBe(1011);
    expect(raw.length).toBeLessThanOrEqual(FEED_CURSOR_MAX);
    expect(decodeCursor(raw)).toEqual(biggest);
    // l'API l'accepte (empreinte inconnue : un nouveau parcours, pas un refus)
    const res = await fil(viewer, `?cursor=${raw}`);
    expect(res.status).toBe(200);
    expect(res.json.reset).toBe(true);
    // un curseur plus long que le maximum est refusé avant tout calcul
    expect((await fil(viewer, `?cursor=${"A".repeat(FEED_CURSOR_MAX + 1)}`)).status).toBe(400);
  });
});

describe("photos du Fil : accès revérifié à chaque lecture (tour 2)", () => {
  async function withPhoto(author: TestUser) {
    const sent = await upload(author, await jpeg(1080, 1350));
    const res = await publish(author, { photos: [{ uploadKey: sent.json.key, noPlateConfirmed: true }] });
    expect(res.status).toBe(201);
    return { id: res.json.id as string, url: res.json.photos[0].url as string };
  }

  it("sans session : 401 ; un membre voit la photo d'un compte public, avec ses en-têtes ; ETag : 304 léger", async () => {
    const author = await person("Photo_Auteur");
    const member = await person("Photo_Membre");
    const { url } = await withPhoto(author);
    expect((await getPhoto(null, url)).status).toBe(401);
    const ok = await getPhoto(member, url);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("image/webp");
    expect(ok.headers.get("cache-control")).toBe("private, no-cache");
    const etag = ok.headers.get("etag") as string;
    expect(etag).toMatch(/^"[0-9a-f]{32}"$/);
    expect((await ok.arrayBuffer()).byteLength).toBeGreaterThan(100);
    // revalidation : l'accès est revérifié, le contenu n'est pas renvoyé
    const again = await getPhoto(member, url, { "if-none-match": etag });
    expect(again.status).toBe(304);
    expect(again.headers.get("cache-control")).toBe("private, no-cache");
    expect((await again.arrayBuffer()).byteLength).toBe(0);
    // un 304 ne s'obtient pas sans accès
    expect((await getPhoto(null, url, { "if-none-match": etag })).status).toBe(401);
  });

  it("compte privé : non abonné et demande en attente 404, abonné accepté 200, désabonnement : 404 aussitôt", async () => {
    const author = await person("Photo_Prive", { visibility: "private" });
    const fan = await person("Photo_Abonne");
    const stranger = await person("Photo_Inconnu");
    const pending = await person("Photo_Attente");
    const { url } = await withPhoto(author);
    await follow(fan, author);
    await follow(pending, author, "pending");
    expect((await getPhoto(author, url)).status).toBe(200);
    expect((await getPhoto(fan, url)).status).toBe(200);
    expect((await getPhoto(stranger, url)).status).toBe(404);
    expect((await getPhoto(pending, url)).status).toBe(404);
    // revalidation d'un abonné encore autorisé, puis il se désabonne : le 304 ne passe plus
    const etag = (await getPhoto(fan, url)).headers.get("etag") as string;
    expect((await getPhoto(fan, url, { "if-none-match": etag })).status).toBe(304);
    await db.delete(userFollows).where(eq(userFollows.followerId, fan.id));
    expect((await getPhoto(fan, url)).status).toBe(404);
    expect((await getPhoto(fan, url, { "if-none-match": etag })).status).toBe(404);
  });

  it("l'auteur passe son compte en privé : le Fil, la lecture et la photo se ferment aux non abonnés", async () => {
    const author = await person("Photo_Bascule");
    const fan = await person("Photo_Fan");
    const stranger = await person("Photo_Etranger");
    const { id, url } = await withPhoto(author);
    await follow(fan, author);
    expect((await getPhoto(stranger, url)).status).toBe(200);
    expect(postIdsOf((await fil(stranger)).items)).toContain(id);
    await db.update(profiles).set({ visibility: "private" }).where(eq(profiles.userId, author.id));
    expect((await getPhoto(stranger, url)).status).toBe(404);
    expect((await call(stranger, "GET", `/feed-posts/${id}`)).status).toBe(404);
    expect(postIdsOf((await fil(stranger)).items)).not.toContain(id);
    expect((await call(stranger, "PUT", `/feed-posts/${id}/reaction`)).status).toBe(404);
    expect((await getPhoto(fan, url)).status).toBe(200);
    expect(postIdsOf((await fil(fan)).items)).toContain(id);
    expect((await getPhoto(author, url)).status).toBe(200);
  });

  it("auteur suspendu ou banni, publication retirée : 404 pour les autres", async () => {
    const author = await person("Photo_Sanction");
    const member = await person("Photo_Lecteur");
    const { id, url } = await withPhoto(author);
    expect((await getPhoto(member, url)).status).toBe(200);
    await db
      .update(profiles)
      .set({ suspendedUntil: new Date(clock.now.getTime() + 24 * HOUR) })
      .where(eq(profiles.userId, author.id));
    expect((await getPhoto(member, url)).status).toBe(404);
    await db.update(profiles).set({ suspendedUntil: null, bannedAt: new Date() }).where(eq(profiles.userId, author.id));
    expect((await getPhoto(member, url)).status).toBe(404);
    await db.update(profiles).set({ bannedAt: null }).where(eq(profiles.userId, author.id));
    expect((await getPhoto(member, url)).status).toBe(200);
    // publication retirée par son auteur
    expect((await call(author, "DELETE", `/me/feed-posts/${id}`)).status).toBe(204);
    expect((await getPhoto(member, url)).status).toBe(404);
    expect((await getPhoto(author, url)).status).toBe(404);
  });

  it("noms mal formés, photo d'une autre publication, adresse publique des fichiers : 404", async () => {
    const author = await person("Photo_Noms");
    const member = await person("Photo_Noms_Lecteur");
    const a = await withPhoto(author);
    const b = await withPhoto(author);
    const nameA = a.url.slice(a.url.lastIndexOf("/") + 1);
    expect((await getPhoto(member, `/api/feed-posts/${b.id}/photos/${nameA}`)).status).toBe(404);
    expect((await getPhoto(member, `/api/feed-posts/${a.id}/photos/${"a".repeat(32)}.webp`)).status).toBe(404);
    expect((await getPhoto(member, `/api/feed-posts/${a.id}/photos/..%2F${nameA}`)).status).toBe(404);
    expect((await getPhoto(member, `/api/feed-posts/${a.id}/photos/${nameA.replace(".webp", ".png")}`)).status).toBe(
      404,
    );
    expect((await getPhoto(member, `/api/feed-posts/pas-un-uuid/photos/${nameA}`)).status).toBeGreaterThanOrEqual(400);
    expect((await app.request(`/api/files/private/feed/${a.id}/${nameA}`)).status).toBe(404);
    expect((await app.request(`/api/files/feed/${a.id}/${nameA}`)).status).toBe(404);
  });
});

const profileBody = (pseudo: string, bio?: string) => ({ pseudo, ...(bio ? { bio } : {}) });

describe("compte officiel et pseudos réservés (tour 2)", () => {
  it("un compte ordinaire qui se nomme « Orasso » n'est ni officiel, ni « Proposé par Orasso »", async () => {
    const viewer = await person("Viewer_Usurpe");
    const fake = await person("Faux_Compte");
    await db.update(profiles).set({ pseudo: "Orasso" }).where(eq(profiles.userId, fake.id));
    const id = await dbPost(fake);
    const card = (await fil(viewer)).items.find((c) => c.id === postCardId(id));
    expect(card).toBeTruthy();
    expect((card as FeedCard).reason.code).not.toBe("from_orasso");
    const post = ((card as FeedCard).payload as { post: { author: { official: boolean } } }).post;
    expect(post.author.official).toBe(false);
    expect((await call(viewer, "GET", `/feed-posts/${id}`)).json.author.official).toBe(false);
  });

  it("l'inscription et le changement de pseudo refusent « orasso », sans tenir compte de la casse ni des séparateurs", async () => {
    const u = await person("Pseudo_Normal");
    for (const bad of ["Orasso", "ORASSO", "orasso_fan", "Le.Orasso", "0rasso", "Mon_0RASSO_66", "o.r.a.s.s.o"]) {
      const res = await call(u, "PATCH", "/me/profile", profileBody(bad));
      expect(res.status, bad).toBe(400);
      expect(res.json.error.code, bad).toBe("pseudo_reserved");
      expect(res.json.error.message).toBe("Ce pseudo est réservé : choisis-en un autre.");
      const signup = await app.request("/api/auth/sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/json", origin: ORIGIN },
        body: JSON.stringify({
          email: `${randomBytes(4).toString("hex")}@orasso.test`,
          password: "motdepasse-test-123",
          name: bad,
          termsAccepted: true,
          ...signUpExtras,
        }),
      });
      expect(signup.status, bad).toBe(400);
      expect(((await signup.json()) as { error: { code: string } }).error.code).toBe("pseudo_reserved");
      const available = await app.request(`/api/pseudo-available?pseudo=${encodeURIComponent(bad)}`);
      expect(((await available.json()) as { available: boolean }).available, bad).toBe(false);
    }
    // un pseudo ordinaire passe toujours ; un pseudo déjà porté avant la règle n'est pas touché par un autre changement
    expect((await call(u, "PATCH", "/me/profile", profileBody("Pilote_Rassemblement"))).status).toBe(200);
    await db.update(profiles).set({ pseudo: "Ancien_Orasso" }).where(eq(profiles.userId, u.id));
    expect((await call(u, "PATCH", "/me/profile", profileBody("Ancien_Orasso", "Un mot"))).status).toBe(200);
  });

  it("le compte officiel garde son pseudo à la modification de son profil", async () => {
    const official = await person("Officiel_Test");
    await db.update(profiles).set({ official: true, pseudo: "Orasso" }).where(eq(profiles.userId, official.id));
    expect((await call(official, "PATCH", "/me/profile", profileBody("Orasso", "Le compte officiel"))).status).toBe(
      200,
    );
  });

  it("le seed refuse de rattacher le statut officiel à un compte ordinaire nommé « Orasso »", async () => {
    const fake = await person("Faux_Seed");
    await db.update(profiles).set({ pseudo: "Orasso" }).where(eq(profiles.userId, fake.id));
    const { seedFeed } = await import("../../../scripts/seed/feed");
    await expect(seedFeed()).rejects.toThrow(/compte ordinaire/);
    const [after] = await db.select().from(profiles).where(eq(profiles.userId, fake.id));
    expect(after?.official).toBe(false);
  });
});

describe("podium d'un compte privé, pros mobiles, flamme d'un compte suspendu (tour 2)", () => {
  async function voteResult(exhibitor: TestUser, orgaName: string, endedHoursAgo = 26) {
    const orga = await person(orgaName);
    const structure = await createStructure(orga.id);
    const car = await createVehicle(exhibitor.id, ref);
    await db.update(vehiclePhotos).set({ plateBlurred: true }).where(eq(vehiclePhotos.vehicleId, car.id));
    const past = await createEvent(structure.id, {
      department: "66",
      startsAt: hoursAgo(endedHoursAgo + 4),
      endsAt: hoursAgo(endedHoursAgo),
    });
    const [win] = await db
      .insert(applications)
      .values({
        eventId: past.id,
        userId: exhibitor.id,
        vehicleId: car.id,
        status: "accepted",
        rulesAcceptedAt: new Date(),
        followStructure: false,
        decidedAt: hoursAgo(endedHoursAgo + 10),
      })
      .returning();
    await db.insert(audiencePrizeResults).values({
      eventId: past.id,
      voteId: await allCategoriesId(past.id),
      applicationId: win!.id,
      rank: 1,
      votes: 9,
      winner: true,
      createdAt: hoursAgo(24),
    });
    return past.id;
  }
  type Podium = { podium: { pseudo: string | null; photoUrl: string | null }[] };
  const podiumOf = (items: FeedCard[]) => {
    const card = items.find((c) => c.kind === "vote_result");
    expect(card).toBeTruthy();
    return ((card as FeedCard).payload as Podium).podium;
  };

  it("compte privé non suivi : le podium montre la voiture seule (pseudo nul) ; public, soi ou abonné : le pseudo", async () => {
    const priv = await person("Podium_Prive", { visibility: "private" });
    await voteResult(priv, "Orga_Podium");
    const stranger = await person("Podium_Inconnu");
    const fan = await person("Podium_Abonne");
    await follow(fan, priv);
    const pending = await person("Podium_Attente");
    await follow(pending, priv, "pending");
    const seen = await fil(stranger);
    const first = podiumOf(seen.items);
    expect(first[0]?.pseudo).toBeNull();
    expect(JSON.stringify(seen.json)).not.toContain("Podium_Prive");
    expect(podiumOf((await fil(pending)).items)[0]?.pseudo).toBeNull();
    expect(podiumOf((await fil(fan)).items)[0]?.pseudo).toBe("Podium_Prive");
    expect(podiumOf((await fil(priv)).items)[0]?.pseudo).toBe("Podium_Prive");
    // la voiture reste affichée avec sa photo masquée
    expect(first[0]?.photoUrl).toBeTruthy();
    // compte public : le pseudo
    await db.update(profiles).set({ visibility: "public" }).where(eq(profiles.userId, priv.id));
    expect(podiumOf((await fil(stranger)).items)[0]?.pseudo).toBe("Podium_Prive");
  });

  it("l'événement terminé depuis plus de 16 jours n'entre pas dans la source (coût borné)", async () => {
    const exhibitor = await person("Podium_Ancien");
    await voteResult(exhibitor, "Orga_Ancien", 24 * 18);
    const viewer = await person("Viewer_Ancien");
    expect(kinds((await fil(viewer)).items).has("vote_result")).toBe(false);
  });

  it("« Autour de moi » : un pro sans atelier qui intervient dans le département de la personne est proposé", async () => {
    const owner = await person("Pro_Mobile");
    const owner2 = await person("Pro_Lointain");
    const owner3 = await person("Pro_Double");
    const viewer = await person("Viewer_ProMobile", { departments: ["66"] });
    const mobile = await createPro(owner.id, {
      name: "Dépannage mobile",
      department: null,
      interventionDepartments: ["66"],
      publishedAt: hoursAgo(3),
    });
    const elsewhere = await createPro(owner2.id, {
      name: "Atelier lointain",
      department: "75",
      interventionDepartments: ["75"],
      publishedAt: hoursAgo(3),
    });
    const proIds = (items: FeedCard[]) => items.filter((c) => c.kind === "pro").map((c) => c.id);
    const nearby = await fil(viewer, "?filter=nearby");
    expect(proIds(nearby.items)).toContain(`pro:${mobile.id}`);
    expect(proIds(nearby.items)).not.toContain(`pro:${elsewhere.id}`);
    expect(proIds((await fil(viewer)).items)).toContain(`pro:${mobile.id}`);
    // un atelier à Paris qui intervient aussi dans le 66 : proposé « autour de moi »
    const both = await createPro(owner3.id, {
      name: "Atelier Paris + 66",
      department: "75",
      interventionDepartments: ["75", "66"],
      publishedAt: hoursAgo(3),
    });
    expect(proIds((await fil(viewer, "?filter=nearby")).items)).toContain(`pro:${both.id}`);
  });

  it("un compte suspendu ne met pas de flamme et ne règle pas « moins de ce genre » (lecture seule)", async () => {
    const author = await person("Susp_Auteur");
    const u = await person("Susp_Lecteur");
    const id = await dbPost(author);
    await db
      .update(profiles)
      .set({ suspendedUntil: new Date(clock.now.getTime() + 24 * HOUR) })
      .where(eq(profiles.userId, u.id));
    expect((await call(u, "PUT", `/feed-posts/${id}/reaction`)).status).toBe(403);
    expect((await call(u, "DELETE", `/feed-posts/${id}/reaction`)).status).toBe(403);
    expect((await call(u, "POST", "/me/feed/less", { kind: "pro" })).status).toBe(403);
    expect((await call(u, "DELETE", "/me/feed/less/pro")).status).toBe(403);
    expect(await db.select().from(feedPostReactions)).toHaveLength(0);
    expect((await call(u, "GET", "/me/fil/less")).json.kinds).toEqual([]);
  });
});

describe("suppressions reprises et preuve d'une publication signalée (tour 2)", () => {
  async function postWithReport() {
    const author = await person("Preuve_Auteur");
    const reporter = await person("Preuve_Signaleur");
    const mod = await person("Preuve_Moderateur", { role: "moderator" });
    const sent = await upload(author, await jpeg(1080, 1350));
    const post = await publish(author, { photos: [{ uploadKey: sent.json.key, noPlateConfirmed: true }] });
    const report = await call(reporter, "POST", `/feed-posts/${post.json.id}/report`, { reason: "plate_or_face" });
    expect(report.status).toBe(201);
    return { author, reporter, mod, post: post.json, report: report.json };
  }
  const decide = (mod: TestUser, reportId: string, status: string) =>
    call(mod, "POST", `/admin/reports/${reportId}/status`, { status, note: null });

  it("signalement en attente : le retrait par l'auteur cache la publication mais garde les photos jusqu'à la décision", async () => {
    const { author, reporter, mod, post, report } = await postWithReport();
    const key = keyOfUrl(post.photos[0].url);
    expect((await call(author, "DELETE", `/me/feed-posts/${post.id}`)).status).toBe(204);
    // disparue pour tous, mais le fichier et sa ligne restent
    expect((await call(reporter, "GET", `/feed-posts/${post.id}`)).status).toBe(404);
    expect((await getPhoto(reporter, post.photos[0].url)).status).toBe(404);
    expect(postIdsOf((await fil(reporter)).items)).toEqual([]);
    expect(await storage.get(key)).not.toBeNull();
    expect(await db.select().from(feedPostPhotos)).toHaveLength(1);
    // le modérateur voit toujours la photo, dans le dossier du signalement
    const detail = await call(mod, "GET", `/admin/reports/${report.id}`);
    expect(detail.json.target.removed).toBe(true);
    const url = detail.json.target.imageUrl as string;
    const served = await app.request(url, { headers: { cookie: mod.cookie, origin: ORIGIN } });
    expect(served.status).toBe(200);
    // la prise en charge ne décide rien : les fichiers restent
    expect((await decide(mod, report.id, "reviewing")).status).toBe(200);
    expect(await storage.get(key)).not.toBeNull();
    // la décision efface les fichiers et les lignes
    expect((await decide(mod, report.id, "resolved_no_action")).status).toBe(200);
    expect(await storage.get(key)).toBeNull();
    expect(await db.select().from(feedPostPhotos)).toHaveLength(0);
    const gone = await app.request(url, { headers: { cookie: mod.cookie, origin: ORIGIN } });
    expect(gone.status).toBe(404);
  });

  it("sans signalement, ou une fois décidé : le retrait par l'auteur efface tout tout de suite", async () => {
    const author = await person("Preuve_Sans");
    const reporter = await person("Preuve_Sans_Signaleur");
    const mod = await person("Preuve_Sans_Mod", { role: "moderator" });
    const a = await upload(author, await jpeg(1080, 1350));
    const p1 = await publish(author, { photos: [{ uploadKey: a.json.key, noPlateConfirmed: true }] });
    expect((await call(author, "DELETE", `/me/feed-posts/${p1.json.id}`)).status).toBe(204);
    expect(await storage.get(keyOfUrl(p1.json.photos[0].url))).toBeNull();
    // signalement déjà décidé, puis retrait : effacement immédiat
    const b = await upload(author, await jpeg(1080, 1350));
    const p2 = await publish(author, { photos: [{ uploadKey: b.json.key, noPlateConfirmed: true }] });
    const r = await call(reporter, "POST", `/feed-posts/${p2.json.id}/report`, { reason: "spam" });
    await decide(mod, r.json.id, "resolved_no_action");
    expect((await call(author, "DELETE", `/me/feed-posts/${p2.json.id}`)).status).toBe(204);
    expect(await storage.get(keyOfUrl(p2.json.photos[0].url))).toBeNull();
  });

  it("deux signalements : les photos attendent la dernière décision ; un rejet pour abus d'un seul ne suffit pas", async () => {
    const { author, mod, post, report } = await postWithReport();
    const second = await person("Preuve_Second");
    const r2 = await call(second, "POST", `/feed-posts/${post.id}/report`, { reason: "spam" });
    expect(r2.status).toBe(201);
    const key = keyOfUrl(post.photos[0].url);
    expect((await call(author, "DELETE", `/me/feed-posts/${post.id}`)).status).toBe(204);
    const admin = await person("Preuve_Admin", { role: "super_admin" });
    // rejet pour abus du second : le premier attend toujours
    expect((await decide(admin, r2.json.id, "dismissed_abusive")).status).toBe(200);
    expect(await storage.get(key)).not.toBeNull();
    expect((await decide(mod, report.id, "resolved_no_action")).status).toBe(200);
    expect(await storage.get(key)).toBeNull();
  });

  it("le retrait par le super administrateur d'une publication déjà retirée par son auteur efface les photos gardées", async () => {
    const { author, post, report } = await postWithReport();
    const key = keyOfUrl(post.photos[0].url);
    await call(author, "DELETE", `/me/feed-posts/${post.id}`);
    expect(await storage.get(key)).not.toBeNull();
    const admin = await person("Preuve_Retrait_Admin", { role: "super_admin" });
    const done = await call(admin, "POST", `/admin/reports/${report.id}/sanction`, { hideContent: true });
    expect(done.status).toBe(200);
    expect(await storage.get(key)).toBeNull();
    expect(await db.select().from(feedPostPhotos)).toHaveLength(0);
  });

  it("un stockage en panne au retrait : la suppression est reprise par la tâche, qui accepte les clés du Fil", async () => {
    const author = await person("Reprise_Auteur");
    const sent = await upload(author, await jpeg(1080, 1350));
    const post = await publish(author, { photos: [{ uploadKey: sent.json.key, noPlateConfirmed: true }] });
    const key = keyOfUrl(post.json.photos[0].url);
    const spy = vi.spyOn(storage, "remove").mockRejectedValueOnce(new Error("stockage indisponible"));
    expect((await call(author, "DELETE", `/me/feed-posts/${post.json.id}`)).status).toBe(204);
    spy.mockRestore();
    expect(await storage.get(key)).not.toBeNull();
    expect(clock.jobs.jobs.find((j) => j.name === "storage.remove" && j.data.key === key)).toBeTruthy();
    await retryRemove(key);
    expect(await storage.get(key)).toBeNull();
    // l'envoi en attente (clé privée d'upload) est repris aussi
    const pendingKey = `private/feed-posts/${randomUUID()}.webp`;
    await storage.put(pendingKey, Buffer.from("x"));
    await retryRemove(pendingKey);
    expect(await storage.get(pendingKey)).toBeNull();
    // une clé d'un autre dossier n'est jamais effacée par la tâche
    await storage.put("private/crew-posts/intrus.webp", Buffer.from("x"));
    await retryRemove("private/crew-posts/intrus.webp");
    expect(await storage.get("private/crew-posts/intrus.webp")).not.toBeNull();
    await storage.remove("private/crew-posts/intrus.webp");
  });

  it("le retrait administratif passe aussi par la reprise (panne du stockage au retrait du contenu)", async () => {
    const { post, report } = await postWithReport();
    const key = keyOfUrl(post.photos[0].url);
    const admin = await person("Reprise_Admin", { role: "super_admin" });
    const spy = vi.spyOn(storage, "remove").mockRejectedValueOnce(new Error("stockage indisponible"));
    expect((await call(admin, "POST", `/admin/reports/${report.id}/sanction`, { hideContent: true })).status).toBe(200);
    spy.mockRestore();
    expect(clock.jobs.jobs.find((j) => j.name === "storage.remove" && j.data.key === key)).toBeTruthy();
    await retryRemove(key);
    expect(await storage.get(key)).toBeNull();
  });
});

// --- Tour 3 : un seul verrou pour le retrait, la décision et le signalement ; compte supprimé ; anciennes clés ---------

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Une connexion à part tient le verrou de la publication (`select … for update`) : elle joue l'écriture « en cours ». */
async function holdPostLock(postId: string) {
  const client = await pool.connect();
  await client.query("begin");
  await client.query("select id from feed_posts where id = $1 for update", [postId]);
  return client;
}

/** Attend (3 s au plus) qu'une requête de la base soit en attente d'un verrou : la synchronisation explicite des tests. */
async function waitForLockWait(): Promise<boolean> {
  const end = Date.now() + 3000;
  while (Date.now() < end) {
    const r = await pool.query<{ n: number }>(
      "select count(*)::int as n from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'",
    );
    if ((r.rows[0]?.n ?? 0) > 0) return true;
    await sleep(40);
  }
  return false;
}

describe("un seul verrou pour le retrait, la décision et le signalement (tour 3)", () => {
  async function postWithReport(withReport = true) {
    const author = await person("Verrou_Auteur");
    const reporter = await person("Verrou_Signaleur");
    const mod = await person("Verrou_Moderateur", { role: "moderator" });
    const sent = await upload(author, await jpeg(1080, 1350));
    const post = await publish(author, { photos: [{ uploadKey: sent.json.key, noPlateConfirmed: true }] });
    expect(post.status).toBe(201);
    let report: { id: string } | null = null;
    if (withReport) {
      const r = await call(reporter, "POST", `/feed-posts/${post.json.id}/report`, { reason: "plate_or_face" });
      expect(r.status).toBe(201);
      report = r.json;
    }
    return { author, reporter, mod, post: post.json, report: report as { id: string } };
  }
  const decide = (mod: TestUser, reportId: string) =>
    call(mod, "POST", `/admin/reports/${reportId}/status`, { status: "resolved_no_action", note: null });

  it("retrait ∥ décision : le retrait (signalement encore ouvert) garde les photos, la décision qui l'attendait les efface", async () => {
    const { author, mod, post, report } = await postWithReport();
    const key = keyOfUrl(post.photos[0].url);
    // le retrait de l'auteur tient le verrou et a lu « signalement en attente »
    const removal = await holdPostLock(post.id);
    const deciding = decide(mod, report.id);
    // la décision attend le verrou de la publication (sinon elle lirait la publication avant le retrait)
    expect(await waitForLockWait()).toBe(true);
    await removal.query("update feed_posts set deleted_at = now(), deleted_by = $2 where id = $1", [
      post.id,
      author.id,
    ]);
    await removal.query("commit");
    removal.release();
    expect((await deciding).status).toBe(200);
    // la décision a vu le retrait : aucune photo gardée sans signalement ouvert
    expect(await db.select().from(feedPostPhotos).where(eq(feedPostPhotos.postId, post.id))).toHaveLength(0);
    expect(await storage.get(key)).toBeNull();
  });

  it("décision ∥ retrait : le retrait qui attend la décision voit le signalement clos et efface tout de suite", async () => {
    const { author, mod, post, report } = await postWithReport();
    const key = keyOfUrl(post.photos[0].url);
    // la décision tient le verrou ; le signalement n'est pas encore clos pour les autres
    const decision = await holdPostLock(post.id);
    const removing = call(author, "DELETE", `/me/feed-posts/${post.id}`);
    expect(await waitForLockWait()).toBe(true);
    await decision.query("update reports set status = 'resolved_no_action', handled_by = $2 where id = $1", [
      report.id,
      mod.id,
    ]);
    await decision.query("commit");
    decision.release();
    expect((await removing).status).toBe(204);
    expect(await db.select().from(feedPostPhotos).where(eq(feedPostPhotos.postId, post.id))).toHaveLength(0);
    expect(await storage.get(key)).toBeNull();
  });

  it("signalement ∥ retrait : le signalement qui attend un retrait fini est refusé (404), rien n'est créé", async () => {
    const { author, reporter, post } = await postWithReport(false);
    const key = keyOfUrl(post.photos[0].url);
    // le retrait tient le verrou : il n'a vu aucun signalement, il efface tout
    const removal = await holdPostLock(post.id);
    const reporting = call(reporter, "POST", `/feed-posts/${post.id}/report`, { reason: "spam" });
    expect(await waitForLockWait()).toBe(true);
    await removal.query("update feed_posts set deleted_at = now(), deleted_by = $2 where id = $1", [
      post.id,
      author.id,
    ]);
    await removal.query("delete from feed_post_photos where post_id = $1", [post.id]);
    await removal.query("commit");
    removal.release();
    await storage.remove(key);
    const res = await reporting;
    expect(res.status).toBe(404);
    expect(await db.select().from(reports)).toHaveLength(0);
  });

  it("retrait ∥ signalement : le retrait qui attend un signalement créé voit ce signalement et garde les photos", async () => {
    const { author, reporter, post } = await postWithReport(false);
    const key = keyOfUrl(post.photos[0].url);
    // la création du signalement tient le verrou
    const reporting = await holdPostLock(post.id);
    const removing = call(author, "DELETE", `/me/feed-posts/${post.id}`);
    expect(await waitForLockWait()).toBe(true);
    await reporting.query(
      "insert into reports (reporter_id, target_type, target_id, target_owner_id, reason) values ($1, 'feed_post', $2, $3, 'spam')",
      [reporter.id, post.id, author.id],
    );
    await reporting.query("commit");
    reporting.release();
    expect((await removing).status).toBe(204);
    expect(await db.select().from(feedPostPhotos).where(eq(feedPostPhotos.postId, post.id))).toHaveLength(1);
    expect(await storage.get(key)).not.toBeNull();
  });
});

describe("compte supprimé et publication signalée (tour 3)", () => {
  it("un signalement ouvert : le compte supprimé garde les photos jusqu'à la décision, qui les efface avec la publication", async () => {
    const author = await person("Compte_Signale");
    const reporter = await person("Compte_Signaleur");
    const mod = await person("Compte_Moderateur", { role: "moderator" });
    const reported = await publish(author, {
      photos: [{ uploadKey: (await upload(author, await jpeg(1080, 1350))).json.key, noPlateConfirmed: true }],
    });
    const calm = await publish(author, {
      photos: [{ uploadKey: (await upload(author, await jpeg(1080, 1350))).json.key, noPlateConfirmed: true }],
    });
    const reportedKey = keyOfUrl(reported.json.photos[0].url);
    const calmKey = keyOfUrl(calm.json.photos[0].url);
    const report = await call(reporter, "POST", `/feed-posts/${reported.json.id}/report`, { reason: "plate_or_face" });
    expect(report.status).toBe(201);
    await call(reporter, "PUT", `/feed-posts/${reported.json.id}/reaction`);

    const keys = await withTx((tx) => anonymizeFeedForDeletedAccount(tx, author.id));
    // la publication tranquille part avec ses photos ; la signalée est seulement retirée, photos et ligne gardées
    expect(keys).toEqual([calmKey]);
    expect(await db.select().from(feedPosts).where(eq(feedPosts.id, calm.json.id))).toHaveLength(0);
    const [held] = await db.select().from(feedPosts).where(eq(feedPosts.id, reported.json.id));
    expect(held?.deletedAt).not.toBeNull();
    expect(held?.deletedBy).toBe(author.id);
    expect(
      await db.select().from(feedPostReactions).where(eq(feedPostReactions.postId, reported.json.id)),
    ).toHaveLength(0);
    expect(await db.select().from(feedPostPhotos).where(eq(feedPostPhotos.postId, reported.json.id))).toHaveLength(1);
    expect(await storage.get(reportedKey)).not.toBeNull();
    // invisible de tous, mais le modérateur voit toujours la photo
    expect((await call(reporter, "GET", `/feed-posts/${reported.json.id}`)).status).toBe(404);
    expect(postIdsOf((await fil(reporter)).items)).toEqual([]);
    const detail = await call(mod, "GET", `/admin/reports/${report.json.id}`);
    expect(detail.json.target.removed).toBe(true);
    const served = await app.request(detail.json.target.imageUrl as string, {
      headers: { cookie: mod.cookie, origin: ORIGIN },
    });
    expect(served.status).toBe(200);

    // le compte est anonymisé (profil supprimé), puis la décision tombe
    await db.update(profiles).set({ deletedAt: new Date() }).where(eq(profiles.userId, author.id));
    expect(
      (await call(mod, "POST", `/admin/reports/${report.json.id}/status`, { status: "resolved_no_action", note: null }))
        .status,
    ).toBe(200);
    expect(await storage.get(reportedKey)).toBeNull();
    expect(await db.select().from(feedPostPhotos).where(eq(feedPostPhotos.postId, reported.json.id))).toHaveLength(0);
    // plus rien à garder de la publication d'un compte supprimé (légende comprise)
    expect(await db.select().from(feedPosts).where(eq(feedPosts.id, reported.json.id))).toHaveLength(0);
  });
});

describe("anciennes clés publiques du Fil (tour 3)", () => {
  it("`/api/files` ne sert aucune clé `feed/…` ; le seed range les photos sous `private/feed/…` (relance sans effet)", async () => {
    const { migrateLegacyFeedKeys } = await import("../../../scripts/seed/feed");
    const viewer = await person("Viewer_Ancienne");
    const author = await person("Auteur_Ancienne");
    const id = await dbPost(author, { photos: [] });
    const hex = randomBytes(16).toString("hex");
    const oldKey = `feed/${id}/${hex}.webp`;
    const data = await jpeg(540, 675);
    await storage.put(oldKey, data);
    await db.insert(feedPostPhotos).values({
      postId: id,
      storageKey: oldKey,
      width: 540,
      height: 675,
      position: 0,
      plateBlurred: false,
      noPlateConfirmed: true,
    });
    // l'ancienne adresse publique ne répond plus
    expect((await app.request(`/api/files/${oldKey}`, { headers: { origin: ORIGIN } })).status).toBe(404);
    expect((await app.request(`/api/files/FEED/${id}/${hex}.webp`, { headers: { origin: ORIGIN } })).status).toBe(404);
    // le seed la range
    expect(await migrateLegacyFeedKeys()).toBe(1);
    const [row] = await db.select().from(feedPostPhotos).where(eq(feedPostPhotos.postId, id));
    expect(row?.storageKey).toBe(`private/feed/${id}/${hex}.webp`);
    expect(await storage.get(oldKey)).toBeNull();
    expect((await storage.get(`private/feed/${id}/${hex}.webp`))?.length).toBe(data.length);
    // la photo se lit par la route protégée, avec une session
    const photo = await getPhoto(viewer, `/api/feed-posts/${id}/photos/${hex}.webp`);
    expect(photo.status).toBe(200);
    expect((await getPhoto(null, `/api/feed-posts/${id}/photos/${hex}.webp`)).status).toBe(401);
    // relance : rien à ranger
    expect(await migrateLegacyFeedKeys()).toBe(0);
    await storage.remove(`private/feed/${id}/${hex}.webp`);
  });
});
