// Reprise d'une photo d'album dans le journal de l'événement (lot R9g, T44 et T45). L'organisateur (la structure de l'événement, second
// facteur) reprend une photo d'un album **publié et visible** de l'événement : le serveur écrit une publication de la structure avec cette
// seule photo, **copiée** sous `private/feed/<postId>/…` (la photo reste à l'album, la copie est à l'organisateur) et le **crédit du média**
// (`credit_media_id`) avec sa source (`source_album_photo_id`). Une publication ordinaire pour le reste (quota, épingle, commentaires, Fil,
// mentions, suppression par l'organisateur). Le crédit ne se retire pas (aucune route ne le modifie) ; supprimer la publication libère la photo.
import { randomUUID } from "node:crypto";
import {
  type AlbumRepost,
  type FeedAspect,
  type FeedPostView,
  eventPhotosLabels as L,
  type PlateRect,
  publicationErrors,
  repostCaptionDefault,
} from "@orasso/shared";
import { and, eq, isNull, sql } from "drizzle-orm";
import sharp from "sharp";

import { db } from "../../db/client";
import { eventAlbumPhotos, eventAlbums, events, feedPostPhotos } from "../../db/schema";
import { requireAuthorship } from "../../lib/authorship";
import { now } from "../../lib/deps";
import { AppError, notFound } from "../../lib/errors";
import { rateLimit } from "../../lib/rateLimit";
import type { Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";
import { type Executor, withTx } from "../../lib/tx";
import { attachEventsByIds, deducePostRole, notAttachable } from "../feed/attach";
import { pageDepartment } from "../feed/authors";
import { materializeMentions } from "../feed/mentions";
import { loadPostViews } from "../feed/posts";
import { insertPostWithPhotos, storePostPhoto } from "../feed/publish";
import { removeOrRetry } from "../vehicles/photos-blur";
import { isUniqueViolation } from "./guards";
import { albumBase, albumVisibleSql } from "./view";

/** L'aspect du Fil le plus proche de la photo (la carte la montre dans ce cadre). */
export function nearestAspect(width: number, height: number): FeedAspect {
  const r = width / height;
  const ratios: [FeedAspect, number][] = [
    ["portrait_4_5", 0.8],
    ["square", 1],
    ["landscape", 1.25],
  ];
  let best: FeedAspect = "portrait_4_5";
  let gap = Number.POSITIVE_INFINITY;
  for (const [aspect, ratio] of ratios) {
    const d = Math.abs(r - ratio);
    if (d < gap) {
      gap = d;
      best = aspect;
    }
  }
  return best;
}

const alreadyError = () => new AppError(409, "already_reposted", L.errors.alreadyReposted);

/** Cette photo d'album a-t-elle déjà une reprise (publication non supprimée : les photos d'une publication supprimée sont effacées) ? */
async function isReposted(ex: Executor, photoId: string): Promise<boolean> {
  const [row] = await ex
    .select({ id: feedPostPhotos.id })
    .from(feedPostPhotos)
    .where(eq(feedPostPhotos.sourceAlbumPhotoId, photoId));
  return Boolean(row);
}

export const albumRepost = {
  /** `POST /events/:id/albums/:albumId/photos/:photoId/repost` → la publication du journal (201). */
  async repost(
    v: Viewer,
    ids: { eventId: string; albumId: string; photoId: string },
    input: AlbumRepost,
  ): Promise<FeedPostView> {
    const eventId = ids.eventId.toLowerCase();
    const albumId = ids.albumId.toLowerCase();
    const photoId = ids.photoId.toLowerCase();
    const userId = v.user.id;
    // 1. L'événement, puis les droits : sa structure, avec le second facteur. Une autre structure, le staff ou un média : 403, sans rien
    //    révéler de l'album.
    const [event] = await db.select().from(events).where(eq(events.id, eventId));
    if (!event) throw notFound(L.errors.albumNotFound);
    const authorship = await requireAuthorship(v, { persona: "organizer", structureId: event.structureId });
    rateLimit("feedPost", userId);
    // 2. L'album (publié, visible de tous : média accrédité, événement publié) et la photo (dans cet album, non retirée).
    const [found] = await albumBase().where(
      and(eq(eventAlbums.id, albumId), eq(eventAlbums.eventId, eventId), albumVisibleSql(now())),
    );
    if (!found) throw notFound(L.errors.albumNotFound);
    const [photo] = await db
      .select()
      .from(eventAlbumPhotos)
      .where(
        and(
          eq(eventAlbumPhotos.id, photoId),
          eq(eventAlbumPhotos.albumId, albumId),
          isNull(eventAlbumPhotos.deletedAt),
        ),
      );
    if (!photo) throw notFound(L.errors.photoNotFound);
    // 3. La plaque : la décision du média est gardée. `unknown` (ancienne galerie) : on ne sait pas, donc on ne reprend pas.
    if (photo.plateState === "unknown") throw new AppError(409, "plate_unknown", L.errors.plateUnknown);
    if (await isReposted(db, photoId)) throw alreadyError();
    // 4. Le rattachement : le rôle `organizer` est déduit des droits, jamais reçu.
    const at = now();
    const attach = (await attachEventsByIds(db, [eventId])).get(eventId);
    const eventRole = attach
      ? await deducePostRole(db, { userId, persona: "organizer", pageId: authorship.id, event: attach }, at)
      : null;
    if (!attach || eventRole !== "organizer") throw notAttachable(publicationErrors.event_not_attachable);
    const department = (await pageDepartment(db, authorship)) ?? attach.department ?? "";
    // 5. Le fichier : lu à l'album, flouté si le média l'a gardé tel quel (`kept` : la copie est floutée avec ses cadres), copié sous la
    //    clé de la publication, hors transaction.
    const source = await storage.get(photo.storageKey);
    if (!source) throw notFound(L.errors.photoNotFound);
    const dims =
      photo.width && photo.height
        ? { width: photo.width, height: photo.height }
        : await sharp(source)
            .metadata()
            .then((m) => ({ width: m.width ?? 1, height: m.height ?? 1 }));
    const rects = photo.plateState === "kept" ? ((photo.plateRects ?? []) as PlateRect[]) : [];
    const postId = randomUUID();
    const stored = await storePostPhoto(postId, source, rects, dims);
    // `blurred` : le média avait déjà flouté (copie telle quelle, plaque floutée) ; `none` : « aucune plaque » confirmée ; `kept` : la
    // copie vient d'être floutée avec les cadres (`storePostPhoto`).
    const row = {
      ...stored,
      blurred: photo.plateState === "blurred" ? true : stored.blurred,
      confirmed: photo.plateState === "none" ? true : stored.confirmed,
      creditMediaId: found.a.mediaProfileId,
      sourceAlbumPhotoId: photo.id,
    };
    const caption = input.caption ?? repostCaptionDefault(found.m.name);
    try {
      await withTx(async (tx, after) => {
        // Deux reprises simultanées de la même photo : la seconde attend le verrou, puis voit la première.
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`album-repost:${photoId}`}))`);
        if (await isReposted(tx, photoId)) throw alreadyError();
        await insertPostWithPhotos(
          tx,
          {
            id: postId,
            authorId: userId,
            caption,
            vehicleId: null,
            eventId,
            aspect: nearestAspect(row.width, row.height),
            department,
            clientId: null,
            commercialPartnerId: null,
            persona: "organizer",
            structureId: authorship.id,
            proId: null,
            providerId: null,
            mediaId: null,
            eventRole,
            placeLabel: null,
            importantReason: null,
          },
          [row],
        );
        await materializeMentions(tx, postId, { notify: true, after });
      });
    } catch (error) {
      await removeOrRetry(stored.key);
      if (error instanceof AppError) throw error;
      if (isUniqueViolation(error)) throw alreadyError();
      throw error;
    }
    const [view] = await loadPostViews(db, [postId], userId, now());
    if (!view) throw notFound("Publication introuvable");
    return view;
  },
};
