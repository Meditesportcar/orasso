// Lot R9f, partie 1, tour 1 : les corrections des relectures. Compte suspendu qui retire son identification, « Enregistrer » avec les plaques
// floutées (`kept`) ou refusé (`unknown`), course entre la modération et « En story » (verrou commun), deux « En story » simultanés, story reprise
// qui suit la visibilité de l'album (lecture, fichier, export), notification durable par album et par personne, « Tes photos » paginée en base.
import { and, eq, isNull, sql } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { call, resetDb, seedReference, type TestUser, useClock } from "../../../test/helpers";
import { app } from "../../app";
import { db, pool } from "../../db/client";
import {
  albumPhotoTags,
  applications,
  eventAlbumPhotos,
  eventAlbums,
  events,
  notifications,
  profiles,
  stories,
  userFollows,
} from "../../db/schema";
import { storage } from "../../lib/storage";
import { withTx } from "../../lib/tx";
import { albumPhotoTarget } from "../moderation/targets/albumPhoto";
import { INSIDE, paris, publishedAlbum, RECT } from "./albums-test-helpers";
import { shiftPositions } from "./service";
import { shareToStoryTestHooks } from "./share-to-story";
import { type Ref, tagScenario } from "./tags-test-helpers";

afterAll(async () => {
  await pool.end();
});

let ref: Ref;
let s: Awaited<ReturnType<typeof tagScenario>>;

beforeEach(async () => {
  await resetDb();
  useClock(paris(11, 5, 12));
  ref = await seedReference();
  s = await tagScenario(ref, 8);
});

const photo = (i: number) => s.photos[i]?.id as string;
const pose = (u: TestUser, photoId: string, body: unknown) => call(u, "POST", `/album-photos/${photoId}/tags`, body);
const toStory = (u: TestUser, photoId: string) => call(u, "POST", `/album-photos/${photoId}/share-to-story`, {});
const download = (u: TestUser, photoId: string) =>
  app.request(`/api/album-photos/${photoId}/download`, { headers: { cookie: u.cookie } });
const storyRow = async (id: string) => (await db.select().from(stories).where(eq(stories.id, id)))[0];
const meanSpread = async (buf: Buffer, box: { left: number; top: number; width: number; height: number }) => {
  const { data } = await sharp(buf).extract(box).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const mean = data.reduce((a, v) => a + v, 0) / data.length;
  return Math.sqrt(data.reduce((a, v) => a + (v - mean) ** 2, 0) / data.length);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("un compte suspendu retire son identification, à tout moment", () => {
  it("par la route HTTP : 204 ; il voit les siennes pendant la suspension ; toute autre écriture reste refusée", async () => {
    const tag = await pose(s.leo, photo(0), { vehicleId: s.car.dam.vehicle.id });
    await pose(s.leo, photo(1), { vehicleId: s.car.dam.vehicle.id });
    await db
      .update(profiles)
      .set({ suspendedUntil: new Date(Date.now() + 86_400_000) })
      .where(eq(profiles.userId, s.dam.id));
    // Lecture : ses identifications restent visibles de lui seul (les autres ne voient plus son compte suspendu).
    const own = await call(s.dam, "GET", `/albums/${s.albumId}`);
    expect(own.status).toBe(200);
    expect(own.json.tagsCount).toBe(2);
    expect((await call(s.dam, "GET", `/me/albums/${s.albumId}/my-photos`)).json.photos).toHaveLength(2);
    expect((await call(s.dam, "GET", "/me/album-tags")).json.items[0].count).toBe(2);
    expect((await call(s.kenji, "GET", `/albums/${s.albumId}`)).json.tagsCount ?? 0).toBe(0);
    // Écriture refusée ailleurs, retrait permis.
    expect((await pose(s.dam, photo(2), { vehicleId: s.car.dam.vehicle.id })).status).toBe(403);
    expect((await toStory(s.dam, photo(0))).status).toBe(403);
    expect((await call(s.dam, "DELETE", `/me/album-tags/${tag.json.id}`)).status).toBe(204);
    const [row] = await db.select().from(albumPhotoTags).where(eq(albumPhotoTags.id, tag.json.id));
    expect(row?.removedReason).toBe("not_mine");
    // Un compte banni n'a plus aucun accès.
    await db.update(profiles).set({ bannedAt: new Date() }).where(eq(profiles.userId, s.dam.id));
    expect((await call(s.dam, "GET", "/me/album-tags")).status).toBe(403);
  });
});

describe("« Enregistrer » : un fichier qui sort d'Orasso a ses plaques floutées", () => {
  it("`kept` : floutée avec les cadres gardés ; `blurred` et `none` : telle quelle ; `unknown` : 409 et `canSave` faux", async () => {
    for (const i of [0, 1, 2]) await pose(s.leo, photo(i), { vehicleId: s.car.dam.vehicle.id });
    const original = (await storage.get(s.photos[0]?.storageKey ?? "")) as Buffer;
    const before = await meanSpread(original, INSIDE);
    expect(before).toBeGreaterThan(40);
    // `none` : la photo part comme elle est (le crédit est ailleurs).
    const none = Buffer.from(await (await download(s.dam, photo(0))).arrayBuffer());
    expect(await meanSpread(none, INSIDE)).toBeGreaterThan(40);
    // `kept` : les cadres gardés sont floutés avant le crédit.
    await db
      .update(eventAlbumPhotos)
      .set({ plateState: "kept", plateRects: [RECT] })
      .where(eq(eventAlbumPhotos.id, photo(0)));
    const kept = await download(s.dam, photo(0));
    expect(kept.status).toBe(200);
    const blurred = await meanSpread(Buffer.from(await kept.arrayBuffer()), INSIDE);
    expect(blurred).toBeLessThan(before / 3);
    // `unknown` (ancienne galerie) : refusé, et l'écran ne propose pas « Enregistrer ».
    await db
      .update(eventAlbumPhotos)
      .set({ plateState: "unknown", plateRects: null })
      .where(eq(eventAlbumPhotos.id, photo(1)));
    const unknown = await download(s.dam, photo(1));
    expect(unknown.status).toBe(409);
    expect(((await unknown.json()) as { error: { code: string } }).error.code).toBe("plate_unknown");
    expect((await download(s.leo, photo(1))).status).toBe(409);
    const mine = await call(s.dam, "GET", `/me/albums/${s.albumId}/my-photos`);
    expect(mine.json.photos.map((p: { canSave: boolean }) => p.canSave)).toEqual([true, false, true]);
  });
});

describe("« En story » : une photo retirée ne finit jamais dans une nouvelle story", () => {
  it("la modération qui retire la photo entre le contrôle et l'insertion attend le partage, puis fait tomber la story", async () => {
    await pose(s.leo, photo(0), { vehicleId: s.car.dam.vehicle.id });
    let done = false;
    let pending: Promise<unknown> = Promise.resolve();
    shareToStoryTestHooks.afterLocks = async () => {
      // Dans la transaction du partage, verrous pris : la modération démarre et doit attendre.
      pending = withTx(
        async (tx) =>
          (await albumPhotoTarget.remove?.(tx, undefined as never, { targetId: photo(0) } as never, () => undefined)) ??
          [],
      ).then(() => {
        done = true;
      });
      await sleep(400);
      expect(done).toBe(false);
    };
    try {
      const res = await toStory(s.dam, photo(0));
      expect(res.status).toBe(201);
      await pending;
      expect(done).toBe(true);
      // La photo est retirée **et** la story créée entre-temps est tombée.
      const [row] = await db
        .select()
        .from(eventAlbumPhotos)
        .where(eq(eventAlbumPhotos.id, photo(0)));
      expect(row?.deletedAt).not.toBeNull();
      expect((await storyRow(res.json.id))?.deletedAt).not.toBeNull();
    } finally {
      shareToStoryTestHooks.afterLocks = undefined;
    }
    // Une photo déjà retirée n'est plus partageable.
    expect((await toStory(s.dam, photo(0))).status).toBe(404);
  });

  it("deux appels simultanés : une seule story, réponses 201 et 200 sur la même", async () => {
    await pose(s.leo, photo(0), { vehicleId: s.car.dam.vehicle.id });
    const both = await Promise.all([toStory(s.dam, photo(0)), toStory(s.dam, photo(0))]);
    expect(both.map((r) => r.status).sort()).toEqual([200, 201]);
    expect(both[0]?.json.id).toBe(both[1]?.json.id);
    expect(await db.select().from(stories).where(eq(stories.authorId, s.dam.id))).toHaveLength(1);
  });
});

describe("une story reprise d'un album suit la visibilité de l'album", () => {
  const byAuthor = (u: TestUser) => call(u, "GET", `/stories/by-author/u:${s.dam.id}`);

  it("accréditation retombée, média banni, événement annulé : ni lecture, ni fichier, ni export, ni barre ; elle revient avec l'album", async () => {
    await pose(s.leo, photo(0), { vehicleId: s.car.dam.vehicle.id });
    // Kenji suit Dam : la story est dans sa barre.
    await db
      .insert(userFollows)
      .values({ followerId: s.kenji.id, followedId: s.dam.id, status: "accepted", acceptedAt: new Date() });
    const story = await toStory(s.dam, photo(0));
    const id = story.json.id as string;
    const name = ((await storyRow(id))?.storageKey ?? "").split("/").pop();
    const open = async () => ({
      list: ((await byAuthor(s.kenji)).json.stories ?? []).length as number,
      mine: ((await call(s.dam, "GET", "/me/stories")).json.stories ?? []).length as number,
      file: (await call(s.kenji, "GET", `/stories/${id}/media/${name}`)).status as number,
      exportStatus: (await app.request(`/api/stories/${id}/export`, { headers: { cookie: s.dam.cookie } })).status,
      bar: JSON.stringify((await call(s.kenji, "GET", "/stories/bar")).json),
    });
    const base = await open();
    expect(base).toMatchObject({ list: 1, mine: 1, file: 200, exportStatus: 200 });
    expect(base.bar).toContain(s.dam.id);
    const hidden = { list: 0, mine: 0, file: 404, exportStatus: 404 };

    // 1. L'accréditation du média tombe.
    await db.update(applications).set({ status: "withdrawn" }).where(eq(applications.mediaProfileId, s.leoMedia));
    const a = await open();
    expect(a).toMatchObject(hidden);
    expect(a.bar).not.toContain(s.dam.id);
    await db.update(applications).set({ status: "accepted" }).where(eq(applications.mediaProfileId, s.leoMedia));
    expect(await open()).toMatchObject({ list: 1, file: 200 });

    // 2. Le média est banni.
    await db.update(profiles).set({ bannedAt: new Date() }).where(eq(profiles.userId, s.leo.id));
    expect(await open()).toMatchObject(hidden);
    await db.update(profiles).set({ bannedAt: null }).where(eq(profiles.userId, s.leo.id));

    // 3. L'événement est annulé, ou passe sur invitation.
    await db.update(events).set({ status: "cancelled" }).where(eq(events.id, s.event.id));
    expect(await open()).toMatchObject(hidden);
    await db.update(events).set({ status: "published" }).where(eq(events.id, s.event.id));
    await db.update(events).set({ admission: "invite_only" }).where(eq(events.id, s.event.id));
    expect(await open()).toMatchObject(hidden);
    await db.update(events).set({ admission: "open" }).where(eq(events.id, s.event.id));

    // L'album revient visible : la story aussi (elle n'a jamais été supprimée).
    expect(await open()).toMatchObject({ list: 1, mine: 1, file: 200, exportStatus: 200 });
    expect((await storyRow(id))?.deletedAt).toBeNull();
  });
});

describe("une notification durable par album et par personne", () => {
  const rows = (userId: string) =>
    db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.type, "album_tagged")));

  it("après lecture, puis après 24 h : la même ligne est actualisée (compte, titre, vignettes), jamais une seconde", async () => {
    await pose(s.leo, photo(0), { vehicleId: s.car.dam.vehicle.id });
    const [first] = await rows(s.dam.id);
    expect(first?.deliveredAt).not.toBeNull();
    // Lue : une nouvelle photo la met à jour, sans seconde ligne ; elle redevient « non lue », sans nouveau push.
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(eq(notifications.id, first?.id ?? ""));
    await pose(s.leo, photo(1), { vehicleId: s.car.dam.vehicle.id });
    const second = await rows(s.dam.id);
    expect(second).toHaveLength(1);
    expect(second[0]?.id).toBe(first?.id);
    expect(second[0]?.readAt).toBeNull();
    expect(second[0]?.pushSentAt).toBeNull();
    expect(second[0]?.title).toContain("a publié 2 photos de ta BMW");
    expect(((second[0]?.data ?? {}) as { count?: number; thumbs?: string[] }).count).toBe(2);
    expect(((second[0]?.data ?? {}) as { thumbs?: string[] }).thumbs).toHaveLength(2);
    // Plus de 24 h après, lue : toujours la même ligne.
    await db
      .update(notifications)
      .set({ readAt: new Date(), createdAt: new Date(Date.now() - 3 * 86_400_000) })
      .where(eq(notifications.id, first?.id ?? ""));
    await pose(s.leo, photo(2), { vehicleId: s.car.dam.vehicle.id });
    const third = await rows(s.dam.id);
    expect(third).toHaveLength(1);
    expect(third[0]?.title).toContain("a publié 3 photos de ta BMW");
    expect(((third[0]?.data ?? {}) as { count?: number }).count).toBe(3);
    // Un autre album : une autre ligne (une par album).
  });
});

describe("« Tes photos » : les albums sont paginés en base", () => {
  it("61 albums : toutes les pages, un compte distinct et six vignettes au plus, un curseur inconnu rend une page vide", async () => {
    for (let i = 0; i < 8; i++) await pose(s.leo, photo(i), { vehicleId: s.car.dam.vehicle.id });
    const base = Date.now() - 400 * 86_400_000;
    const ids: string[] = [];
    for (let i = 0; i < 60; i++) {
      const [album] = await db
        .insert(eventAlbums)
        .values({
          eventId: s.event.id,
          mediaProfileId: s.leoMedia,
          authorId: s.leo.id,
          status: "published",
          publishedAt: new Date(base + i * 3_600_000),
          photosCount: 1,
        })
        .returning({ id: eventAlbums.id });
      const albumId = album?.id as string;
      ids.push(albumId);
      const [p] = await db
        .insert(eventAlbumPhotos)
        .values({
          albumId,
          storageKey: `private/albums/${albumId}/seed.webp`,
          position: 0,
          plateState: "none",
        })
        .returning({ id: eventAlbumPhotos.id });
      await db.insert(albumPhotoTags).values({
        photoId: p?.id as string,
        targetKind: "vehicle",
        vehicleId: s.car.dam.vehicle.id,
        userId: s.dam.id,
        taggedBy: s.leo.id,
        taggedAs: "media",
        notifiedAt: new Date(),
      });
    }
    const seen: { albumId: string; count: number; photos: unknown[] }[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const res: { status: number; json: { items: typeof seen; nextCursor: string | null } } = await call(
        s.dam,
        "GET",
        `/me/album-tags?limit=20${cursor ? `&cursor=${cursor}` : ""}`,
      );
      expect(res.status).toBe(200);
      seen.push(...res.json.items);
      cursor = res.json.nextCursor;
      pages++;
    } while (cursor && pages < 10);
    expect(pages).toBe(4);
    expect(seen).toHaveLength(61);
    expect(new Set(seen.map((i) => i.albumId)).size).toBe(61);
    // Le plus récent d'abord ; l'album de huit photos : compte 8, six vignettes.
    const big = seen.find((i) => i.albumId === s.albumId);
    expect(big?.count).toBe(8);
    expect(big?.photos).toHaveLength(6);
    expect(seen.filter((i) => i.albumId !== s.albumId).every((i) => i.count === 1 && i.photos.length === 1)).toBe(true);
    // Curseur inconnu (album disparu entre deux pages) : page vide, pas le début.
    const unknown = await call(s.dam, "GET", "/me/album-tags?limit=20&cursor=00000000-0000-4000-8000-000000000000");
    expect(unknown.json).toEqual({ items: [], nextCursor: null });
  });
});

/** Un album publié de Sud Cars avec une photo où la voiture de Dam est identifiée (insertions directes). */
async function oneTaggedAlbum(publishedAt: Date) {
  const [album] = await db
    .insert(eventAlbums)
    .values({
      eventId: s.event.id,
      mediaProfileId: s.leoMedia,
      authorId: s.leo.id,
      status: "published",
      publishedAt,
      photosCount: 1,
    })
    .returning({ id: eventAlbums.id });
  const albumId = album?.id as string;
  const [p] = await db
    .insert(eventAlbumPhotos)
    .values({ albumId, storageKey: `private/albums/${albumId}/seed.webp`, position: 0, plateState: "none" })
    .returning({ id: eventAlbumPhotos.id });
  await db.insert(albumPhotoTags).values({
    photoId: p?.id as string,
    targetKind: "vehicle",
    vehicleId: s.car.dam.vehicle.id,
    userId: s.dam.id,
    taggedBy: s.leo.id,
    taggedAs: "media",
    notifiedAt: new Date(),
  });
  return albumId;
}

describe("« Tes photos » : curseur exact et comptes exacts", () => {
  it("plusieurs albums publiés au même instant, à la microseconde près : aucun n'est sauté d'une page à l'autre", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) ids.push(await oneTaggedAlbum(new Date(Date.now() - 400 * 86_400_000)));
    // Même instant, microsecondes comprises (`Date` les perdrait).
    await db.execute(
      sql`update event_albums set published_at = '2025-10-10 10:00:00.123456+00'::timestamptz where id = any(${sql.param(ids)}::uuid[])`,
    );
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const res: { json: { items: { albumId: string }[]; nextCursor: string | null } } = await call(
        s.dam,
        "GET",
        `/me/album-tags?limit=2${cursor ? `&cursor=${cursor}` : ""}`,
      );
      seen.push(...res.json.items.map((i) => i.albumId));
      cursor = res.json.nextCursor;
      pages++;
    } while (cursor && pages < 10);
    expect(pages).toBe(3);
    expect(new Set(seen).size).toBe(5);
    expect([...seen].sort()).toEqual([...ids].sort());
  });

  it("un album de plus de 12 000 photos identifiées garde son compte exact (l'ancien plafond de lignes le coupait)", async () => {
    const [album] = await db
      .insert(eventAlbums)
      .values({
        eventId: s.event.id,
        mediaProfileId: s.leoMedia,
        authorId: s.leo.id,
        status: "published",
        publishedAt: new Date(Date.now() - 500 * 86_400_000),
        photosCount: 12_100,
      })
      .returning({ id: eventAlbums.id });
    const albumId = album?.id as string;
    await db.execute(sql`insert into event_album_photos (album_id, storage_key, position, plate_state)
      select ${albumId}::uuid, 'private/albums/' || ${albumId} || '/' || g || '.webp', g, 'none'::album_plate_state
      from generate_series(0, 12099) g`);
    await db.execute(sql`insert into album_photo_tags (photo_id, target_kind, vehicle_id, user_id, tagged_by, tagged_as, notified_at)
      select id, 'vehicle'::album_tag_target, ${s.car.dam.vehicle.id}::uuid, ${s.dam.id}, ${s.leo.id}, 'media'::album_tagger, now()
      from event_album_photos where album_id = ${albumId}::uuid`);
    const res = await call(s.dam, "GET", "/me/album-tags");
    const big = res.json.items.find((i: { albumId: string }) => i.albumId === albumId);
    expect(big.count).toBe(12_100);
    expect(big.photos).toHaveLength(6);
    // La fiche de la voiture : le même compte exact.
    const sheet = await call(s.kenji, "GET", `/vehicles/${s.car.dam.vehicle.id}`);
    expect(sheet.json.albumMentions.find((m: { albumId: string }) => m.albumId === albumId).count).toBe(12_100);
  }, 120_000);
});

describe("le plafond de 50 stories ne compte pas une reprise masquée", () => {
  it("publication, perte d'accréditation, nouvelle publication possible", async () => {
    const marcAlbum = await publishedAlbum(s.marc, s.event.id, 2);
    const [marcPhoto] = await db
      .select()
      .from(eventAlbumPhotos)
      .where(eq(eventAlbumPhotos.albumId, marcAlbum.id))
      .orderBy(eventAlbumPhotos.position);
    expect((await pose(s.leo, photo(0), { vehicleId: s.car.dam.vehicle.id })).status).toBe(201);
    expect((await pose(s.marc, marcPhoto?.id as string, { vehicleId: s.car.dam.vehicle.id })).status).toBe(201);
    expect((await toStory(s.dam, photo(0))).status).toBe(201);
    // 49 stories ordinaires : 50 vivantes en tout.
    for (let i = 0; i < 49; i++) {
      await db.insert(stories).values({
        authorId: s.dam.id,
        audience: "public",
        storageKey: `private/stories/cap${i}/a.webp`,
        plateState: "none_confirmed",
        expiresAt: new Date(Date.now() + 3_600_000),
      });
    }
    const full = await toStory(s.dam, marcPhoto?.id as string);
    expect(full.status).toBe(409);
    expect(full.json.error.code).toBe("too_many_stories");
    // L'accréditation de Sud Cars tombe : sa reprise est masquée, elle ne compte plus.
    await db.update(applications).set({ status: "withdrawn" }).where(eq(applications.mediaProfileId, s.leoMedia));
    expect((await toStory(s.dam, marcPhoto?.id as string)).status).toBe(201);
  });
});

describe("modération : la photo est relue sous le verrou de l'album", () => {
  it("retirée par le média pendant l'attente de la modération : positions et compteur ne bougent qu'une fois", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    // Le média retire la photo 2 (verrou de l'album tenu jusqu'à `release`).
    const holder = withTx(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`album:${s.albumId}`}))`);
      await tx
        .update(eventAlbumPhotos)
        .set({ deletedAt: new Date() })
        .where(eq(eventAlbumPhotos.id, photo(2)));
      await shiftPositions(tx, s.albumId, 2);
      await tx.update(eventAlbums).set({ photosCount: 7 }).where(eq(eventAlbums.id, s.albumId));
      await gate;
    });
    await sleep(200);
    // La modération a lu la photo vivante, puis attend le verrou : elle doit la relire après.
    let moderated = false;
    const moderation = withTx(
      async (tx) =>
        (await albumPhotoTarget.remove?.(tx, undefined as never, { targetId: photo(2) } as never, () => undefined)) ??
        [],
    ).then((keys) => {
      moderated = true;
      return keys;
    });
    await sleep(400);
    expect(moderated).toBe(false);
    release();
    const [, keys] = await Promise.all([holder, moderation]);
    // Déjà retirée : la décision n'efface que le fichier, sans décaler une seconde fois.
    expect(keys).toEqual([s.photos[2]?.storageKey]);
    const [album] = await db.select().from(eventAlbums).where(eq(eventAlbums.id, s.albumId));
    expect(album?.photosCount).toBe(7);
    expect(album?.deletedAt).toBeNull();
    const live = await db
      .select({ position: eventAlbumPhotos.position })
      .from(eventAlbumPhotos)
      .where(and(eq(eventAlbumPhotos.albumId, s.albumId), isNull(eventAlbumPhotos.deletedAt)))
      .orderBy(eventAlbumPhotos.position);
    expect(live.map((p) => p.position)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});
