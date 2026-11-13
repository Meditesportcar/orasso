// Publication d'un album et purge des brouillons (lot R9e). Publier : au moins une photo, média encore accrédité, idempotent. Aucune
// notification en R9e (`album_published` est posé par R9a, émis par R9g aux responsables). Un brouillon jamais publié est purgé
// après 7 jours sans activité (tâche quotidienne `albums.draft-purge`) : l'album et ses fichiers disparaissent.
import {
  type AlbumView,
  albumIssue,
  albumLabels,
  albumTitle,
  draftPurgeBefore,
  eventPhotosLabels,
  isDraftExpired,
} from "@orasso/shared";
import { and, eq, inArray, isNull, lte } from "drizzle-orm";

import { db } from "../../db/client";
import { eventAlbumPhotos, eventAlbums, events } from "../../db/schema";
import { now } from "../../lib/deps";
import { AppError, notFound } from "../../lib/errors";
import { rateLimit } from "../../lib/rateLimit";
import type { Viewer } from "../../lib/session";
import { withTx } from "../../lib/tx";
import { notifyStructure } from "../notifications/structure";
import { assertAccredited, assertWritable, lockOwnAlbum, requireMedia } from "./guards";
import { albumsService, removeFiles } from "./service";
import { sendTaggedNotifications } from "./tags-notify";

/** `POST /me/albums/:id/publish` : `status published`, `published_at`. Rejoué sur un album publié : rien ne bouge. */
export async function publishAlbum(v: Viewer, id: string): Promise<AlbumView> {
  assertWritable(v);
  rateLimit("mediaWrite", v.user.id);
  await withTx(async (tx, after) => {
    const profile = await requireMedia(tx, v);
    const album = await lockOwnAlbum(tx, id, profile.id);
    if (album.status === "published") return;
    if (albumIssue(album)) throw new AppError(400, "album_empty", albumLabels.emptyAlbum);
    await assertAccredited(tx, album.eventId, profile.id);
    const done = await tx
      .update(eventAlbums)
      .set({ status: "published", publishedAt: now() })
      .where(and(eq(eventAlbums.id, album.id), eq(eventAlbums.status, "draft"), isNull(eventAlbums.deletedAt)))
      .returning({ id: eventAlbums.id });
    // Rien n'a été modifié (album retiré entre-temps) : on ne répond pas « publié ».
    if (!done.length) throw notFound(albumLabels.notFound);
    // Lot R9f (T40) : les identifications posées en brouillon sont annoncées maintenant, une notification par personne.
    await sendTaggedNotifications(tx, album.id, { after });
    // Lot R9g (T47) : les responsables de la structure de l'événement sont prévenus, une ligne chacun, dans l'Activité de la structure
    // (sans push : 150 voitures en 30 minutes, le journal suffit). Jamais l'auteur, même s'il est aussi responsable. Regroupées par événement.
    const [event] = await tx.select().from(events).where(eq(events.id, album.eventId));
    if (event) {
      await notifyStructure(
        tx,
        event.structureId,
        "album_published",
        {
          title: eventPhotosLabels.publishedTitle(profile.name, album.photosCount, event.title),
          body: "", // le titre dit tout : un corps identique s'afficherait deux fois
          data: {
            albumId: album.id,
            eventId: event.id,
            eventSlug: event.slug,
            albumTitle: albumTitle(album.title, event.title),
            screen: "event-photos",
            link: `/e/${event.slug}`,
          },
          eventId: event.id,
          eventStartsAt: event.startsAt,
          eventEndsAt: event.endsAt,
          groupKey: `album_published:${event.id}`,
          after,
        },
        { exclude: [v.user.id] },
      );
    }
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
