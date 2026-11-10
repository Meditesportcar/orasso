// « Partager > En message » (lot R7f4, tour 2) : la logique commune au site et à l'appli, pure pour être testée.
// - Les conversations où l'on peut poser un lien : à deux ou en crew, de mon côté, non closes.
// - La liste se lit page par page : « Aucune conversation » ne se dit que lorsque toutes les pages sont lues.
// - Un envoi repris après une réponse perdue garde son identifiant (l'API ne crée pas un second message).
import type { ConversationPage, ConversationSummary } from "./schemas/messaging";

/** Une conversation où l'on peut envoyer un lien partagé. */
export const isShareTarget = (c: Pick<ConversationSummary, "kind" | "side" | "closedAt">): boolean =>
  (c.kind === "direct" || c.kind === "crew") && c.side === "member" && !c.closedAt;

export type ShareTargets = { items: ConversationSummary[]; next: string | null; loaded: boolean };
export const noShareTargets: ShareTargets = { items: [], next: null, loaded: false };

/** Ajoute une page lue (les conversations admissibles seulement, sans doublon) et retient le curseur de la suivante. */
export function addShareTargets(state: ShareTargets, page: ConversationPage): ShareTargets {
  const seen = new Set(state.items.map((c) => c.id));
  const fresh = page.items.filter((c) => isShareTarget(c) && !seen.has(c.id));
  return { items: [...state.items, ...fresh], next: page.nextCursor, loaded: true };
}

/** « Aucune conversation » seulement si la liste est vraiment vide : lue en entier, sans page à venir. */
export const shareTargetsEmpty = (state: ShareTargets): boolean =>
  state.loaded && state.next === null && state.items.length === 0;

/**
 * Identifiants d'envoi par destinataire : le même tant que l'envoi n'a pas abouti (une réponse perdue repart avec le
 * même identifiant), un nouveau après un envoi réussi.
 */
export function retryIds(make: () => string) {
  const ids = new Map<string, string>();
  return {
    get(key: string): string {
      let id = ids.get(key);
      if (!id) {
        id = make();
        ids.set(key, id);
      }
      return id;
    },
    done(key: string): void {
      ids.delete(key);
    },
  };
}
