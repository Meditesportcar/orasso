// La section « Photos » de la fiche d'un événement et la reprise d'une photo dans le journal (vague R9, lot R9g). Pures : le site, l'appli
// et l'API les lisent, aucune n'est écrite dans un écran. Les albums reçus sont déjà les albums **publiés et visibles** (l'API filtre).
import { eventPhotosLabels } from "../labels/eventPhotos.fr";
import type { AlbumPlateState } from "../schemas/albums";
import type { FeedPhotoCredit } from "../schemas/feed";
import { sortAlbums } from "./albums";

type Sortable = { id: string; official: boolean; publishedAt: string | Date | null };

/**
 * T43 : la section apparaît dès qu'un album publié existe, même pendant l'événement (un média peut publier le jour même) ; sans album,
 * rien, avant comme après la fin (la fiche est déjà longue : pas d'état vide).
 */
export function showPhotosSection(albums: readonly unknown[] | null | undefined): boolean {
  return Array.isArray(albums) && albums.length > 0;
}

/** L'album officiel d'abord, puis du plus récent (`published_at` décroissant), puis l'identifiant (ordre stable). */
export function albumsOrder<T extends Sortable>(albums: readonly T[]): T[] {
  return sortAlbums(albums);
}

/** La légende préremplie d'une reprise (T44) : « Photo : <média> ». */
export function repostCaptionDefault(mediaName: string): string {
  return eventPhotosLabels.defaultCaption(mediaName);
}

/**
 * Une photo peut-elle être reprise ? Toute photo dont la décision de plaque est connue : floutée (copiée telle quelle), « aucune plaque »
 * (confirmée) ou gardée (la copie est floutée avec les cadres). Une photo d'une ancienne galerie (`unknown`) ne l'est pas.
 */
export function canRepost(plateState: AlbumPlateState): boolean {
  return plateState !== "unknown";
}

/** La reprise reste permise 30 jours après la publication de l'album (contenu frais), quelle que soit la date de l'événement. */
export const REPOST_WINDOW_DAYS = 30;

/** La reprise est-elle encore permise ? `publishedAt` : la publication de l'album ; bornes comprises, `now` passé explicitement. */
export function repostWindowOpen(publishedAt: string | Date | null | undefined, now: Date): boolean {
  if (!publishedAt) return false;
  const at = typeof publishedAt === "string" ? new Date(publishedAt) : publishedAt;
  return now.getTime() - at.getTime() <= REPOST_WINDOW_DAYS * 86_400_000;
}

/** Le texte d'un refus de reprise, d'après le code de l'API. */
export function repostRefusal(code: string | undefined): string | null {
  if (code === "plate_unknown") return eventPhotosLabels.repostUnknownPlate;
  if (code === "already_reposted") return eventPhotosLabels.repostAlready;
  if (code === "repost_expired") return eventPhotosLabels.errors.repostExpired;
  return null;
}

/** La ligne du crédit d'une photo reprise (« Photo : <média> »), ou `null` pour une photo ordinaire. */
export function creditLine(credit: FeedPhotoCredit | null | undefined): string | null {
  return credit ? eventPhotosLabels.creditOnPhoto(credit.mediaName) : null;
}

/** « Voir l'album » : seulement tant que l'album d'origine est visible (`albumId` nul sinon). */
export function creditAlbumId(credit: FeedPhotoCredit | null | undefined): string | null {
  return credit?.albumId ?? null;
}
