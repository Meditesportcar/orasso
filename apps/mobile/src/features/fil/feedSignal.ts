// Le Fil : l'écran « Publier au Fil » signale qu'une publication est partie ; le Fil se relit à son retour à l'écran.
let dirty = false;

export function markFeedDirty(): void {
  dirty = true;
}

/** Vrai une seule fois après `markFeedDirty`. */
export function takeFeedDirty(): boolean {
  const was = dirty;
  dirty = false;
  return was;
}
