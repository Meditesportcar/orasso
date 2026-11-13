// Le commentaire de premier niveau sous lequel une réponse est affichée (lot « Petit lot appli », P30a) : à lire **avant** de retirer la
// réponse de la feuille, pour savoir quelle discussion relire quand le serveur ne rend pas le compteur du parent (DELETE en 204).
import type { SheetState } from "@orasso/shared";

/** L'identifiant du parent de cette réponse, ou `null` (commentaire de premier niveau, ou inconnu de la feuille). */
export function replyParentOf(state: Pick<SheetState, "replies">, commentId: string): string | null {
  for (const [parentId, r] of Object.entries(state.replies))
    if (r.items.some((c) => c.id === commentId)) return parentId;
  return null;
}
