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
