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

/** Une ligne par album et par personne identifiée : le nombre de photos **distinctes** est calculé en base (jamais borné par une limite de lignes). */
type Group = {
  albumId: string;
  eventId: string;
  eventTitle: string;
  eventSlug: string;
  structureId: string;
  mediaName: string;
  mediaUserId: string;
  tagUserId: string;
  pseudoPrivate: boolean;
  n: number;
};

/** Plafond de groupes lus hors pagination (une voiture ou quelques événements : jamais des centaines d'albums). */
const MAX_GROUPS = 1000;

/** Un compte suspendu garde la lecture de **ses** mentions ; supprimé ou banni : jamais. */
const accountReadable = (
  p: { deletedAt: Date | null; bannedAt: Date | null; suspendedUntil: Date | null },
  tagUserId: string,
  viewerId: string,
  at: Date,
) => profileOk(p, at) || (tagUserId === viewerId && !p.deletedAt && !p.bannedAt);

/**
 * Les mentions d'un périmètre (une voiture, une personne, des événements) que ce lecteur a le droit de voir, par album : jusqu'à six
 * vignettes et le nombre de photos distinctes. Du plus récent au plus ancien. Les albums sont **paginés en base** (`page`, curseur
 * à clés sur l'événement, la publication et l'identifiant), les comptes viennent d'un `count(distinct)` ; seule la liste des
 * vignettes est limitée. `page.after` inconnu : page vide (jamais un retour au début).
 */
async function loadMentions(
  ex: Executor,
  viewerId: string,
  scope: Scope,
  page?: { limit: number; after?: string },
): Promise<{ items: { eventId: string; mention: AlbumMention }[]; more: boolean }> {
  const at = now();
  // Le curseur est comparé **en base** (jamais ramené à une `Date` : les microsecondes d'une publication reprise seraient perdues et des albums
  // du même instant sautés).
  const after = page?.after?.toLowerCase();
  if (after) {
    const [c] = await ex
      .select({ id: eventAlbums.id })
      .from(eventAlbums)
      .where(and(eq(eventAlbums.id, after), sql`${eventAlbums.publishedAt} is not null`));
    if (!c) return { items: [], more: false };
  }
  const rows = await ex
    .select({
      albumId: eventAlbums.id,
      eventId: events.id,
      eventTitle: events.title,
      eventSlug: events.slug,
      structureId: events.structureId,
      mediaName: mediaProfiles.name,
      mediaUserId: mediaProfiles.userId,
      tagUserId: albumPhotoTags.userId,
      pseudoPrivate: sql<boolean>`(${profiles.visibility} = 'private')`,
      deletedAt: profiles.deletedAt,
      bannedAt: profiles.bannedAt,
      suspendedUntil: profiles.suspendedUntil,
      n: sql<number>`count(distinct ${eventAlbumPhotos.id})::int`,
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
        after
          ? sql`(${events.startsAt}, ${eventAlbums.publishedAt}, ${eventAlbums.id}) < (
              select ce.starts_at, ca.published_at, ca.id from event_albums ca
              join events ce on ce.id = ca.event_id where ca.id = ${after}::uuid)`
          : undefined,
      ) as SQL,
    )
    .groupBy(eventAlbums.id, events.id, mediaProfiles.id, albumPhotoTags.userId, profiles.userId)
    .orderBy(desc(events.startsAt), desc(eventAlbums.publishedAt), desc(eventAlbums.id))
    .limit(page ? page.limit + 1 : MAX_GROUPS);
  const ok: Group[] = rows
    .filter((r) => accountReadable(r, r.tagUserId, viewerId, at))
    .map((r) => ({ ...r, n: Number(r.n) }));
  if (!ok.length) return { items: [], more: false };
  const follows = await acceptedFollowsOf(
    ex,
    viewerId,
    ok.map((r) => r.tagUserId),
  );
  const managers = new Map<string, boolean>();
  for (const sid of new Set(ok.map((r) => r.structureId))) {
    managers.set(sid, (await structureManagers(ex, sid, { userId: viewerId })).length > 0);
  }
  // Les groupes visibles de ce lecteur, par album (l'ordre de la requête est gardé).
  const byAlbum = new Map<string, { row: Group; n: number; users: Set<string> }>();
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
    const entry = byAlbum.get(r.albumId) ?? { row: r, n: 0, users: new Set<string>() };
    entry.n += r.n;
    entry.users.add(r.tagUserId);
    byAlbum.set(r.albumId, entry);
  }
  const more = page ? rows.length > page.limit : false;
  const albums = [...byAlbum.values()].slice(0, page ? page.limit : MAX_GROUPS);
  if (!albums.length) return { items: [], more };
  // Les vignettes : six au plus par album, dans l'ordre des photos (seuls les albums de la page sont lus).
  const albumIds = albums.map((a) => a.row.albumId);
  const users = [...new Set(albums.flatMap((a) => [...a.users]))];
  const res = await ex.execute<{
    id: string;
    album_id: string;
    storage_key: string;
    width: number | null;
    height: number | null;
    position: number;
  }>(sql`
    select id, album_id, storage_key, width, height, position from (
      select p.id, p.album_id, p.storage_key, p.width, p.height, p.position,
        row_number() over (partition by p.album_id order by p.position) as rn
      from event_album_photos p
      where p.deleted_at is null and p.album_id = any(${sql.param(albumIds)}::uuid[])
        and exists (select 1 from album_photo_tags t where t.photo_id = p.id and t.removed_at is null
          and t.user_id = any(${sql.param(users)}::text[])
          ${scope.vehicleId ? sql`and t.vehicle_id = ${scope.vehicleId}` : sql``}
          ${scope.userId ? sql`and t.user_id = ${scope.userId}` : sql``})
    ) x where rn <= ${ALBUM_MENTION_PHOTOS} order by album_id, position`);
  const thumbs = new Map<string, AlbumMention["photos"]>();
  for (const p of res.rows) {
    thumbs.set(p.album_id, [
      ...(thumbs.get(p.album_id) ?? []),
      {
        id: p.id,
        url: albumPhotoUrl(p.album_id, p.storage_key),
        width: p.width,
        height: p.height,
        position: p.position,
      },
    ]);
  }
  return {
    items: albums.map(({ row, n }) => ({
      eventId: row.eventId,
      mention: {
        albumId: row.albumId,
        eventTitle: row.eventTitle,
        eventSlug: row.eventSlug,
        mediaName: row.mediaName,
        photos: thumbs.get(row.albumId) ?? [],
        count: n,
      },
    })),
    more,
  };
}

/** `GET /vehicles/:id` : « Vu au … · N photos » (visible de qui voit la fiche, filtré par `canSeeTag` du lecteur). */
export async function mentionsOfVehicle(viewerId: string, vehicleId: string): Promise<AlbumMention[]> {
  return (await loadMentions(db, viewerId, { vehicleId })).items.map((m) => m.mention);
}

/** Mes propres mentions (voiture ou pseudo), pour ces événements : la sortie passée et le souvenir. Les miens seuls. */
export async function myMentionsByEvent(
  userId: string,
  eventIds: readonly string[],
): Promise<Map<string, AlbumMention[]>> {
  const out = new Map<string, AlbumMention[]>();
  if (!eventIds.length) return out;
  for (const { eventId, mention } of (await loadMentions(db, userId, { userId, eventIds })).items) {
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
        v.user.id,
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
        // Un fichier qui sort d'Orasso a ses plaques traitées : une photo d'ancienne galerie (`unknown`) ne s'enregistre pas.
        canSave: p.plateState !== "unknown" && canSavePhoto({ allowSave: join.a.allowSave, isMediaAuthor }),
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
    const { items, more } = await loadMentions(
      db,
      v.user.id,
      { userId: v.user.id },
      { limit: q.limit, after: q.cursor },
    );
    const last = items.at(-1);
    return { items: items.map((m) => m.mention), nextCursor: more && last ? last.mention.albumId : null };
  },
};
