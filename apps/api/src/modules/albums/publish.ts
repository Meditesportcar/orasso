// Publication d'un album et purge des brouillons (lot R9e). Publier : au moins une photo, média encore accrédité, idempotent. Aucune
// notification en R9e (`album_published` est posé par R9a, émis par R9g aux responsables). Un brouillon jamais publié est purgé
// après 7 jours sans activité (tâche quotidienne `albums.draft-purge`) : l'album et ses fichiers disparaissent.
import { type AlbumView, albumIssue, albumLabels, draftPurgeBefore, isDraftExpired } from "@orasso/shared";
import { and, eq, inArray, isNull, lte } from "drizzle-orm";

import { db } from "../../db/client";
import { eventAlbumPhotos, eventAlbums } from "../../db/schema";
import { now } from "../../lib/deps";
import { AppError } from "../../lib/errors";
import { rateLimit } from "../../lib/rateLimit";
import type { Viewer } from "../../lib/session";
import { withTx } from "../../lib/tx";
import { assertAccredited, assertWritable, lockOwnAlbum, requireMedia } from "./guards";
import { albumsService, removeFiles } from "./service";

/** `POST /me/albums/:id/publish` : `status published`, `published_at`. Rejoué sur un album publié : rien ne bouge. */
export async function publishAlbum(v: Viewer, id: string): Promise<AlbumView> {
  assertWritable(v);
  rateLimit("mediaWrite", v.user.id);
  await withTx(async (tx) => {
    const profile = await requireMedia(tx, v);
    const album = await lockOwnAlbum(tx, id, profile.id);
    if (album.status === "published") return;
    if (albumIssue(album)) throw new AppError(400, "album_empty", albumLabels.emptyAlbum);
    await assertAccredited(tx, album.eventId, profile.id);
    await tx.update(eventAlbums).set({ status: "published", publishedAt: now() }).where(eq(eventAlbums.id, album.id));
  });
  return albumsService.getOwn(v, id);
}

const PURGE_BATCH = 100;

/** Tâche `albums.draft-purge` : les brouillons sans activité depuis 7 jours, fichiers compris. Rend le nombre d'albums effacés. */
export async function purgeDrafts(at: Date = now()): Promise<number> {
  const limit = draftPurgeBefore(at);
  let total = 0;
  for (;;) {
    const keys: string[] = [];
    const n = await withTx(async (tx) => {
      const old = await tx
        .select({ id: eventAlbums.id, updatedAt: eventAlbums.updatedAt })
        .from(eventAlbums)
        .where(and(eq(eventAlbums.status, "draft"), isNull(eventAlbums.deletedAt), lte(eventAlbums.updatedAt, limit)))
        .limit(PURGE_BATCH)
        .for("update", { skipLocked: true });
      // La règle commune : sans activité (`updated_at`, renouvelé à chaque ajout) depuis 7 jours.
      const expired = old.filter((a) => isDraftExpired(a.updatedAt, at));
      if (!expired.length) return 0;
      const ids = expired.map((a) => a.id);
      const photos = await tx
        .select({ key: eventAlbumPhotos.storageKey })
        .from(eventAlbumPhotos)
        .where(inArray(eventAlbumPhotos.albumId, ids));
      keys.push(...photos.map((p) => p.key));
      await tx.delete(eventAlbums).where(inArray(eventAlbums.id, ids));
      return ids.length;
    });
    await removeFiles(keys);
    total += n;
    if (n < PURGE_BATCH || n === 0) break;
  }
  return total;
}
