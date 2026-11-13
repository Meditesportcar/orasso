// Poser et retirer une identification sur une photo d'album (lot R9f, T41, ARCHITECTURE-R8 § 5 « Albums et identifications »).
//
// - Poser : le média auteur (`media`), l'organisateur (`organizer`, second facteur) et l'intéressé pour lui-même (`owner`). Les
//   droits sont ceux de la **personne** (`requireAuthorship`), jamais l'en-tête acteur. Une cible hors de l'ensemble identifiable
//   (`taggable.ts`) : 404, sans dire pourquoi. Une identification active : 200, rien ne change. Une identification **retirée par
//   l'intéressé** (`not_mine`, `withdraw`) : 409 `tag_declined` pour tout autre, réactivée s'il la repose lui-même (invariant :
//   personne ne repose l'identification qu'une personne a retirée). Retirée par celui qui l'avait posée (`tagger`) : reposable.
// - Retirer, côté intéressé : `DELETE /me/album-tags/:id` (« Ce n'est pas ma voiture » si un autre l'avait posée, « Retirer mon
//   identification » si c'est lui) ; `not_mine` prévient celui qui a posé. Côté poseur : `DELETE /album-photos/:id/tags/:tagId`,
//   tant que l'intéressé ne l'a pas retirée. La ligne reste en base (`removed_at`, `removed_by`, `removed_reason`).
// - Une story reprise d'une photo (« En story ») tombe quand son auteur n'est plus identifié sur la photo.
import {
  type AlbumTagCreate,
  type AlbumTagRemove,
  type AlbumTagView,
  albumTagLabels,
  canTagAlbum,
  declinedByInterested,
  removalNotifies,
  type TagRole,
  tagRemovalKind,
} from "@orasso/shared";
import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { albumPhotoTags, eventAlbumPhotos } from "../../db/schema";
import { now } from "../../lib/deps";
import { AppError, notFound, validation } from "../../lib/errors";
import { rateLimit } from "../../lib/rateLimit";
import type { Viewer } from "../../lib/session";
import { type Tx, withTx } from "../../lib/tx";
import { purgeStoryFiles } from "../stories/expire";
import { dropStoriesOfAlbumPhotos } from "../stories/share";
import { assertAccredited, assertWritable, isUniqueViolation } from "./guards";
import {
  actorOf,
  hasActiveTagOnPhoto,
  roleOf,
  type TagRow,
  tagsByPhoto,
  tagsOfPhoto,
  visibleAlbum,
} from "./tag-visibility";
import { eligibleVehicles, isPersonTaggable } from "./taggable";
import { loadAlbumRaw, notifyDeclined, sendTaggedNotifications } from "./tags-notify";
import type { AlbumJoin } from "./view";

/** Le même verrou que les écritures de l'album (ajout, retrait, publication) : une pose et une publication ne se croisent pas. */
const lockAlbum = (tx: Tx, albumId: string) =>
  tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`album:${albumId.toLowerCase()}`}))`);

const declined = () => new AppError(409, "tag_declined", albumTagLabels.errors.tagDeclined);

/** La photo (non retirée) et son album, 404 sinon. */
async function photoOf(tx: Tx | typeof db, photoId: string) {
  const [photo] = await tx
    .select()
    .from(eventAlbumPhotos)
    .where(and(eq(eventAlbumPhotos.id, photoId), isNull(eventAlbumPhotos.deletedAt)));
  if (!photo) throw notFound(albumTagLabels.errors.photoNotFound);
  return photo;
}

type Target = { kind: "vehicle" | "user"; vehicleId: string | null; userId: string };

/** La cible, **dans l'ensemble identifiable** de l'événement et permise à ce rôle ; 404 sinon, sans dire pourquoi. */
async function resolveTarget(
  tx: Tx,
  join: AlbumJoin,
  v: Viewer,
  role: TagRole,
  input: AlbumTagCreate,
): Promise<Target> {
  if ("vehicleId" in input) {
    const { rows } = await eligibleVehicles(tx, join.e.id, v.user.id, {
      vehicleId: input.vehicleId.toLowerCase(),
      ownerId: role === "owner" ? v.user.id : undefined,
    });
    const car = rows[0];
    if (!car || !canTagAlbum(role, v.user.id, { ownerId: car.ownerId }))
      throw notFound(albumTagLabels.errors.notTaggable);
    return { kind: "vehicle", vehicleId: car.vehicleId, userId: car.ownerId };
  }
  if (
    !canTagAlbum(role, v.user.id, { ownerId: input.userId }) ||
    !(await isPersonTaggable(tx, join.e.id, input.userId))
  ) {
    throw notFound(albumTagLabels.errors.notTaggable);
  }
  return { kind: "user", vehicleId: null, userId: input.userId };
}

/** La ligne existante pour cette cible sur cette photo (voiture : la même voiture ; personne : la même personne). */
const existingOf = (rows: readonly TagRow[], t: Target): TagRow | undefined =>
  rows.find((r) =>
    t.kind === "vehicle" ? r.vehicleId === t.vehicleId : r.targetKind === "user" && r.userId === t.userId,
  );

export const albumTagsService = {
  /** `POST /album-photos/:id/tags { vehicleId } | { userId }`. `created` faux : déjà identifiée (idempotent) ou réactivée par l'intéressé. */
  async pose(v: Viewer, photoId: string, input: AlbumTagCreate): Promise<{ tag: AlbumTagView; created: boolean }> {
    assertWritable(v);
    rateLimit("albumTag", v.user.id);
    const run = () =>
      withTx(async (tx, after) => {
        const photo = await photoOf(tx, photoId.toLowerCase());
        await lockAlbum(tx, photo.albumId);
        const join = await visibleAlbum(tx, v, photo.albumId);
        const at = now();
        const actor = await actorOf(tx, v, join);
        const role = await roleOf(tx, v, join, actor);
        // Le média identifie tant qu'il est accrédité (il garde la main pour lire et retirer, pas pour compléter).
        if (role === "media") await assertAccredited(tx, join.e.id, join.a.mediaProfileId);
        const target = await resolveTarget(tx, join, v, role, input);
        const mine = target.userId === v.user.id;
        const rows = await tagsOfPhoto(tx, photo.id);
        const found = existingOf(rows, target);
        if (found && !found.removedAt) return { id: found.id, created: false, join, photoId: photo.id };
        // L'invariant : une identification retirée par l'intéressé (sur cette photo, voiture ou pseudo) n'est pas reposée par un autre.
        if (!mine && rows.some((r) => r.userId === target.userId && declinedByInterested(r.removedReason)))
          throw declined();
        let id: string;
        if (found) {
          // Retirée par son poseur (`tagger`), ou par l'intéressé lui-même qui la repose : réactivée.
          await tx
            .update(albumPhotoTags)
            .set({
              removedAt: null,
              removedBy: null,
              removedReason: null,
              taggedBy: v.user.id,
              taggedAs: role,
              ...(mine ? { notifiedAt: at } : {}),
              updatedAt: at,
            })
            .where(eq(albumPhotoTags.id, found.id));
          id = found.id;
        } else {
          const [row] = await tx
            .insert(albumPhotoTags)
            .values({
              photoId: photo.id,
              targetKind: target.kind,
              vehicleId: target.vehicleId,
              userId: target.userId,
              taggedBy: v.user.id,
              taggedAs: role,
              // Moi sur ma voiture ou mon pseudo : jamais de notification.
              notifiedAt: mine ? at : null,
            })
            .returning({ id: albumPhotoTags.id });
          if (!row) throw new Error("Identification non enregistrée");
          id = row.id;
        }
        // Un album publié prévient tout de suite ; un brouillon, à la publication. Jamais soi-même.
        if (!mine) await sendTaggedNotifications(tx, join.a.id, { userIds: [target.userId], after });
        return { id, created: true, join, photoId: photo.id };
      });
    let done: Awaited<ReturnType<typeof run>>;
    try {
      done = await run();
    } catch (error) {
      // Deux poses simultanées de la même cible : la seconde retrouve la première (idempotent).
      if (!isUniqueViolation(error)) throw error;
      done = await run();
    }
    const views = await tagsByPhoto(db, done.join, [done.photoId], v);
    const tag = views.get(done.photoId)?.find((t) => t.id === done.id);
    if (!tag) throw notFound(albumTagLabels.errors.tagNotFound);
    return { tag, created: done.created };
  },

  /**
   * `DELETE /me/album-tags/:id` : l'intéressé retire son identification, à tout moment. Le motif vient de qui l'avait posée
   * (`not_mine` si un autre, `withdraw` si c'est lui) ; un motif envoyé qui ne correspond pas est refusé. Rejoué : rien ne bouge.
   */
  async removeByInterested(v: Viewer, tagId: string, input: AlbumTagRemove): Promise<void> {
    rateLimit("albumTag", v.user.id);
    const ids = await withTx(async (tx, after) => {
      const [mineTag] = await tx
        .select()
        .from(albumPhotoTags)
        .where(and(eq(albumPhotoTags.id, tagId.toLowerCase()), eq(albumPhotoTags.userId, v.user.id)));
      // L'identification d'un autre : 404, comme une identification qui n'existe pas.
      if (!mineTag) throw notFound(albumTagLabels.errors.tagNotFound);
      const photo = await tx.select().from(eventAlbumPhotos).where(eq(eventAlbumPhotos.id, mineTag.photoId));
      const albumId = photo[0]?.albumId;
      if (!albumId) throw notFound(albumTagLabels.errors.tagNotFound);
      await lockAlbum(tx, albumId);
      const [tag] = await tx.select().from(albumPhotoTags).where(eq(albumPhotoTags.id, mineTag.id)).for("update");
      if (!tag || tag.removedAt) return [] as string[];
      const reason = tagRemovalKind(
        { userId: tag.userId, taggedBy: tag.taggedBy, taggedAs: tag.taggedAs },
        { id: v.user.id, isMediaAuthor: false, isOrganizer: false },
      );
      if (reason !== "not_mine" && reason !== "withdraw") throw notFound(albumTagLabels.errors.tagNotFound);
      if (input.reason && input.reason !== reason) throw validation(albumTagLabels.errors.reasonMismatch);
      await tx
        .update(albumPhotoTags)
        .set({ removedAt: now(), removedBy: v.user.id, removedReason: reason, updatedAt: now() })
        .where(eq(albumPhotoTags.id, tag.id));
      const dropped = await dropStoryIfNoTag(tx, tag.photoId, tag.userId);
      if (removalNotifies(reason)) {
        const row = await loadAlbumRaw(tx, albumId);
        if (row) {
          await notifyDeclined(
            tx,
            row,
            { taggedAs: tag.taggedAs, kind: tag.targetKind, userId: tag.userId, photoId: tag.photoId },
            after,
          );
        }
      }
      return dropped;
    });
    if (ids.length) await purgeStoryFiles(ids).catch(() => undefined);
  },

  /**
   * `DELETE /album-photos/:id/tags/:tagId` : celui qui a posé l'identification en tant que média ou organisateur la retire
   * (erreur de voiture), tant que l'intéressé ne l'a pas retirée ; elle reste reposable.
   */
  async removeByTagger(v: Viewer, photoId: string, tagId: string): Promise<void> {
    assertWritable(v);
    rateLimit("albumTag", v.user.id);
    const ids = await withTx(async (tx) => {
      const photo = await photoOf(tx, photoId.toLowerCase());
      await lockAlbum(tx, photo.albumId);
      const join = await visibleAlbum(tx, v, photo.albumId);
      const actor = await actorOf(tx, v, join);
      // Les droits d'un organisateur passent par `requireAuthorship` (second facteur), ceux du média par son profil.
      if (!actor.isMediaAuthor) await roleOf(tx, v, join, actor);
      const [tag] = await tx
        .select()
        .from(albumPhotoTags)
        .where(and(eq(albumPhotoTags.id, tagId.toLowerCase()), eq(albumPhotoTags.photoId, photo.id)))
        .for("update");
      if (!tag || tag.removedAt) throw notFound(albumTagLabels.errors.tagNotFound);
      const kind = tagRemovalKind(
        { userId: tag.userId, taggedBy: tag.taggedBy, taggedAs: tag.taggedAs },
        { id: v.user.id, isMediaAuthor: actor.isMediaAuthor, isOrganizer: actor.isManager },
      );
      if (kind !== "tagger") throw notFound(albumTagLabels.errors.tagNotFound);
      await tx
        .update(albumPhotoTags)
        .set({ removedAt: now(), removedBy: v.user.id, removedReason: "tagger", updatedAt: now() })
        .where(eq(albumPhotoTags.id, tag.id));
      return dropStoryIfNoTag(tx, photo.id, tag.userId);
    });
    if (ids.length) await purgeStoryFiles(ids).catch(() => undefined);
  },
};

/** Plus aucune identification active de cette personne sur la photo : les stories qu'elle en avait reprises tombent. */
async function dropStoryIfNoTag(tx: Tx, photoId: string, userId: string): Promise<string[]> {
  if (await hasActiveTagOnPhoto(tx, photoId, userId)) return [];
  return dropStoriesOfAlbumPhotos(tx, [photoId], { userId });
}
