// La grille d'un vote (lot R7l3) : l'ordre des candidats. Pur, testé seul.
import type { VoteCandidate } from "@orasso/shared";

/**
 * Ordre de la grille : stable et sans rapport avec le classement (une grille triée par voix pousserait à voter pour le
 * premier). Les numéros « N° 1 » suivent cet ordre ; les candidats pas encore entrés (grisés) passent en dernier.
 */
export function gridOrder(entries: readonly VoteCandidate[]): VoteCandidate[] {
  return [...entries].sort(
    (a, b) => Number(b.eligible) - Number(a.eligible) || a.applicationId.localeCompare(b.applicationId),
  );
}
