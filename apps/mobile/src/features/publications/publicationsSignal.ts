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
