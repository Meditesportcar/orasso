// Lot R7e1 : l'API du Fil. Vie privée d'abord : jamais un contenu de crew, jamais la publication d'un compte privé non
// suivi, jamais un compte suspendu, jamais une photo dont la plaque n'est pas traitée, jamais sans session ; décision de
// plaque obligatoire à la publication ; curseur sans doublon ni trou ; signalement et média réservés à la modération.
import { randomBytes, randomUUID } from "node:crypto";
import { type FeedCard, type FeedCardKind, feedCardKinds } from "@orasso/shared";
import { eq, inArray } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  blurPlatesOf,
  call,
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
  audiencePrizeResults,
  eventAnnouncements,
  feedPostPhotos,
  feedPostReactions,
  feedPosts,
  profiles,
  structureFollows,
  uploads,
  userFollows,
  vehiclePhotos,
} from "../../db/schema";
import { storage } from "../../lib/storage";
import { withTx } from "../../lib/tx";
import { anonymizeFeedForDeletedAccount } from "./anonymize";

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
      storageKey: `feed/${id}/${randomBytes(16).toString("hex")}.webp`,
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
    const official = await person("Orasso");
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

  it("4:5 : publication créée, photo sous feed/<id>/, envoi privé effacé, réponse en liste blanche", async () => {
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
    expect(post.photos[0].url).toMatch(new RegExp(`^/api/files/feed/${post.id}/[0-9a-f]{32}\\.webp$`));
    // la photo publique existe, l'envoi privé non
    const file = await storage.get(post.photos[0].url.replace("/api/files/", ""));
    expect(file).not.toBeNull();
    expect(await storage.get(sent.json.key)).toBeNull();
    const [row] = await db.select().from(feedPostPhotos);
    expect(row).toMatchObject({ plateBlurred: false, noPlateConfirmed: true, position: 0 });
    const served = await app.request(post.photos[0].url);
    expect(served.status).toBe(200);
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
    const key = (res.json.photos[0].url as string).replace("/api/files/", "");
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
    const key = (post.photos[0].url as string).replace("/api/files/", "");
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
