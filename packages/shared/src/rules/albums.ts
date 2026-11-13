import { albumLabels } from "../labels/albums.fr";
import { ALBUM_DRAFT_TTL_DAYS, type AlbumPlateDecision, type AlbumPlateState } from "../schemas/albums";
import { ALBUM_MAX_PHOTOS } from "../schemas/media";

// Albums des médias (lot R9e) : règles pures. L'API les applique, l'appli et le site affichent le résultat. `now` est
// toujours passé, jamais lu.

const DAY_MS = 86_400_000;

/** Le titre servi : celui du média, sinon « Les photos du <événement> ». */
export function albumTitle(title: string | null | undefined, eventTitle: string): string {
  const own = title?.trim();
  return own ? own : albumLabels.defaultTitle(eventTitle);
}

/** Peut-on ajouter une photo à un album qui en compte déjà `count` ? Le plafond est `ALBUM_MAX_PHOTOS` (200). */
export function canAddPhoto(count: number): { ok: true } | { ok: false; reason: "album_full" } {
  return count < ALBUM_MAX_PHOTOS ? { ok: true } : { ok: false, reason: "album_full" };
}

/** Ce qui empêche de publier un album (`null` = publiable) : au moins une photo. */
export function albumIssue(album: { photosCount: number }): "album_empty" | null {
  return album.photosCount > 0 ? null : "album_empty";
}

/** « 48 photos » : la mention de la carte du Fil, de la page du média et de l'album ouvert. */
export function albumCardLabel(photosCount: number): string {
  return albumLabels.photosCount(photosCount);
}

/** Le plus ancien des brouillons qu'on garde : plus vieux que cette date, un brouillon est purgé. */
export function draftPurgeBefore(now: Date): Date {
  return new Date(now.getTime() - ALBUM_DRAFT_TTL_DAYS * DAY_MS);
}

/**
 * Le brouillon est-il périmé : sans activité depuis 7 jours ? `lastActivityAt` est `updated_at` (chaque ajout de photo le renouvelle) :
 * un brouillon qu'on complète reste vivant. C'est la seule règle, appliquée par la tâche `albums.draft-purge`.
 */
export function isDraftExpired(lastActivityAt: Date, now: Date): boolean {
  return lastActivityAt.getTime() <= draftPurgeBefore(now).getTime();
}

/** L'état de plaque gardé pour une décision du média. */
export const plateStateOf = (decision: AlbumPlateDecision): AlbumPlateState => decision;

/** Combien de photos ont été floutées (« 48 photos · 2 plaques floutées »). */
export function blurredCount(states: readonly AlbumPlateState[]): number {
  return states.filter((s) => s === "blurred").length;
}

type Sortable = { id: string; official: boolean; publishedAt: string | Date | null };
const ms = (d: string | Date | null) => (d === null ? 0 : new Date(d).getTime());

/** L'officiel d'abord, puis du plus récent au plus ancien, puis l'identifiant (ordre stable). */
export function compareAlbums(a: Sortable, b: Sortable): number {
  if (a.official !== b.official) return a.official ? -1 : 1;
  return ms(b.publishedAt) - ms(a.publishedAt) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);
}

export function sortAlbums<T extends Sortable>(albums: readonly T[]): T[] {
  return [...albums].sort(compareAlbums);
}
