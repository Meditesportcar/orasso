// Le Fil : l'écran « Publier au Fil » signale qu'une publication est partie ; le Fil se relit à son retour à l'écran, et
// la garde en tête de la liste affichée (l'API ne met jamais mes propres publications dans « Abonnements » : lot R7e2,
// tour 2). La carte tient dans ce module le temps de la session de l'appli ; un changement de compte la jette.
import { type FeedCard, type FeedPostView, publishedCard } from "@orasso/shared";

let dirty = false;
/** Lot R9n (tour 1) : chaque publication est rangée avec l'acteur au nom duquel elle est partie (`null` : la personne). */
let mine: { actor: string | null; card: FeedCard }[] = [];

/** Une publication vient de partir : `post` est la réponse de `POST /me/feed-posts` (sa carte passera en tête du Fil). */
export function markFeedDirty(post?: FeedPostView, actor: string | null = null): void {
  dirty = true;
  if (post) {
    mine = [
      { actor, card: publishedCard(post) },
      ...mine.filter((m) => m.card.id !== `feed_post:${post.id}`),
    ];
  }
}

/** Vrai une seule fois après `markFeedDirty`. */
export function takeFeedDirty(): boolean {
  const was = dirty;
  dirty = false;
  return was;
}

/**
 * Mes publications de cette session pour ce Fil, la plus récente d'abord (cartes prêtes pour `withMyPublished`) : un Fil ne reprend
 * que celles de son acteur (le Fil de la structure n'affiche jamais une publication personnelle, ni l'inverse).
 */
export const myPublishedCards = (actor: string | null = null): FeedCard[] =>
  mine.filter((m) => m.actor === actor).map((m) => m.card);

/** Une publication supprimée, ou un autre compte : elle ne reste pas en tête. */
export function forgetMyPublished(id?: string): void {
  mine = id ? mine.filter((m) => m.card.id !== id) : [];
}
