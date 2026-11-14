// Lot R9f, T42 : « Tes photos » et les mentions. Seulement les miennes, `canSave` selon `allow_save`, `canStory` selon l'état de plaque ;
// « Vu au … · N photos » sur la fiche d'une voiture (filtré par ce que le lecteur voit), « Photos de ma voiture » sur la sortie passée, mes photos
// dans le souvenir ; jamais des publications ; l'APK en ligne garde la forme d'avant (champs ajoutés seulement, et seulement quand il y a des photos).
import { seasonDates, seasonYear } from "@orasso/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { call, resetDb, seedReference, signUp, type TestUser, useClock } from "../../../test/helpers";
import { db, pool } from "../../db/client";
import {
  albumPhotoTags,
  eventAlbumPhotos,
  eventAlbums,
  passportStamps,
  seasons,
  stories,
  storyTags,
  userFollows,
} from "../../db/schema";
import { paris, publishedAlbum } from "./albums-test-helpers";
import { type Ref, tagScenario } from "./tags-test-helpers";

afterAll(async () => {
  await pool.end();
});

let ref: Ref;
let clock: ReturnType<typeof useClock>;
let s: Awaited<ReturnType<typeof tagScenario>>;
let nina: TestUser;

beforeEach(async () => {
  await resetDb();
  clock = useClock(paris(11, 5, 12));
  ref = await seedReference();
  s = await tagScenario(ref, 8);
  nina = await signUp("Nina_34");
});

const photo = (i: number) => s.photos[i]?.id as string;
const pose = (u: TestUser, photoId: string, body: unknown) => call(u, "POST", `/album-photos/${photoId}/tags`, body);
const mine = (u: TestUser | null, albumId = s.albumId) => call(u, "GET", `/me/albums/${albumId}/my-photos`);

describe("« Tes photos » : seulement les miennes", () => {
  it("mes photos, par ordre, avec qui m'a identifié ; la voiture, le média, la liste blanche ; jamais les photos d'un autre", async () => {
    for (const i of [0, 2, 3]) await pose(s.leo, photo(i), { vehicleId: s.car.dam.vehicle.id });
    await pose(s.dam, photo(5), { vehicleId: s.car.dam.vehicle.id });
    await pose(s.leo, photo(1), { userId: s.kenji.id });
    const res = await mine(s.dam);
    expect(res.status).toBe(200);
    expect(Object.keys(res.json).sort()).toEqual(["album", "media", "photos", "vehicle", "viewerIsAuthor"]);
    expect(res.json.viewerIsAuthor, "je ne suis pas l'auteur de l'album").toBe(false);
    expect(res.json.media).toMatchObject({ name: "Sud Cars" });
    expect(res.json.media.key).toBe(`m:${s.leoMedia}`);
    expect(res.json.vehicle).toMatchObject({ id: s.car.dam.vehicle.id });
    expect(res.json.album).toMatchObject({ id: s.albumId, event: { slug: s.event.slug } });
    expect(res.json.photos.map((p: { id: string }) => p.id)).toEqual([photo(0), photo(2), photo(3), photo(5)]);
    expect(res.json.photos.map((p: { taggedBy: string }) => p.taggedBy)).toEqual(["media", "media", "media", "me"]);
    for (const p of res.json.photos) {
      expect(Object.keys(p).sort()).toEqual([
        "canSave",
        "canStory",
        "height",
        "id",
        "liveStory",
        "position",
        "tagId",
        "taggedBy",
        "url",
        "width",
      ]);
      expect(p.url.startsWith(`/api/albums/${s.albumId}/photos/`)).toBe(true);
    }
    // La photo de Kenji n'est pas dans la liste de Dam, ni le pseudo de Kenji, ni les identifiants des autres.
    expect(res.text).not.toContain("Kenji_66");
    expect(res.text).not.toContain(s.kenji.id);
    const kenji = await mine(s.kenji);
    expect(kenji.json.photos.map((p: { id: string }) => p.id)).toEqual([photo(1)]);
    expect(kenji.json.vehicle).toBeNull();
  });

  it("« Contacter » : `viewerIsAuthor` est vrai seulement pour l'auteur de l'album (le compte du média), faux pour tout autre", async () => {
    await pose(s.leo, photo(0), { vehicleId: s.car.dam.vehicle.id });
    expect((await mine(s.dam)).json.viewerIsAuthor).toBe(false);
    // L'auteur (Léo, compte du média) est lui-même identifié sur une photo de son album : le champ lui dit qu'il est l'auteur.
    await db.insert(albumPhotoTags).values({
      photoId: photo(1),
      targetKind: "user",
      userId: s.leo.id,
      taggedBy: s.dam.id,
      taggedAs: "owner",
    });
    const own = await mine(s.leo);
    expect(own.status).toBe(200);
    expect(own.json.viewerIsAuthor).toBe(true);
  });

  it("deux identifications de moi sur la même photo : une seule ligne ; retirer celle d'un autre laisse l'autre, la dernière donne 404", async () => {
    const byLeo = await pose(s.leo, photo(0), { vehicleId: s.car.dam.vehicle.id });
    const bySelf = await pose(s.dam, photo(0), { userId: s.dam.id });
    const both = await mine(s.dam);
    expect(both.json.photos).toHaveLength(1);
    // Celle d'un autre prime : « Ce n'est pas ma voiture » est le geste proposé.
    expect(both.json.photos[0]).toMatchObject({ tagId: byLeo.json.id, taggedBy: "media" });
    expect((await call(s.dam, "DELETE", `/me/album-tags/${byLeo.json.id}`)).status).toBe(204);
    const left = await mine(s.dam);
    expect(left.status).toBe(200);
    expect(left.json.photos).toHaveLength(1);
    expect(left.json.photos[0]).toMatchObject({ tagId: bySelf.json.id, taggedBy: "me" });
    expect((await call(s.dam, "DELETE", `/me/album-tags/${bySelf.json.id}`)).status).toBe(204);
    expect((await mine(s.dam)).status).toBe(404);
  });

  it("`liveStory` : ma story originale encore en ligne (public, fin), jamais une copie d'une story d'un autre ni une story tombée", async () => {
    await pose(s.leo, photo(0), { vehicleId: s.car.dam.vehicle.id });
    await pose(s.leo, photo(0), { userId: s.kenji.id });
    expect((await mine(s.dam)).json.photos[0].liveStory).toBeNull();
    const story = await call(s.dam, "POST", `/album-photos/${photo(0)}/share-to-story`, { audience: "followers" });
    expect(story.status).toBe(201);
    const live = (await mine(s.dam)).json.photos[0].liveStory;
    expect(Object.keys(live).sort()).toEqual(["audience", "expiresAt"]);
    expect(live.audience).toBe("followers");
    // Kenji repartage la story de Damien (copie qui porte le crédit) : pour lui, rien n'est « déjà en story ».
    await db.insert(storyTags).values({ storyId: story.json.id, targetKind: "user", targetId: s.kenji.id });
    expect((await call(s.kenji, "POST", `/stories/${story.json.id}/share-to-mine`, {})).status).toBeLessThan(300);
    expect((await mine(s.kenji)).json.photos[0].liveStory).toBeNull();
    // Une story tombée n'est plus « en ligne ».
    await db.update(stories).set({ deletedAt: new Date() }).where(eq(stories.id, story.json.id));
    expect((await mine(s.dam)).json.photos[0].liveStory).toBeNull();
  });

  it("`canSave` suit `allow_save` ; `canStory` suit l'état de plaque (une photo d'ancienne galerie ne se partage pas en story)", async () => {
    await pose(s.leo, photo(0), { vehicleId: s.car.dam.vehicle.id });
    await pose(s.leo, photo(1), { vehicleId: s.car.dam.vehicle.id });
    await db
      .update(eventAlbumPhotos)
      .set({ plateState: "unknown" })
      .where(eq(eventAlbumPhotos.id, photo(1)));
    const open = await mine(s.dam);
    // Un fichier qui sort d'Orasso a ses plaques traitées : une photo d'ancienne galerie ne s'enregistre pas non plus.
    expect(open.json.photos.map((p: { canSave: boolean }) => p.canSave)).toEqual([true, false]);
    expect(open.json.photos.map((p: { canStory: boolean }) => p.canStory)).toEqual([true, false]);
    await db.update(eventAlbums).set({ allowSave: false }).where(eq(eventAlbums.id, s.albumId));
    expect((await mine(s.dam)).json.photos.map((p: { canSave: boolean }) => p.canSave)).toEqual([false, false]);
  });

  it("sans identification : 404 ; sans session : 401 ; une identification retirée n'est plus listée", async () => {
    await pose(s.leo, photo(0), { vehicleId: s.car.dam.vehicle.id });
    expect((await mine(nina)).status).toBe(404);
    expect((await mine(s.marc)).status).toBe(404);
    expect((await mine(null)).status).toBe(401);
    const tag = (await mine(s.dam)).json.photos[0].tagId;
    await call(s.dam, "DELETE", `/me/album-tags/${tag}`);
    expect((await mine(s.dam)).status).toBe(404);
  });

  it("toutes mes identifications, par album, par pages (`GET /me/album-tags`) : les miennes seules", async () => {
    const marc = await publishedAlbum(s.marc, s.event.id, 3);
    const marcPhotos = await db
      .select()
      .from(eventAlbumPhotos)
      .where(eq(eventAlbumPhotos.albumId, marc.id))
      .orderBy(eventAlbumPhotos.position);
    for (const i of [0, 1]) await pose(s.leo, photo(i), { vehicleId: s.car.dam.vehicle.id });
    // Le média de l'autre album identifie la même voiture ; l'organisateur peut aussi le faire sur l'album de Marc.
    expect((await pose(s.marc, marcPhotos[0]?.id as string, { vehicleId: s.car.dam.vehicle.id })).status).toBe(201);
    expect((await pose(s.leo, marcPhotos[1]?.id as string, { vehicleId: s.car.dam.vehicle.id })).status).toBe(404);
    await pose(s.leo, photo(2), { userId: s.kenji.id });
    const all = await call(s.dam, "GET", "/me/album-tags");
    expect(all.status).toBe(200);
    expect(all.json.items.map((i: { albumId: string }) => i.albumId).sort()).toEqual([marc.id, s.albumId].sort());
    const first = await call(s.dam, "GET", "/me/album-tags?limit=1");
    expect(first.json.items).toHaveLength(1);
    expect(first.json.nextCursor).toBe(first.json.items[0].albumId);
    const second = await call(s.dam, "GET", `/me/album-tags?limit=1&cursor=${first.json.nextCursor}`);
    expect(second.json.items).toHaveLength(1);
    expect(second.json.items[0].albumId).not.toBe(first.json.items[0].albumId);
    expect(second.json.nextCursor).toBeNull();
    const kenji = await call(s.kenji, "GET", "/me/album-tags");
    expect(kenji.json.items).toHaveLength(1);
    expect(kenji.json.items[0]).toMatchObject({ albumId: s.albumId, count: 1, mediaName: "Sud Cars" });
    expect((await call(null, "GET", "/me/album-tags")).status).toBe(401);
  });
});

describe("la fiche d'une voiture : « Vu au … · N photos » (filtré par le lecteur)", () => {
  const sheet = (u: TestUser, vehicleId: string) => call(u, "GET", `/vehicles/${vehicleId}`);

  it("six vignettes au plus et le nombre total ; visible de qui voit la fiche ; les champs de la mention sont une liste blanche", async () => {
    for (let i = 0; i < 8; i++) await pose(s.leo, photo(i), { vehicleId: s.car.dam.vehicle.id });
    for (const who of [nina, s.kenji, s.dam]) {
      const res = await sheet(who, s.car.dam.vehicle.id);
      expect(res.status).toBe(200);
      expect(res.json.albumMentions).toHaveLength(1);
      const m = res.json.albumMentions[0];
      expect(Object.keys(m).sort()).toEqual(["albumId", "count", "eventSlug", "eventTitle", "mediaName", "photos"]);
      expect(m).toMatchObject({ albumId: s.albumId, count: 8, mediaName: "Sud Cars", eventSlug: s.event.slug });
      expect(m.photos).toHaveLength(6);
      expect(m.photos.map((p: { position: number }) => p.position)).toEqual([0, 1, 2, 3, 4, 5]);
      expect(Object.keys(m.photos[0]).sort()).toEqual(["height", "id", "position", "url", "width"]);
      expect(res.text).not.toContain(s.leo.id);
    }
  });

  it("forme d'avant : sans photo identifiée, la fiche n'a pas le champ ; avec, le seul champ de plus est `albumMentions` (APK en ligne)", async () => {
    await pose(s.leo, photo(0), { vehicleId: s.car.dam.vehicle.id });
    const plain = await sheet(nina, s.car.kenji.vehicle.id);
    const tagged = await sheet(nina, s.car.dam.vehicle.id);
    expect(plain.json).not.toHaveProperty("albumMentions");
    expect(Object.keys(tagged.json).filter((k) => !(k in plain.json))).toEqual(["albumMentions"]);
  });

  it("une voiture d'un compte privé : la fiche réduite ne gagne aucun champ ; un abonné accepté et lui-même voient les photos", async () => {
    await pose(s.leo, photo(0), { vehicleId: s.car.priv.vehicle.id });
    for (const who of [nina, s.marc, s.leo]) {
      const res = await sheet(who, s.car.priv.vehicle.id);
      expect(res.status).toBe(200);
      expect(res.json.detailed).toBe(false);
      expect(res.json).not.toHaveProperty("albumMentions");
    }
    await db
      .insert(userFollows)
      .values({ followerId: nina.id, followedId: s.priv.id, status: "accepted", acceptedAt: new Date() });
    expect((await sheet(nina, s.car.priv.vehicle.id)).json.albumMentions).toHaveLength(1);
    expect((await sheet(s.priv, s.car.priv.vehicle.id)).json.albumMentions).toHaveLength(1);
  });

  it("une identification retirée ou un album supprimé n'apparaît plus ; jamais dans les publications", async () => {
    const a = await pose(s.leo, photo(0), { vehicleId: s.car.dam.vehicle.id });
    await pose(s.leo, photo(1), { vehicleId: s.car.dam.vehicle.id });
    await call(s.dam, "DELETE", `/me/album-tags/${a.json.id}`);
    expect((await sheet(nina, s.car.dam.vehicle.id)).json.albumMentions[0].count).toBe(1);
    await call(s.leo, "DELETE", `/me/albums/${s.albumId}`);
    expect((await sheet(nina, s.car.dam.vehicle.id)).json).not.toHaveProperty("albumMentions");
    const feed = await call(nina, "GET", `/authors/u:${s.dam.id}/feed-posts`);
    expect(JSON.stringify(feed.json)).not.toContain(s.albumId);
  });
});

describe("la sortie passée et le souvenir : mes photos, les miennes seules", () => {
  it("sortie passée : « Photos de ma voiture » (un album), absente d'une sortie à venir et de qui n'est pas identifié", async () => {
    await pose(s.leo, photo(0), { vehicleId: s.car.dam.vehicle.id });
    await pose(s.leo, photo(1), { vehicleId: s.car.dam.vehicle.id });
    await pose(s.leo, photo(2), { userId: s.kenji.id });
    // À venir : rien.
    const upcoming = await call(s.dam, "GET", "/me/applications?scope=upcoming");
    expect(upcoming.status).toBe(200);
    expect(JSON.stringify(upcoming.json)).not.toContain("albumPhotos");
    clock.set(paris(11, 10, 12));
    const past = await call(s.dam, "GET", "/me/applications?scope=past");
    expect(past.status).toBe(200);
    const row = past.json.find((a: { event: { id: string } }) => a.event.id === s.event.id);
    expect(row.albumPhotos).toHaveLength(1);
    expect(row.albumPhotos[0]).toMatchObject({ albumId: s.albumId, count: 2, mediaName: "Sud Cars" });
    const kenji = await call(s.kenji, "GET", "/me/applications?scope=past");
    expect(kenji.json.find((a: { event: { id: string } }) => a.event.id === s.event.id).albumPhotos[0].count).toBe(1);
    // La voiture de Priv n'est pas identifiée : la sortie garde la forme d'avant.
    const priv = await call(s.priv, "GET", "/me/applications?scope=past");
    expect(priv.json.find((a: { event: { id: string } }) => a.event.id === s.event.id)).not.toHaveProperty(
      "albumPhotos",
    );
  });

  it("souvenir : mes photos de l'événement (voiture ou pseudo), pas celles d'un autre ; rien sans identification", async () => {
    await pose(s.leo, photo(0), { vehicleId: s.car.dam.vehicle.id });
    await pose(s.leo, photo(1), { userId: s.kenji.id });
    const d = seasonDates(seasonYear(s.event.startsAt));
    await db.insert(seasons).values(d).onConflictDoNothing();
    const season = await db.query.seasons.findFirst({ where: eq(seasons.startsOn, d.startsOn) });
    for (const u of [s.dam, s.kenji, s.priv]) {
      await db.insert(passportStamps).values({
        userId: u.id,
        eventId: s.event.id,
        seasonId: season!.id,
        kind: "participation",
        shape: "round",
        ink: "default",
        seed: 1,
        rare: false,
        stampedAt: paris(11, 9, 11),
      });
    }
    // Un an plus tard, le souvenir existe.
    clock.set(new Date(paris(11, 9, 11).getTime() + 366 * 86_400_000));
    const dam = await call(s.dam, "GET", `/me/memories/${s.event.id}`);
    expect(dam.status).toBe(200);
    expect(dam.json.albumPhotos).toHaveLength(1);
    expect(dam.json.albumPhotos[0]).toMatchObject({ albumId: s.albumId, count: 1, mediaName: "Sud Cars" });
    const kenji = await call(s.kenji, "GET", `/me/memories/${s.event.id}`);
    expect(kenji.json.albumPhotos[0].count).toBe(1);
    expect(kenji.json.albumPhotos[0].photos[0].id).toBe(photo(1));
    // Pas d'identification : la forme d'avant (aucun champ en plus).
    const priv = await call(s.priv, "GET", `/me/memories/${s.event.id}`);
    expect(priv.status).toBe(200);
    expect(priv.json).not.toHaveProperty("albumPhotos");
    // Forme d'avant, champ à champ (APK en ligne) : aucune clé de plus sans identification.
    expect(Object.keys(priv.json).sort()).toEqual(
      [
        "anniversary",
        "car",
        "city",
        "eventId",
        "photoUrl",
        "posterUrl",
        "recapAvailable",
        "slug",
        "stamp",
        "stampId",
        "startsAt",
        "title",
        "vehicleLabel",
        "yearsAgo",
      ].sort(),
    );
  });
});
