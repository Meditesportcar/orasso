import type { SheetState } from "@orasso/shared";

// Petit lot site (P30b) : le parent d'une réponse, retrouvé dans la feuille AVANT son retrait (après, plus rien ne le dit).
// Un commentaire de premier niveau, ou inconnu de la feuille : `null`.
export function parentOfReply(state: Pick<SheetState, "replies">, commentId: string): string | null {
  for (const [parentId, r] of Object.entries(state.replies)) {
    if (r.items.some((c) => c.id === commentId)) return parentId;
  }
  return null;
}

/**
 * Que faire du parent après la suppression d'une réponse ? Le DELETE rend le compteur du parent (`parent`) : il suffit.
 * Sans lui (204 : parent devenu illisible ou déjà supprimé), la discussion du parent est relue.
 */
export function parentToReread(parentId: string | null, answered: { parent?: unknown } | null | undefined) {
  return parentId !== null && !answered?.parent ? parentId : null;
}
