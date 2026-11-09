// Les affichages d'une carte « Sponsorisé » sur le site (lot R7k2) : un emplacement est compté une seule fois par page
// ouverte (mêmes règles que l'appli : `features/fil/cards/sponsoredSession.ts`). `sent` : déjà envoyé ou en cours ;
// `refused` : l'API a répondu 409 (plafond atteint) ou 404 (emplacement arrêté), la carte ne s'affiche plus. La clé est
// `sponsoredSessionKey(compte, emplacement)` : compte, jour de Paris et emplacement (tour 2).
const sent = new Set<string>();
const refused = new Set<string>();

/** Réserve l'envoi de l'affichage ; faux si l'emplacement a déjà été envoyé ou refusé sur cette page. */
export function claimImpression(placementId: string): boolean {
  if (sent.has(placementId) || refused.has(placementId)) return false;
  sent.add(placementId);
  return true;
}

/** L'envoi a échoué sans réponse de l'API (réseau) : un autre essai est permis. */
export function releaseImpression(placementId: string): void {
  sent.delete(placementId);
}

export function refuseImpression(placementId: string): void {
  refused.add(placementId);
}

export const isImpressionRefused = (placementId: string): boolean => refused.has(placementId);

/** Pour les tests. */
export function resetSponsoredSession(): void {
  sent.clear();
  refused.clear();
}

/** Un refus de l'API qui retire la carte : plafond atteint (409) ou emplacement arrêté (404). */
export const isRefusalStatus = (status: number): boolean => status === 409 || status === 404;
