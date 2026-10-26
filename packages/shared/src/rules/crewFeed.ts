// Fil d'un crew (lot R5c1, maquettes R5.7 et R5.10, décision D36 du 26/10) : publications (photos, texte, sondage),
// flamme, commentaires, événements automatiques. Tout est réservé aux membres actifs du crew : les photos ne sortent
// jamais du crew (ni profil, ni vitrine, ni recherche, ni Explorer, ni affiche, ni notification, ni e-mail).

/** Texte d'une publication. */
export const CREW_POST_TEXT_MAX = 500;
/** Photos d'une publication : 1 à 6, format d'origine (jamais recadrées au carré, D36). */
export const CREW_POST_PHOTOS_MAX = 6;
/** Côté le plus long d'une photo du fil, après recompression par l'API. */
export const CREW_POST_PHOTO_SIDE = 2048;
export const CREW_COMMENT_MAX = 300;
/** Sondage : une question, 2 à 6 réponses, un seul choix, une date de fin facultative. */
export const CREW_POLL_QUESTION_MAX = 120;
export const CREW_POLL_OPTION_MAX = 60;
export const CREW_POLL_OPTIONS_MIN = 2;
export const CREW_POLL_OPTIONS_MAX = 6;
/** Une date de fin au plus 90 jours après la publication (journal des choix, lot R5c1). */
export const CREW_POLL_MAX_DAYS = 90;
/** Publications et événements par page du fil. */
export const CREW_FEED_PAGE = 20;
/** Commentaires par page de la feuille. */
export const CREW_COMMENTS_PAGE = 50;

export const crewPostKinds = ["photo", "text", "poll"] as const;
export type CrewPostKind = (typeof crewPostKinds)[number];

/** Un sondage reçoit des voix tant qu'il n'est ni clos par son auteur ou le chef, ni arrivé à sa date de fin. */
export function crewPollOpen(
  poll: { closedAt: Date | string | null; endsAt: Date | string | null },
  now: Date,
): boolean {
  if (poll.closedAt) return false;
  if (!poll.endsAt) return true;
  return new Date(poll.endsAt).getTime() > now.getTime();
}

/** Retirer une publication ou un commentaire : son auteur, ou le chef du crew. */
export function canRemoveCrewContent(authorId: string | null, viewer: { userId: string; leader: boolean }): boolean {
  return viewer.leader || (authorId !== null && authorId === viewer.userId);
}

/** Part d'une réponse en pourcentage entier (barres du sondage) ; 0 sans voix. */
export function pollShare(votes: number, total: number): number {
  return total > 0 ? Math.round((votes / total) * 100) : 0;
}

/**
 * Forme du cadre des photos d'une publication (appli et site) : celle de la première photo, bornée entre 4:5 et
 * 1,91:1. Chaque photo s'y loge entière (jamais recadrée, D36), sur fond sombre.
 */
export function crewPhotoFrameRatio(photo: { width: number; height: number } | undefined): number {
  if (!photo || photo.width <= 0 || photo.height <= 0) return 1;
  return Math.min(1.91, Math.max(4 / 5, photo.width / photo.height));
}

/**
 * Tour 2 : commentaires fusionnés par identifiant (une page qui arrive après un envoi ne double rien) et rangés dans
 * l'ordre chronologique, au-delà des 50 de la première page.
 */
export function mergeCrewComments<T extends { id: string; createdAt: string }>(
  current: readonly T[],
  incoming: readonly T[],
): T[] {
  const byId = new Map(current.map((c) => [c.id, c]));
  for (const c of incoming) byId.set(c.id, c);
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

/** Date de fin acceptée : dans le futur, et au plus `CREW_POLL_MAX_DAYS` jours plus tard. */
export function pollEndsAtValid(endsAt: Date, now: Date): boolean {
  const t = endsAt.getTime();
  return t > now.getTime() && t <= now.getTime() + CREW_POLL_MAX_DAYS * 86_400_000;
}
