// Identifications sur les photos d'album (lot R9f) : qui est qui, et qui voit quoi. Une identification active est servie avec sa
// photo à tout membre connecté **si le compte identifié est public** ; un compte **privé** n'est visible que de lui, du média
// auteur de l'album, des responsables de la structure de l'événement et de ses abonnés acceptés (T5) ; **sans session : aucune
// identification, jamais** (ni pseudo, ni nombre : ces routes exigent une session). Comptes suspendus, bannis ou supprimés :
// exclus partout. Une voiture d'un compte privé se montre « <voiture> » sans pseudo (règle du plateau à choisir).
import {
  type AlbumTagView,
  albumTagLabels,
  canSeeTag,
  type TagRelation,
  type TagRole,
  tagPseudoShown,
  tagRemovalKind,
} from "@orasso/shared";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { albumPhotoTags, profiles, userFollows } from "../../db/schema";
import { requireAuthorship } from "../../lib/authorship";
import { now } from "../../lib/deps";
import { notFound } from "../../lib/errors";
import type { Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";
import { structureManagers } from "../../lib/structureManagers";
import type { Executor } from "../../lib/tx";
import { vehiclesRepo } from "../vehicles/repo";
import { vehicleLabel } from "../vehicles/serializers";
import { mediaOfUser } from "./guards";
import { type AlbumJoin, loadAlbum } from "./view";

export type TagRow = typeof albumPhotoTags.$inferSelect;

/** Compte en règle (ni supprimé, ni banni, ni suspendu) : la même règle que le plateau. */
export const profileOk = (
  p: { deletedAt: Date | null; bannedAt: Date | null; suspendedUntil: Date | null },
  at: Date,
) => !p.deletedAt && !p.bannedAt && !(p.suspendedUntil && p.suspendedUntil > at);

/** Qui je suis sur cet album. */
export type AlbumActor = {
  /** Je suis le titulaire du profil média auteur de l'album. */
  isMediaAuthor: boolean;
  /** Je suis responsable de la structure de l'événement (propriétaire ou co-organisateur actif) : lecture seulement. */
  isManager: boolean;
};

/** Le profil média du regard est-il l'auteur de l'album ? */
export async function actorOf(ex: Executor, v: Viewer, join: AlbumJoin): Promise<AlbumActor> {
  const media = await mediaOfUser(ex, v.user.id);
  const isMediaAuthor = Boolean(media && media.id === join.a.mediaProfileId);
  const isManager = (await structureManagers(ex, join.e.structureId, { userId: v.user.id })).length > 0;
  return { isMediaAuthor, isManager };
}

/**
 * Mon rôle pour identifier : le média auteur (`media`), l'organisateur de l'événement (`organizer`, **second facteur exigé**,
 * `403 two_factor_required` sinon), ou toute personne connectée pour elle-même (`owner`). Le média est prioritaire, puis
 * l'organisateur. L'en-tête acteur n'est jamais lu : les droits sont ceux de la personne.
 */
export async function roleOf(ex: Executor, v: Viewer, join: AlbumJoin, actor?: AlbumActor): Promise<TagRole> {
  const who = actor ?? (await actorOf(ex, v, join));
  if (who.isMediaAuthor) return "media";
  if (who.isManager) {
    await requireAuthorship(v, { persona: "organizer", structureId: join.e.structureId }, ex);
    return "organizer";
  }
  return "owner";
}

/** L'album lu par ce regard (le sien, brouillon compris, ou un album visible de tous) ; 404 sans dire pourquoi. */
export async function visibleAlbum(ex: Executor, v: Viewer, albumId: string): Promise<AlbumJoin> {
  const join = await loadAlbum(ex, albumId.toLowerCase(), v.user.id, now());
  if (!join) throw notFound(albumTagLabels.errors.albumNotFound);
  return join;
}

type TagWithAccount = {
  tag: TagRow;
  account: { pseudo: string; avatarKey: string | null; visibility: "public" | "private" };
};

/** Les identifications **actives** de ces photos dont le compte identifié est en règle, avec son pseudo, son avatar et sa visibilité. */
export async function activeTagsOf(
  ex: Executor,
  photoIds: readonly string[],
  at: Date,
  /** Le regard : un compte suspendu garde la lecture de **ses** identifications (il peut les retirer, jamais les perdre de vue). */
  selfId?: string,
): Promise<TagWithAccount[]> {
  if (!photoIds.length) return [];
  const rows = await ex
    .select({
      tag: albumPhotoTags,
      pseudo: profiles.pseudo,
      avatarKey: profiles.avatarKey,
      visibility: profiles.visibility,
      deletedAt: profiles.deletedAt,
      bannedAt: profiles.bannedAt,
      suspendedUntil: profiles.suspendedUntil,
    })
    .from(albumPhotoTags)
    .innerJoin(profiles, eq(profiles.userId, albumPhotoTags.userId))
    .where(and(inArray(albumPhotoTags.photoId, [...photoIds]), isNull(albumPhotoTags.removedAt)))
    .orderBy(albumPhotoTags.createdAt, albumPhotoTags.id);
  return rows
    .filter((r) => profileOk(r, at) || (r.tag.userId === selfId && !r.deletedAt && !r.bannedAt))
    .map((r) => ({
      tag: r.tag,
      account: { pseudo: r.pseudo, avatarKey: r.avatarKey, visibility: r.visibility },
    }));
}

/** Parmi ces comptes, ceux dont je suis un abonné **accepté**. */
export async function acceptedFollowsOf(
  ex: Executor,
  viewerId: string,
  userIds: readonly string[],
): Promise<Set<string>> {
  const ids = [...new Set(userIds)].filter((id) => id !== viewerId);
  if (!ids.length) return new Set();
  const rows = await ex
    .select({ id: userFollows.followedId })
    .from(userFollows)
    .where(
      and(
        eq(userFollows.followerId, viewerId),
        eq(userFollows.status, "accepted"),
        inArray(userFollows.followedId, ids),
      ),
    );
  return new Set(rows.map((r) => r.id));
}

/**
 * Les identifications visibles de chaque photo pour ce regard (liste blanche : jamais l'identifiant du compte, jamais la
 * plaque). `canRemove` / `removeAs` : le geste que la personne peut faire (voir `tagRemovalKind`).
 */
export async function tagsByPhoto(
  ex: Executor,
  join: AlbumJoin,
  photoIds: readonly string[],
  v: Viewer,
  actor?: AlbumActor,
): Promise<Map<string, AlbumTagView[]>> {
  const out = new Map<string, AlbumTagView[]>();
  const at = now();
  const found = await activeTagsOf(ex, photoIds, at, v.user.id);
  if (!found.length) return out;
  const who = actor ?? (await actorOf(ex, v, join));
  const follows = await acceptedFollowsOf(
    ex,
    v.user.id,
    found.map((f) => f.tag.userId),
  );
  const vehicleIds = [...new Set(found.flatMap((f) => (f.tag.vehicleId ? [f.tag.vehicleId] : [])))];
  const vehicleRows = await vehiclesRepo.findFullByIds(vehicleIds, ex);
  const vehicles = new Map(vehicleRows.map((x) => [x.id, x]));
  for (const { tag, account } of found) {
    const self = tag.userId === v.user.id;
    const relation: TagRelation = {
      self,
      mediaAuthor: who.isMediaAuthor,
      manager: who.isManager,
      followerAccepted: follows.has(tag.userId),
    };
    const accountPrivate = account.visibility === "private";
    if (!canSeeTag({ hasSession: true, accountPrivate }, relation)) continue;
    const vehicle = tag.vehicleId ? vehicles.get(tag.vehicleId) : undefined;
    // Une voiture archivée (vendue, accidentée…) n'est plus visible que de son propriétaire.
    if (tag.targetKind === "vehicle" && (!vehicle || (vehicle.status !== "active" && !self))) continue;
    const showPseudo = tagPseudoShown({ kind: tag.targetKind, accountPrivate }, relation);
    const removeAs = tagRemovalKind(
      { userId: tag.userId, taggedBy: tag.taggedBy, taggedAs: tag.taggedAs },
      { id: v.user.id, isMediaAuthor: who.isMediaAuthor, isOrganizer: who.isManager },
    );
    const view: AlbumTagView = {
      id: tag.id,
      kind: tag.targetKind,
      taggedAs: tag.taggedAs,
      vehicle: vehicle ? { id: vehicle.id, label: vehicleLabel(vehicle) } : null,
      user: showPseudo ? { pseudo: account.pseudo, avatarUrl: storage.url(account.avatarKey) } : null,
      mine: self,
      canRemove: removeAs !== null,
      removeAs,
    };
    const list = out.get(tag.photoId) ?? [];
    list.push(view);
    out.set(tag.photoId, list);
  }
  return out;
}

/** Une identification (active ou non) d'une personne sur une photo : toutes les lignes, pour décider d'une pose. */
export async function tagsOfPhoto(ex: Executor, photoId: string): Promise<TagRow[]> {
  return ex.select().from(albumPhotoTags).where(eq(albumPhotoTags.photoId, photoId));
}

/** Lui reste-t-il une identification active sur cette photo ? (une personne peut en avoir deux : sa voiture et son pseudo) */
export async function hasActiveTagOnPhoto(ex: Executor, photoId: string, userId: string): Promise<boolean> {
  const res = await ex.execute(sql`select 1 from album_photo_tags
    where photo_id = ${photoId} and user_id = ${userId} and removed_at is null limit 1`);
  return res.rows.length > 0;
}
