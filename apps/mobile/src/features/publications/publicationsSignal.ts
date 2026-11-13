// Une publication supprimée depuis sa page : les listes de profil encore montées sous elle la retirent (la page seule est une
// couche au-dessus du profil, qui ne se relit pas tout seul au retour).
const listeners = new Set<(id: string) => void>();

export function notifyPostRemoved(id: string): void {
  for (const listener of listeners) listener(id);
}

/** S'abonner aux suppressions ; rend la désinscription. */
export function onPostRemoved(listener: (id: string) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Une publication dont la collaboration change (co-auteur retiré, invitation annulée) : les listes de profil encore montées se
// relisent (la publication peut quitter l'une et rester dans l'autre) ; la page seule aussi.
const changed = new Set<(id: string) => void>();

export function notifyPostChanged(id: string): void {
  for (const listener of changed) listener(id);
}

/** S'abonner aux changements de collaboration ; rend la désinscription. */
export function onPostChanged(listener: (id: string) => void): () => void {
  changed.add(listener);
  return () => {
    changed.delete(listener);
  };
}
