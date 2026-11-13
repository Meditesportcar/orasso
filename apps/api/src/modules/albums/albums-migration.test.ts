// Lot R9e : la reprise des galeries d'avant en albums (fin de la migration `event-albums`, écrite à la main). Nombres avant et après,
// clés réutilisées sur place et dans l'ordre, un seul album officiel par événement (la galerie la plus récemment mise en avant),
// galeries reprises marquées supprimées, liens intacts, rejouée sans aucun changement. Le test vérifie aussi que le SQL rejoué par
// le seed est bien celui du fichier de migration.
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createEvent, resetDb, useClock } from "../../../test/helpers";
import { db, pool } from "../../db/client";
import { eventAlbumPhotos, eventAlbums, mediaContents } from "../../db/schema";
import { mediaUser, organizerEvent, paris } from "./albums-test-helpers";
import { adoptLegacyGalleries, REPRISE_STATEMENTS } from "./reprise";

afterAll(async () => {
  await pool.end();
});

const migrationFile = () => {
  const dir = fileURLToPath(new URL("../../../drizzle/", import.meta.url));
  const name = readdirSync(dir).find((f) => /^\d{4}_event-albums\.sql$/.test(f));
  if (!name) throw new Error("Migration event-albums introuvable");
  return readFileSync(`${dir}${name}`, "utf8");
};

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

describe("le SQL de reprise est celui de la migration", () => {
  it("chaque instruction rejouée par le seed figure telle quelle dans le fichier de migration", () => {
    const file = squash(migrationFile());
    for (const statement of REPRISE_STATEMENTS) expect(file).toContain(squash(statement));
  });

  it("la migration crée les deux tables, les deux enums et les valeurs d'enum, sans modifier media_contents", () => {
    const file = migrationFile();
    expect(file).toContain('CREATE TABLE "event_albums"');
    expect(file).toContain('CREATE TABLE "event_album_photos"');
    expect(file).toContain("album_status");
    expect(file).toContain("album_plate_state");
    expect(file).toMatch(/ALTER TYPE "public"\."upload_purpose" ADD VALUE 'album_photo'/);
    expect(file).toMatch(/ALTER TYPE "public"\."report_target" ADD VALUE 'album_photo'/);
    expect(file).not.toMatch(/ALTER TABLE "media_contents"/);
    // Index de la trace de copie (`/api/files`) : sur `client_id`, partiel, photos retirées comprises.
    expect(file).toMatch(
      /CREATE INDEX "event_album_photos_client_trace_idx" ON "event_album_photos" USING btree \("client_id"\) WHERE .*"client_id" is not null/,
    );
  });
});

describe("reprise des galeries", () => {
  beforeEach(async () => {
    await resetDb();
    useClock(paris(11, 12, 12));
  });

  it("nombres avant et après, ordre, officiel unique par événement, liens intacts, rejouée sans changement", async () => {
    const { structure, event: a } = await organizerEvent();
    const b = await createEvent(structure.id, { slug: "nocturne", title: "Nocturne de Canet" });
    const { mediaId } = await mediaUser("Leo_Media");
    const other = await mediaUser("Marc_Photo", "Marc Photo");

    const gallery = async (
      event: string,
      media: string,
      title: string,
      photos: number,
      over: Partial<typeof mediaContents.$inferInsert> = {},
    ) =>
      (
        await db
          .insert(mediaContents)
          .values({
            mediaProfileId: media,
            eventId: event,
            kind: "gallery",
            title,
            photoKeys: Array.from({ length: photos }, (_, i) => `media-contents/${title}-${i}.webp`),
            views: 7,
            publishedAt: paris(11, 10, 9),
            ...over,
          })
          .returning()
      )[0] as typeof mediaContents.$inferSelect;

    const g1 = await gallery(a.id, mediaId, "g1", 4, { featuredAt: paris(11, 10, 12) });
    const g2 = await gallery(a.id, other.mediaId, "g2", 2, { featuredAt: paris(11, 11, 12) }); // la plus récemment mise en avant
    const g3 = await gallery(b.id, mediaId, "g3", 1);
    const g4 = await gallery(b.id, other.mediaId, "g4", 3, { deletedAt: paris(11, 11, 9) }); // déjà supprimée : pas reprise
    const l1 = await db
      .insert(mediaContents)
      .values({
        mediaProfileId: mediaId,
        eventId: a.id,
        kind: "link",
        title: "Un article",
        url: "https://sudcars.example/a",
        platform: "website",
        publishedAt: paris(11, 10, 9),
      })
      .returning();

    const totals = async () => {
      const r = await db.execute<{
        galleries: number;
        links: number;
        deleted: number;
        albums: number;
        photos: number;
      }>(sql`
        select
          (select count(*) from media_contents where kind = 'gallery' and deleted_at is null)::int as galleries,
          (select count(*) from media_contents where kind = 'link' and deleted_at is null)::int as links,
          (select count(*) from media_contents where kind = 'gallery' and deleted_at is not null)::int as deleted,
          (select count(*) from event_albums)::int as albums,
          (select count(*) from event_album_photos)::int as photos`);
      return r.rows[0] as { galleries: number; links: number; deleted: number; albums: number; photos: number };
    };

    const was = await totals();
    expect(was).toEqual({ galleries: 3, links: 1, deleted: 1, albums: 0, photos: 0 });
    const keysSum = g1.photoKeys.length + g2.photoKeys.length + g3.photoKeys.length;
    expect(keysSum).toBe(7);

    await adoptLegacyGalleries(db);

    const now = await totals();
    // Galeries non supprimées = albums repris ; photos = somme des clés ; liens intacts ; les galeries reprises sont marquées supprimées.
    expect(now).toEqual({
      galleries: 0,
      links: was.links,
      deleted: was.deleted + was.galleries,
      albums: was.galleries,
      photos: keysSum,
    });
    expect(l1[0]?.deletedAt).toBeNull();

    const albums = await db.select().from(eventAlbums);
    expect(albums.map((x) => x.id).sort()).toEqual([g1.id, g2.id, g3.id].sort());
    for (const album of albums) {
      expect(album).toMatchObject({ status: "published", allowSave: false, legacyMediaContentId: album.id, views: 7 });
      expect(album.publishedAt?.toISOString()).toBe(paris(11, 10, 9).toISOString());
    }
    const byId = new Map(albums.map((x) => [x.id, x]));
    expect(byId.get(g1.id)).toMatchObject({ title: "g1", photosCount: 4, officialAt: null });
    expect(byId.get(g2.id)?.officialAt?.toISOString()).toBe(paris(11, 11, 12).toISOString());
    expect(byId.get(g3.id)).toMatchObject({ photosCount: 1, officialAt: null });
    // Titulaire du profil média = auteur ; un seul officiel par événement.
    expect(albums.filter((x) => x.officialAt !== null && x.eventId === a.id)).toHaveLength(1);

    // Clés réutilisées sur place, dans l'ordre ; état « inconnu » ; dimensions inconnues.
    const photos = await db
      .select()
      .from(eventAlbumPhotos)
      .orderBy(eventAlbumPhotos.albumId, eventAlbumPhotos.position);
    const of = (id: string) => photos.filter((p) => p.albumId === id);
    expect(of(g1.id).map((p) => p.storageKey)).toEqual(g1.photoKeys);
    expect(of(g1.id).map((p) => p.position)).toEqual([0, 1, 2, 3]);
    expect(of(g2.id).map((p) => p.storageKey)).toEqual(g2.photoKeys);
    expect(
      photos.every((p) => p.plateState === "unknown" && p.plateRects === null && p.width === null && p.height === null),
    ).toBe(true);
    expect(of(g4.id)).toHaveLength(0);

    // Rejouée : plus rien ne bouge (lignes identiques).
    const snapshot = JSON.stringify({ albums, photos });
    expect(await adoptLegacyGalleries(db)).toBe(0);
    const albumsAgain = await db.select().from(eventAlbums);
    const photosAgain = await db
      .select()
      .from(eventAlbumPhotos)
      .orderBy(eventAlbumPhotos.albumId, eventAlbumPhotos.position);
    expect(JSON.stringify({ albums: albumsAgain, photos: photosAgain })).toBe(snapshot);
    expect(await totals()).toEqual(now);
  });

  it("photos_count est recalculé après l'insertion des photos (une clé en double n'est comptée qu'une fois)", async () => {
    const { event } = await organizerEvent();
    const { mediaId } = await mediaUser("Leo_Media");
    await db.insert(mediaContents).values({
      mediaProfileId: mediaId,
      eventId: event.id,
      kind: "gallery",
      title: "Doublon",
      photoKeys: ["media-contents/dup.webp", "media-contents/dup.webp", "media-contents/autre.webp"],
      publishedAt: paris(11, 10, 9),
    });
    await adoptLegacyGalleries(db);
    const [album] = await db.select().from(eventAlbums);
    expect(album?.photosCount).toBe(2);
    expect(await db.select().from(eventAlbumPhotos)).toHaveLength(2);
  });

  it("un album neuf déjà présent (reprise interrompue puis rejouée) n'est pas dupliqué", async () => {
    const { event } = await organizerEvent();
    const { mediaId } = await mediaUser("Leo_Media");
    const [g] = await db
      .insert(mediaContents)
      .values({
        mediaProfileId: mediaId,
        eventId: event.id,
        kind: "gallery",
        title: "g",
        photoKeys: ["media-contents/a.webp", "media-contents/b.webp"],
        publishedAt: paris(11, 10, 9),
      })
      .returning();
    // La première instruction seule (reprise interrompue avant les photos), puis la reprise complète.
    await db.execute(sql.raw(REPRISE_STATEMENTS[0] as string));
    expect(await db.select().from(eventAlbums)).toHaveLength(1);
    await adoptLegacyGalleries(db);
    expect(await db.select().from(eventAlbums)).toHaveLength(1);
    expect(await db.select().from(eventAlbumPhotos)).toHaveLength(2);
    expect(g?.id).toBeTruthy();
  });
});
