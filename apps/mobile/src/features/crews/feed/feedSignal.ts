// Fil d'un crew (lot R5c1) : l'écran « Publier dans le crew » signale qu'une publication est partie ; le fil du crew se
// relit à son retour à l'écran (sans attendre l'échéance de revalidation de `usePaged`).
const dirty = new Set<string>();

export function markCrewFeedDirty(crewId: string): void {
  dirty.add(crewId);
}

/** Vrai une seule fois après `markCrewFeedDirty`. */
export function takeCrewFeedDirty(crewId: string): boolean {
  return dirty.delete(crewId);
}
