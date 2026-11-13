// « Tes photos » et les mentions (lot R9f, T42) : les photos d'album où une personne est identifiée (sa voiture, ou son pseudo)
// vivent sur son écran « Tes photos », sur la fiche de sa voiture, sur sa sortie passée et dans son souvenir. Ce **ne sont jamais**
// des publications (ni dans `/authors/u:/feed-posts`, ni dans « Publications ») : des mentions, à part.
//
// Visibilité : une mention n'est servie que si l'album est visible de tous (publié, média accrédité, événement publié et non privé)
// **et** si le lecteur a le droit de voir l'identification (`canSeeTag` : compte public, sinon lui, le média auteur, les
// responsables de la structure, un abonné accepté). Sans session : jamais (ces routes exigent une session).
import {
  ALBUM_MENTION_PHOTOS,
  type AlbumMention,
  albumTagLabels,
  albumTitle,
  canSavePhoto,
  canSeeTag,
  type MyAlbumTagsList,
  type MyAlbumTagsQuery,
  type MyPhoto,
  type MyPhotosView,
  storyPlateOfAlbumPhoto,
} from "@orasso/shared";
import { and, asc, desc, eq, inArray, isNull, type SQL, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { albumPhotoTags, eventAlbumPhotos, eventAlbums, events, mediaProfiles, profiles } from "../../db/schema";
import { now } from "../../lib/deps";
import { notFound } from "../../lib/errors";
import type { Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";
import { structureManagers } from "../../lib/structureManagers";
import type { Executor } from "../../lib/tx";
import { vehiclesRepo } from "../vehicles/repo";
import { vehicleLabel } from "../vehicles/serializers";
import { acceptedFollowsOf, activeTagsOf, profileOk, visibleAlbum } from "./tag-visibility";
import { albumPhotoUrl, albumVisibleSql, mediaKey } from "./view";

type Scope = { vehicleId?: string; userId?: string; eventIds?: readonly string[] };

type MentionRow = {
  tagUserId: string;
  photoId: string;
  storageKey: string;
  width: number | null;
  height: number | null;
  position: number;
  albumId: string;
  albumTitle: string | null;
  eventId: string;
  eventTitle: string;
  eventSlug: string;
  startsAt: Date;
  structureId: string;
  mediaName: string;
  mediaUserId: string;
  publishedAt: Date | null;
  pseudoPrivate: boolean;
};

/** Plafond d'albums lus pour une liste de mentions (une personne ne compte pas des centaines d'albums). */
const MAX_ALBUMS = 500;

/**
 * Les mentions d'un périmètre (une voiture, une personne, des événements) que ce lecteur a le droit de voir, par album : jusqu'à six
 * vignettes et le nombre de photos distinctes. Du plus récent au plus ancien. Une seule requête pour les identifications, une pour les
 * abonnements, une par structure pour les responsables.
 */
async function loadMentions(
  ex: Executor,
  viewerId: string,
  scope: Scope,
): Promise<{ eventId: string; mention: AlbumMention }[]> {
  const at = now();
  const rows = (await ex
    .select({
      tagUserId: albumPhotoTags.userId,
      photoId: eventAlbumPhotos.id,
      storageKey: eventAlbumPhotos.storageKey,
      width: eventAlbumPhotos.width,
      height: eventAlbumPhotos.height,
      position: eventAlbumPhotos.position,
      albumId: eventAlbums.id,
      albumTitle: eventAlbums.title,
      eventId: events.id,
      eventTitle: events.title,
      eventSlug: events.slug,
      startsAt: events.startsAt,
      structureId: events.structureId,
      mediaName: mediaProfiles.name,
      mediaUserId: mediaProfiles.userId,
      publishedAt: eventAlbums.publishedAt,
      pseudoPrivate: sql<boolean>`(${profiles.visibility} = 'private')`,
      deletedAt: profiles.deletedAt,
      bannedAt: profiles.bannedAt,
      suspendedUntil: profiles.suspendedUntil,
    })
    .from(albumPhotoTags)
    .innerJoin(eventAlbumPhotos, eq(eventAlbumPhotos.id, albumPhotoTags.photoId))
    .innerJoin(eventAlbums, eq(eventAlbums.id, eventAlbumPhotos.albumId))
    .innerJoin(events, eq(events.id, eventAlbums.eventId))
    .innerJoin(mediaProfiles, eq(mediaProfiles.id, eventAlbums.mediaProfileId))
    .innerJoin(profiles, eq(profiles.userId, albumPhotoTags.userId))
    .where(
      and(
        isNull(albumPhotoTags.removedAt),
        isNull(eventAlbumPhotos.deletedAt),
        albumVisibleSql(at),
        scope.vehicleId ? eq(albumPhotoTags.vehicleId, scope.vehicleId) : undefined,
        scope.userId ? eq(albumPhotoTags.userId, scope.userId) : undefined,
        scope.eventIds ? inArray(events.id, [...scope.eventIds]) : undefined,
      ) as SQL,
    )
    .orderBy(desc(events.startsAt), desc(eventAlbums.publishedAt), asc(eventAlbums.id), asc(eventAlbumPhotos.position))
    .limit(MAX_ALBUMS * ALBUM_MENTION_PHOTOS * 4)) as (MentionRow & {
    deletedAt: Date | null;
    bannedAt: Date | null;
    suspendedUntil: Date | null;
  })[];
  const ok = rows.filter((r) => profileOk(r, at));
  if (!ok.length) return [];
  const follows = await acceptedFollowsOf(
    ex,
    viewerId,
    ok.map((r) => r.tagUserId),
  );
  const managers = new Map<string, boolean>();
  for (const sid of new Set(ok.map((r) => r.structureId))) {
    managers.set(sid, (await structureManagers(ex, sid, { userId: viewerId })).length > 0);
  }
  const byAlbum = new Map<string, { row: MentionRow; photos: Map<string, MentionRow> }>();
  for (const r of ok) {
    const visible = canSeeTag(
      { hasSession: true, accountPrivate: r.pseudoPrivate },
      {
        self: r.tagUserId === viewerId,
        mediaAuthor: r.mediaUserId === viewerId,
        manager: managers.get(r.structureId) ?? false,
        followerAccepted: follows.has(r.tagUserId),
      },
    );
    if (!visible) continue;
    const entry = byAlbum.get(r.albumId) ?? { row: r, photos: new Map<string, MentionRow>() };
    entry.photos.set(r.photoId, r);
    byAlbum.set(r.albumId, entry);
  }
  return [...byAlbum.values()].slice(0, MAX_ALBUMS).map(({ row, photos }) => {
    const list = [...photos.values()].sort((a, b) => a.position - b.position);
    const mention: AlbumMention = {
      albumId: row.albumId,
      eventTitle: row.eventTitle,
      eventSlug: row.eventSlug,
      mediaName: row.mediaName,
      photos: list.slice(0, ALBUM_MENTION_PHOTOS).map((p) => ({
        id: p.photoId,
        url: albumPhotoUrl(row.albumId, p.storageKey),
        width: p.width,
        height: p.height,
        position: p.position,
      })),
      count: list.length,
    };
    return { eventId: row.eventId, mention };
  });
}

/** `GET /vehicles/:id` : « Vu au … · N photos » (visible de qui voit la fiche, filtré par `canSeeTag` du lecteur). */
export async function mentionsOfVehicle(viewerId: string, vehicleId: string): Promise<AlbumMention[]> {
  return (await loadMentions(db, viewerId, { vehicleId })).map((m) => m.mention);
}

/** Mes propres mentions (voiture ou pseudo), pour ces événements : la sortie passée et le souvenir. Les miens seuls. */
export async function myMentionsByEvent(
  userId: string,
  eventIds: readonly string[],
): Promise<Map<string, AlbumMention[]>> {
  const out = new Map<string, AlbumMention[]>();
  if (!eventIds.length) return out;
  for (const { eventId, mention } of await loadMentions(db, userId, { userId, eventIds })) {
    out.set(eventId, [...(out.get(eventId) ?? []), mention]);
  }
  return out;
}

/**
 * `GET /vehicles/:id` : la fiche d'une voiture avec « Vu au … · N photos ». Seulement quand la fiche complète est visible (compte
 * public, abonné accepté, moi) : la fiche réduite d'un compte privé ne gagne aucun champ (liste blanche `privateVehicleFields`).
 * Le champ n'est ajouté que s'il y a des photos visibles du lecteur : sinon la fiche garde la forme d'avant.
 */
export async function withAlbumMentions<T extends { id: string; detailed: boolean }>(
  viewerId: string,
  sheet: T,
): Promise<T & { albumMentions?: AlbumMention[] }> {
  if (!sheet.detailed) return sheet;
  const albumMentions = await mentionsOfVehicle(viewerId, sheet.id);
  return albumMentions.length ? { ...sheet, albumMentions } : sheet;
}

export const myPhotosService = {
  /** `GET /me/albums/:id/my-photos` : mes photos de cet album (404 si je n'y suis identifié sur aucune). */
  async album(v: Viewer, albumId: string): Promise<MyPhotosView> {
    const join = await visibleAlbum(db, v, albumId);
    const at = now();
    const photos = await db
      .select()
      .from(eventAlbumPhotos)
      .where(and(eq(eventAlbumPhotos.albumId, join.a.id), isNull(eventAlbumPhotos.deletedAt)))
      .orderBy(asc(eventAlbumPhotos.position));
    const tags = (
      await activeTagsOf(
        db,
        photos.map((p) => p.id),
        at,
      )
    ).filter((t) => t.tag.userId === v.user.id);
    if (!tags.length) throw notFound(albumTagLabels.errors.photoNotFound);
    const isMediaAuthor = join.m.userId === v.user.id;
    const byPhoto = new Map<string, typeof tags>();
    for (const t of tags) byPhoto.set(t.tag.photoId, [...(byPhoto.get(t.tag.photoId) ?? []), t]);
    const mine: MyPhoto[] = [];
    for (const p of photos) {
      const list = byPhoto.get(p.id);
      if (!list?.length) continue;
      // Une photo peut porter deux identifications de moi (ma voiture et mon pseudo) : celle d'un autre prime sur la mienne.
      const chosen = list.find((t) => t.tag.taggedBy !== v.user.id) ?? list[0];
      if (!chosen) continue;
      mine.push({
        id: p.id,
        url: albumPhotoUrl(join.a.id, p.storageKey),
        width: p.width,
        height: p.height,
        position: p.position,
        taggedBy:
          chosen.tag.taggedBy === v.user.id ? "me" : chosen.tag.taggedAs === "organizer" ? "organizer" : "media",
        tagId: chosen.tag.id,
        canSave: canSavePhoto({ allowSave: join.a.allowSave, isMediaAuthor }),
        canStory: storyPlateOfAlbumPhoto(p.plateState).ok,
      });
    }
    const carTag = tags.find((t) => t.tag.vehicleId);
    const vehicle = carTag?.tag.vehicleId ? await vehiclesRepo.findFullById(carTag.tag.vehicleId) : null;
    return {
      album: {
        id: join.a.id,
        title: albumTitle(join.a.title, join.e.title),
        event: {
          id: join.e.id,
          slug: join.e.slug,
          title: join.e.title,
          startsAt: join.e.startsAt.toISOString(),
        },
      },
      media: { key: mediaKey(join.m.id), name: join.m.name, logoUrl: storage.url(join.m.logoKey) },
      vehicle: vehicle ? { id: vehicle.id, label: vehicleLabel(vehicle) } : null,
      photos: mine,
    };
  },

  /** `GET /me/album-tags?cursor=&limit=` : toutes mes identifications actives, par album (la sortie et le souvenir ouvrent « Tes photos »). */
  async mine(v: Viewer, q: MyAlbumTagsQuery): Promise<MyAlbumTagsList> {
    const all = (await loadMentions(db, v.user.id, { userId: v.user.id })).map((m) => m.mention);
    const start = q.cursor ? all.findIndex((m) => m.albumId === q.cursor) + 1 : 0;
    const items = all.slice(start, start + q.limit);
    const last = items.at(-1);
    return { items, nextCursor: start + q.limit < all.length && last ? last.albumId : null };
  },
};
