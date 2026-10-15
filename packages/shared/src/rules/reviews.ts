// Avis après l'événement (docs/01 « Découvrir et participer », Validé) : 1 à 3 étoiles, commentaire obligatoire,
// pseudo affiché ; seuls les participants pointés notent, pendant une semaine après l'événement ; un avis par
// participant et par événement ; réponse publique de l'organisateur ; moyenne affichée à partir d'un minimum d'avis.
import { DAY } from "./time";

/** Note d'un avis : 1 à 3 étoiles. */
export const REVIEW_MIN_RATING = 1;
export const REVIEW_MAX_RATING = 3;

/** Avis possible pendant une semaine après la fin de l'événement. */
export const REVIEW_WINDOW_MS = 7 * DAY;

/** Moyenne affichée à partir de 3 avis (choix du lot 12 : le plus petit nombre qui ne désigne pas une personne). */
export const REVIEW_MIN_COUNT_FOR_AVERAGE = 3;

export function reviewDeadline(event: { endsAt: Date }): Date {
  return new Date(event.endsAt.getTime() + REVIEW_WINDOW_MS);
}

/** Fenêtre ouverte : de la fin de l'événement à J+7 (fin comprise), événement publié (pas annulé). */
export function reviewWindowOpen(event: { endsAt: Date; status: string }, now: Date): boolean {
  return event.status === "published" && now >= event.endsAt && now <= reviewDeadline(event);
}

/** Moyenne arrondie au dixième, ou `null` sous le minimum d'avis. */
export function reviewAverage(ratings: readonly number[]): number | null {
  if (ratings.length < REVIEW_MIN_COUNT_FOR_AVERAGE) return null;
  const sum = ratings.reduce((a, r) => a + r, 0);
  return Math.round((sum / ratings.length) * 10) / 10;
}
