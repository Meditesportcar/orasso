// Albums des médias (vague R9, lot R9e) : lecture. Qui voit quoi, comment un album se sérialise (liste blanche : ni `plate_state`,
// ni `plate_rects`, ni `author_id`, ni le pseudo du titulaire) et comment une photo se sert (adresse protégée, adresse publique).
//
// Un album se voit ainsi : son média (le titulaire du profil) le voit toujours, brouillon compris, tant qu'il n'est pas supprimé ;
// tout autre le voit seulement s'il est publié, non supprimé, d'un média en règle **accrédité (`accepted`) maintenant** à
// l'événement (règle V6, gardée dans la durée), sur un événement non brouillon et pas sur invitation, et si le compte du média
// n'est ni suspendu ni banni ni supprimé.

import { ALBUM_COVER_PHOTOS, type AlbumPhotoView, type AlbumSummary, albumTitle, authorKeyOf } from "@orasso/shared";
import { and, eq, type SQL, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { eventAlbumPhotos, eventAlbums, events, legacyFileBlocks, mediaProfiles } from "../../db/schema";
import { storage } from "../../lib/storage";
import type { Executor } from "../../lib/tx";
import { profileOkSql } from "../feed/access";

export type AlbumRow = typeof eventAlbums.$inferSelect;
export type AlbumPhotoRow = typeof eventAlbumPhotos.$inferSelect;
export type EventRow = typeof events.$inferSelect;
export type MediaRow = typeof mediaProfiles.$inferSelect;
export type AlbumJoin = { a: AlbumRow; e: EventRow; m: MediaRow };

/** Dossier privé des photos d'album neuves (jamais servi par `/api/files`). */
export const ALBUM_PHOTO_FOLDER = "private/albums/";
/** Dossier des envois en attente (`purpose = album_photo`). */
export const ALBUM_UPLOAD_FOLDER = "private/album-uploads/";

export const albumPhotoKey = (albumId: string, hex: string) => `${ALBUM_PHOTO_FOLDER}${albumId}/${hex}.webp`;

/** Nom d'une photo dans une adresse : la fin de sa clé. */
export const albumPhotoName = (storageKey: string) => storageKey.slice(storageKey.lastIndexOf("/") + 1);

/**
 * Nom de fichier accepté dans l'adresse d'une photo : la fin de sa clé (lettres, chiffres, tirets, soulignés) et `.webp` (tout ce que
 * le serveur écrit est en WebP). Les photos neuves ont un nom hexadécimal ; les photos reprises gardent le nom de leur ancienne clé
 * (`beziers-night-0.webp` dans le seed). La photo est cherchée dans **cet album** par la fin exacte de sa clé : le nom ne désigne
 * jamais un autre dossier.
 */
export const ALBUM_PHOTO_NAME_RE = /^[A-Za-z0-9_-]{8,80}\.webp$/;

/** Adresse protégée d'une photo : la route revérifie, à chaque lecture, que la personne connectée peut voir l'album. */
export const albumPhotoUrl = (albumId: string, storageKey: string) =>
  `/api/albums/${albumId}/photos/${albumPhotoName(storageKey)}`;

/** Adresse publique (sans session) : seulement un album publié et visible de tous (T34). */
export const albumPublicPhotoUrl = (albumId: string, storageKey: string) =>
  `/api/public/albums/${albumId}/photos/${albumPhotoName(storageKey)}`;

/** Clé privée (une photo neuve) ou publique (une photo reprise d'une ancienne galerie, sous son dossier d'origine). */
export const isPrivateAlbumKey = (storageKey: string) => storageKey.startsWith("private/");

/** Les dossiers des anciennes galeries : leurs fichiers restent sous `/api/files` (clé publique) et suivent la visibilité de l'album. */
export const LEGACY_GALLERY_PREFIXES = ["media-contents/", "seed/media/"] as const;
/** Le préfixe se teste sans tenir compte de la casse (le disque de Windows ne distingue pas `MEDIA-CONTENTS/` de `media-contents/`). */
export const isLegacyGalleryKey = (key: string) => {
  const lower = key.toLowerCase();
  return LEGACY_GALLERY_PREFIXES.some((p) => lower.startsWith(p));
};

// --- Qui voit quoi ------------------------------------------------------------------------------------------------------

/** Le média est accrédité (`accepted`) à l'événement de l'album, maintenant. */
export const albumAccreditedSql = sql`exists (select 1 from applications ap where ap.event_id = ${eventAlbums.eventId}
  and ap.media_profile_id = ${eventAlbums.mediaProfileId} and ap.kind = 'media' and ap.status = 'accepted')`;

/** Ce que n'importe quel membre (ou visiteur) peut voir. `at` : l'instant (compte suspendu jusqu'à une date). */
export function albumVisibleSql(at: Date): SQL {
  return sql`(${eventAlbums.status} = 'published' and ${eventAlbums.deletedAt} is null
    and ${mediaProfiles.deletedAt} is null
    and ${events.status} = 'published' and ${events.admission} <> 'invite_only'
    and ${albumAccreditedSql}
    and exists (select 1 from profiles ow where ow.user_id = ${mediaProfiles.userId} and ${profileOkSql("ow", at)}))`;
}

/**
 * Une clé publique d'ancienne galerie peut-elle être servie ? `visible` : sa photo est dans un album visible de tous ; `hidden` : elle est
 * dans un album qui ne l'est plus (accréditation retombée, média suspendu ou supprimé, album ou photo retirés, événement annulé ou non
 * publié) ; `unknown` : aucune photo d'album ne la porte (fichier de lien, galerie non reprise) : servie comme avant. Une requête indexée
 * (`storage_key` est unique).
 */
export async function legacyFileState(key: string, at: Date): Promise<"visible" | "hidden" | "unknown"> {
  // 1. Une clé bloquée (original copié sous une clé privée) n'est jamais servie : lecture de clé primaire, sans lien avec un album,
  //    un événement ou un compte (rien ne la supprime ; voir `legacyFileBlocks`). Une clé inventée s'arrête ici.
  const [blocked] = await db
    .select({ key: legacyFileBlocks.key })
    .from(legacyFileBlocks)
    .where(eq(legacyFileBlocks.key, key))
    .limit(1);
  if (blocked) return "hidden";
  // 2. Une photo reprise d'une ancienne galerie (clé gardée sur place) suit la visibilité de son album.
  const [row] = await db
    .select({ visible: sql<boolean>`(${eventAlbumPhotos.deletedAt} is null and ${albumVisibleSql(at)})` })
    .from(eventAlbumPhotos)
    .innerJoin(eventAlbums, eq(eventAlbums.id, eventAlbumPhotos.albumId))
    .innerJoin(events, eq(events.id, eventAlbums.eventId))
    .innerJoin(mediaProfiles, eq(mediaProfiles.id, eventAlbums.mediaProfileId))
    .where(eq(eventAlbumPhotos.storageKey, key))
    .limit(1);
  if (row) return row.visible ? "visible" : "hidden";
  return "unknown";
}

/** La base de toute lecture d'album : l'album, son événement, son média. */
export const albumBase = (ex: Executor = db) =>
  ex
    .select({ a: eventAlbums, e: events, m: mediaProfiles })
    .from(eventAlbums)
    .innerJoin(events, eq(events.id, eventAlbums.eventId))
    .innerJoin(mediaProfiles, eq(mediaProfiles.id, eventAlbums.mediaProfileId));

/**
 * Un album lu par `viewerId` (`null` : sans session) : le sien (brouillon compris), ou un album visible de tous. `publicOnly`
 * (route sans session) : jamais le sien, jamais un brouillon.
 */
export async function loadAlbum(
  ex: Executor,
  id: string,
  viewerId: string | null,
  at: Date,
  publicOnly = false,
): Promise<AlbumJoin | null> {
  const own = !publicOnly && viewerId ? sql`${mediaProfiles.userId} = ${viewerId}` : sql`false`;
  const [row] = await albumBase(ex)
    .where(and(eq(eventAlbums.id, id), sql`${eventAlbums.deletedAt} is null`, sql`(${own} or ${albumVisibleSql(at)})`))
    .limit(1);
  return row ?? null;
}

// --- Sérialisation ------------------------------------------------------------------------------------------------------

export const mediaKey = (mediaProfileId: string) => authorKeyOf("media", mediaProfileId);

export const photoView = (
  albumId: string,
  p: Pick<AlbumPhotoRow, "id" | "storageKey" | "width" | "height" | "position">,
): AlbumPhotoView => ({
  id: p.id,
  url: albumPhotoUrl(albumId, p.storageKey),
  width: p.width,
  height: p.height,
  position: p.position,
});

/** Les `limit` premières photos de chaque album (deux requêtes pour toute la liste) ; par défaut la mosaïque (4). */
export async function loadFirstPhotos(
  ex: Executor,
  albumIds: readonly string[],
  limit: number = ALBUM_COVER_PHOTOS,
): Promise<Map<string, AlbumPhotoRow[]>> {
  const out = new Map<string, AlbumPhotoRow[]>();
  if (!albumIds.length) return out;
  const list = sql.join(
    albumIds.map((i) => sql`${i}::uuid`),
    sql`, `,
  );
  const res = await ex.execute<{ id: string }>(sql`
    select id from (
      select id, row_number() over (partition by album_id order by position) as rn
      from event_album_photos where album_id in (${list}) and deleted_at is null
    ) t where rn <= ${limit}`);
  const ids = res.rows.map((r) => r.id);
  if (!ids.length) return out;
  const photos = await ex
    .select()
    .from(eventAlbumPhotos)
    .where(
      sql`${eventAlbumPhotos.id} in (${sql.join(
        ids.map((i) => sql`${i}::uuid`),
        sql`, `,
      )})`,
    )
    .orderBy(eventAlbumPhotos.albumId, eventAlbumPhotos.position);
  for (const p of photos) {
    const list = out.get(p.albumId) ?? [];
    list.push(p);
    out.set(p.albumId, list);
  }
  return out;
}

export const officialOf = (a: Pick<AlbumRow, "officialAt">) => a.officialAt !== null;

/** Les albums de la liste en `AlbumSummary` (liste blanche), la mosaïque comprise. */
export async function summariesOf(ex: Executor, rows: AlbumJoin[], viewerId: string | null): Promise<AlbumSummary[]> {
  const covers = await loadFirstPhotos(
    ex,
    rows.map((r) => r.a.id),
  );
  return rows.map(({ a, e, m }) => ({
    id: a.id,
    title: albumTitle(a.title, e.title),
    status: a.status,
    event: {
      id: e.id,
      slug: e.slug,
      title: e.title,
      startsAt: e.startsAt.toISOString(),
      endsAt: e.endsAt.toISOString(),
    },
    media: {
      key: mediaKey(m.id),
      name: m.name,
      logoUrl: storage.url(m.logoKey),
      verified: m.pressCardVerifiedAt !== null,
    },
    photosCount: a.photosCount,
    allowSave: a.allowSave,
    official: officialOf(a),
    publishedAt: a.publishedAt?.toISOString() ?? null,
    cover: (covers.get(a.id) ?? []).map((p) => photoView(a.id, p)),
    mine: viewerId !== null && m.userId === viewerId,
  }));
}

/** Toutes les photos d'un album, dans l'ordre. */
export async function albumPhotos(ex: Executor, albumId: string): Promise<AlbumPhotoRow[]> {
  return ex
    .select()
    .from(eventAlbumPhotos)
    .where(and(eq(eventAlbumPhotos.albumId, albumId), sql`${eventAlbumPhotos.deletedAt} is null`))
    .orderBy(eventAlbumPhotos.position);
}
