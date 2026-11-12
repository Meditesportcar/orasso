// Une publication supprimée : les listes de profil encore montées la retirent (même mécanique que l'appli).
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
