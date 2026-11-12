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

// Une publication dont la collaboration change (co-auteur retiré, invitation annulée) : les listes de profil encore montées se
// relisent (la publication peut quitter l'une et rester dans l'autre).
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

/**
 * Après un changement de collaboration de `postId`, lance `run` une fois `delay` ms plus tard (un nouveau changement
 * repousse l'échéance). Rend l'arrêt : il annule aussi l'échéance en cours (petit lot site, P41).
 */
export function afterPostChanged(postId: string | null, run: () => void, delay: number): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const off = onPostChanged((id) => {
    if (id !== postId) return;
    clearTimeout(timer);
    timer = setTimeout(run, delay);
  });
  return () => {
    off();
    clearTimeout(timer);
  };
}
