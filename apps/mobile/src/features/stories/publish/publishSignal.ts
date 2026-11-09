// « Ta story vient de partir » (lot R7f3) : l'écran de publication le dit, la barre de stories du Fil (lot R7f2) s'y abonne
// pour relire sa liste et mettre ta story en tête (`story.ready`), sans attendre le prochain rafraîchissement. En mémoire
// seulement, jamais écrit sur l'appareil.
type Listener = (story: { id: string }) => void;

const listeners = new Set<Listener>();
let lastId: string | null = null;

export function markStoryPublished(story: { id: string }): void {
  lastId = story.id;
  for (const fn of [...listeners]) fn(story);
}

/** S'abonne ; rend la fonction qui se désabonne. */
export function onStoryPublished(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** La dernière story publiée pendant cette session (pour un écran monté après coup), ou `null`. */
export const lastPublishedStoryId = (): string | null => lastId;

/** Déconnexion, changement de compte : on n'en garde rien. */
export function forgetPublishedStory(): void {
  lastId = null;
}
