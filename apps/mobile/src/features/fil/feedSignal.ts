// Le Fil : l'écran « Publier au Fil » signale qu'une publication est partie ; le Fil se relit à son retour à l'écran, et
// la garde en tête de la liste affichée (l'API ne met jamais mes propres publications dans « Abonnements » : lot R7e2,
// tour 2). La carte tient dans ce module le temps de la session de l'appli ; un changement de compte la jette.
import { type FeedCard, type FeedPostView, publishedCard } from "@orasso/shared";

let dirty = false;
let mine: FeedCard[] = [];

/** Une publication vient de partir : `post` est la réponse de `POST /me/feed-posts` (sa carte passera en tête du Fil). */
export function markFeedDirty(post?: FeedPostView): void {
  dirty = true;
  if (post) mine = [publishedCard(post), ...mine.filter((c) => c.id !== `feed_post:${post.id}`)];
}

/** Vrai une seule fois après `markFeedDirty`. */
export function takeFeedDirty(): boolean {
  const was = dirty;
  dirty = false;
  return was;
}

/** Mes publications de cette session, la plus récente d'abord (cartes prêtes pour `withMyPublished`). */
export const myPublishedCards = (): FeedCard[] => mine;

/** Une publication supprimée, ou un autre compte : elle ne reste pas en tête. */
export function forgetMyPublished(id?: string): void {
  mine = id ? mine.filter((c) => c.id !== id) : [];
}
