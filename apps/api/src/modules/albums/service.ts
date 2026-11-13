// Albums des médias rattachés à un événement (vague R9, lot R9e, ARCHITECTURE-R8 § 1.10 et § 2.9). Un album est publié par un média
// accrédité (`accepted`) à l'événement. T31 : un **brouillon** d'abord (`POST /me/albums`), puis une photo à la fois
// (`POST /me/albums/:id/photos`, `photos.ts`) et la publication (`publish.ts`) : un album de 200 photos ne peut pas consommer d'un coup
// le plafond d'envois en attente (40 par personne). Ses photos ne deviennent jamais des publications.
import {
  type AlbumCreate,
  type AlbumPatch,
  type AlbumsList,
  type AlbumsListQuery,
  type AlbumsMineQuery,
  type AlbumView,
  albumLabels,
} from "@orasso/shared";
import { and, desc, eq, isNull, ne, type SQL, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { eventAlbumPhotos, eventAlbums, events, mediaProfiles } from "../../db/schema";
import { now } from "../../lib/deps";
import { conflict, notFound } from "../../lib/errors";
import { rateLimit } from "../../lib/rateLimit";
import type { Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";
import { type Tx, withTx } from "../../lib/tx";
import { assertAccredited, assertWritable, isUniqueViolation, lockOwnAlbum, mediaOfUser, requireMedia } from "./guards";
import { type AlbumJoin, albumBase, albumPhotos, albumVisibleSql, loadAlbum, photoView, summariesOf } from "./view";

/** L'album ouvert : le résumé et toutes ses photos. */
export async function albumViewOf(join: AlbumJoin, viewerId: string | null): Promise<AlbumView> {
  const [summary] = await summariesOf(db, [join], viewerId);
  if (!summary) throw notFound(albumLabels.notFound);
  const photos = await albumPhotos(db, join.a.id);
  return { ...summary, photos: photos.map((p) => photoView(join.a.id, p)) };
}

/** Les fichiers à effacer après la validation de la transaction (jamais avant : un retour en arrière les laisserait orphelins de leur ligne). */
export async function removeFiles(keys: readonly string[]): Promise<void> {
  for (const key of keys) await storage.remove(key).catch(() => undefined);
}

export const albumsService = {
  /**
   * `POST /me/albums` : un brouillon pour un événement où le média est accrédité. Un brouillon existant pour le même événement est
   * rendu tel quel (un par événement et par média) ; `clientId` rejoue une création sans doublon.
   */
  async create(v: Viewer, input: AlbumCreate): Promise<{ album: AlbumView; created: boolean }> {
    assertWritable(v);
    rateLimit("mediaWrite", v.user.id);
    const run = () =>
      withTx(async (tx) => {
        const profile = await requireMedia(tx, v);
        if (input.clientId) {
          const [again] = await tx
            .select({ id: eventAlbums.id })
            .from(eventAlbums)
            .where(and(eq(eventAlbums.mediaProfileId, profile.id), eq(eventAlbums.clientId, input.clientId)));
          if (again) return { id: again.id, created: false };
        }
        const [event] = await tx.select().from(events).where(eq(events.id, input.eventId));
        // Brouillon, annulé, inconnu : on ne dit pas lequel (un brouillon d'événement n'est pas public).
        if (!event || event.status !== "published") throw notFound(albumLabels.eventNotFound);
        await assertAccredited(tx, event.id, profile.id);
        const [draft] = await tx
          .select({ id: eventAlbums.id })
          .from(eventAlbums)
          .where(
            and(
              eq(eventAlbums.eventId, event.id),
              eq(eventAlbums.mediaProfileId, profile.id),
              eq(eventAlbums.status, "draft"),
              isNull(eventAlbums.deletedAt),
            ),
          );
        if (draft) return { id: draft.id, created: false };
        const [row] = await tx
          .insert(eventAlbums)
          .values({
            eventId: event.id,
            mediaProfileId: profile.id,
            authorId: v.user.id,
            title: input.title,
            allowSave: input.allowSave ?? false,
            clientId: input.clientId ?? null,
          })
          .returning({ id: eventAlbums.id });
        if (!row) throw new Error("Album non enregistré");
        return { id: row.id, created: true };
      });
    let res: { id: string; created: boolean };
    try {
      res = await run();
    } catch (error) {
      // Deux créations simultanées du même brouillon : la seconde retrouve la première.
      if (!isUniqueViolation(error)) throw error;
      res = await run();
    }
    return { album: await this.getOwn(v, res.id), created: res.created };
  },

  /** Un album du média (le sien, brouillon compris). */
  async getOwn(v: Viewer, id: string): Promise<AlbumView> {
    const join = await loadAlbum(db, id, v.user.id, now());
    if (!join) throw notFound(albumLabels.notFound);
    return albumViewOf(join, v.user.id);
  },

  /** `GET /albums/:id` : tout membre connecté voit un album publié visible ; le média voit aussi ses brouillons. */
  async get(v: Viewer, id: string): Promise<AlbumView> {
    const join = await loadAlbum(db, id, v.user.id, now());
    if (!join) throw notFound(albumLabels.notFound);
    return albumViewOf(join, v.user.id);
  },

  /** `PATCH /me/albums/:id { title?, allowSave? }` : le titre (vide = le titre par défaut) et l'option « Enregistrer ». */
  async patch(v: Viewer, id: string, input: AlbumPatch): Promise<AlbumView> {
    assertWritable(v);
    rateLimit("mediaWrite", v.user.id);
    await withTx(async (tx) => {
      const profile = await requireMedia(tx, v);
      const album = await lockOwnAlbum(tx, id, profile.id);
      await assertAccredited(tx, album.eventId, profile.id);
      await tx
        .update(eventAlbums)
        .set({
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.allowSave !== undefined ? { allowSave: input.allowSave } : {}),
        })
        .where(eq(eventAlbums.id, id));
    });
    return this.getOwn(v, id);
  },

  /**
   * `DELETE /me/albums/:id` : suppression douce ; les photos sont retirées, leurs fichiers effacés après la validation (comme
   * `purgeStoryFiles`). L'album perd son rang d'officiel (un autre pourra l'être). Les identifications partent en cascade (R9f).
   */
  async remove(v: Viewer, id: string): Promise<void> {
    assertWritable(v);
    const keys = await withTx(async (tx) => {
      const profile = await requireMedia(tx, v);
      const album = await lockOwnAlbum(tx, id, profile.id);
      const photos = await tx
        .update(eventAlbumPhotos)
        .set({ deletedAt: now() })
        .where(and(eq(eventAlbumPhotos.albumId, album.id), isNull(eventAlbumPhotos.deletedAt)))
        .returning({ key: eventAlbumPhotos.storageKey });
      await tx
        .update(eventAlbums)
        .set({ deletedAt: now(), officialAt: null, photosCount: 0 })
        .where(eq(eventAlbums.id, album.id));
      return photos.map((p) => p.key);
    });
    await removeFiles(keys);
  },

  /** `DELETE /me/albums/:id/photos/:photoId` : retire une photo et repositionne les suivantes. */
  async removePhoto(v: Viewer, id: string, photoId: string): Promise<void> {
    assertWritable(v);
    const key = await withTx(async (tx) => {
      const profile = await requireMedia(tx, v);
      const album = await lockOwnAlbum(tx, id, profile.id);
      const [photo] = await tx
        .select()
        .from(eventAlbumPhotos)
        .where(
          and(
            eq(eventAlbumPhotos.id, photoId),
            eq(eventAlbumPhotos.albumId, album.id),
            isNull(eventAlbumPhotos.deletedAt),
          ),
        );
      if (!photo) throw notFound(albumLabels.photoNotFound);
      // Un album publié garde au moins une photo : pour tout retirer, on supprime l'album.
      if (album.status === "published" && album.photosCount <= 1) {
        throw conflict("album_empty", albumLabels.emptyAlbum);
      }
      await tx.update(eventAlbumPhotos).set({ deletedAt: now() }).where(eq(eventAlbumPhotos.id, photo.id));
      await shiftPositions(tx, album.id, photo.position);
      await tx
        .update(eventAlbums)
        .set({ photosCount: sql`greatest(${eventAlbums.photosCount} - 1, 0)` })
        .where(eq(eventAlbums.id, album.id));
      return photo.storageKey;
    });
    await removeFiles([key]);
  },

  // --- Listes ---------------------------------------------------------------------------------------------------------

  /** `GET /me/albums?status=` : les miens, brouillons compris. */
  async mine(v: Viewer, q: AlbumsMineQuery): Promise<AlbumsList> {
    const profile = await mediaOfUser(db, v.user.id);
    if (!profile) return { items: [], nextCursor: null };
    const rows = await albumBase()
      .where(
        and(
          eq(eventAlbums.mediaProfileId, profile.id),
          isNull(eventAlbums.deletedAt),
          q.status ? eq(eventAlbums.status, q.status) : undefined,
        ),
      )
      .orderBy(sql`coalesce(${eventAlbums.publishedAt}, ${eventAlbums.createdAt}) desc`, desc(eventAlbums.id))
      .limit(200);
    return { items: await summariesOf(db, rows, v.user.id), nextCursor: null };
  },

  /** `GET /media/:id/albums?cursor=` : les albums publiés d'une page de média, du plus récent au plus ancien. */
  async forMedia(v: Viewer, mediaId: string, q: AlbumsListQuery): Promise<AlbumsList> {
    const [media] = await db.select().from(mediaProfiles).where(eq(mediaProfiles.id, mediaId));
    if (!media || media.deletedAt) throw notFound("Média introuvable");
    const cursorRow = q.cursor ? await cursorOf(q.cursor) : null;
    const rows = await albumBase()
      .where(
        and(
          eq(eventAlbums.mediaProfileId, mediaId),
          albumVisibleSql(now()),
          cursorRow
            ? sql`(${eventAlbums.publishedAt}, ${eventAlbums.id}) < (${cursorRow.publishedAt.toISOString()}::timestamptz, ${cursorRow.id}::uuid)`
            : undefined,
        ),
      )
      .orderBy(desc(eventAlbums.publishedAt), desc(eventAlbums.id))
      .limit(q.limit + 1);
    const page = rows.slice(0, q.limit);
    return {
      items: await summariesOf(db, page, v.user.id),
      nextCursor: rows.length > q.limit ? (page.at(-1)?.a.id ?? null) : null,
    };
  },

  /** `GET /events/:id/albums` et `/events/by-slug/:slug/albums` : publiés, l'officiel en tête puis du plus récent. */
  async forEvent(v: Viewer, ref: { id: string } | { slug: string }): Promise<AlbumsList> {
    const [event] = await db
      .select()
      .from(events)
      .where("id" in ref ? eq(events.id, ref.id) : eq(events.slug, ref.slug));
    if (!event || event.status === "draft" || event.admission === "invite_only") {
      throw notFound(albumLabels.eventNotFound);
    }
    const rows = await albumBase()
      .where(and(eq(eventAlbums.eventId, event.id), albumVisibleSql(now())))
      .orderBy(sql`(${eventAlbums.officialAt} is not null) desc`, desc(eventAlbums.publishedAt), desc(eventAlbums.id))
      .limit(100);
    return { items: await summariesOf(db, rows, v.user.id), nextCursor: null };
  },

  /** `GET /media/:id` : combien d'albums publiés et de photos (une requête). */
  async countsForMedia(mediaId: string): Promise<{ albumsCount: number; photosCount: number }> {
    const res = await db.execute<{ albums: number; photos: number }>(sql`
      select count(*)::int as albums, coalesce(sum(${eventAlbums.photosCount}), 0)::int as photos
      from ${eventAlbums}
      join ${events} on ${events.id} = ${eventAlbums.eventId}
      join ${mediaProfiles} on ${mediaProfiles.id} = ${eventAlbums.mediaProfileId}
      where ${eventAlbums.mediaProfileId} = ${mediaId} and ${albumVisibleSql(now())}`);
    const row = res.rows[0];
    return { albumsCount: row?.albums ?? 0, photosCount: row?.photos ?? 0 };
  },
};

/** Après le retrait d'une photo, les suivantes remontent d'un rang (deux passes : l'index d'unicité est contrôlé ligne à ligne). */
export async function shiftPositions(tx: Tx, albumId: string, removedPosition: number): Promise<void> {
  const below = and(
    eq(eventAlbumPhotos.albumId, albumId),
    isNull(eventAlbumPhotos.deletedAt),
    sql`${eventAlbumPhotos.position} > ${removedPosition}`,
  ) as SQL;
  await tx
    .update(eventAlbumPhotos)
    .set({ position: sql`-${eventAlbumPhotos.position}` })
    .where(below);
  await tx
    .update(eventAlbumPhotos)
    .set({ position: sql`-${eventAlbumPhotos.position} - 1` })
    .where(and(eq(eventAlbumPhotos.albumId, albumId), sql`${eventAlbumPhotos.position} < 0`) as SQL);
}

async function cursorOf(id: string): Promise<{ id: string; publishedAt: Date } | null> {
  const [row] = await db
    .select({ id: eventAlbums.id, publishedAt: eventAlbums.publishedAt })
    .from(eventAlbums)
    .where(and(eq(eventAlbums.id, id), ne(eventAlbums.status, "draft")));
  return row?.publishedAt ? { id: row.id, publishedAt: row.publishedAt } : null;
}
