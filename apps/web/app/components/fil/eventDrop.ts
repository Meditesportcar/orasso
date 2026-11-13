// Petit lot site (P14a) : quand l'événement choisi d'une publication est retiré de la saisie parce que la liste relue ne le
// contient plus. Pur, pour être testé.

export function mustDropChosenEvent(input: {
  /** Un envoi figé en attente de vérification existe : « Réessayer » renvoie son corps, la saisie affichée ne bouge pas. */
  uncertain: boolean;
  chosenEventId: string | null;
  /** La liste relue pour ce compte et cet auteur (`null` : pas encore lue ou d'un autre contexte). */
  readableIds: readonly string[] | null;
}): boolean {
  if (input.uncertain || !input.chosenEventId || !input.readableIds) return false;
  return !input.readableIds.includes(input.chosenEventId);
}

/**
 * L'événement à afficher. Normalement celui de la liste relue. Pendant un envoi incertain, si la liste ne l'a plus (plus
 * rattachable), celui gardé avec le corps : « Réessayer » renvoie ce corps avec son `eventId`, l'écran doit le dire.
 */
export function shownEvent<T extends { id: string }>(input: {
  listed: T | null;
  uncertainEventId: string | null;
  held: T | null;
}): T | null {
  if (input.listed) return input.listed;
  if (input.uncertainEventId && input.held && input.held.id === input.uncertainEventId) return input.held;
  return null;
}
