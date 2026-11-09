// Les affichages d'une carte « Sponsorisé » (lot R7k2) : un emplacement est compté **une fois par session** de l'appli
// (l'API limite à 600 affichages par heure et par personne : un parcours de plusieurs pages ne doit pas la saturer).
// La clé est `sponsoredSessionKey(compte, emplacement)` : compte, jour de Paris et emplacement (tour 2).
// `sent` : déjà envoyé (ou en cours d'envoi) ; `refused` : l'API a répondu 409 (plafond atteint) ou 404 (emplacement
// arrêté), la carte ne s'affiche plus. Un échec passager libère l'emplacement pour un nouvel essai.
const sent = new Set<string>();
const refused = new Set<string>();

/** Réserve l'envoi de l'affichage ; faux si l'emplacement a déjà été envoyé ou refusé dans cette session. */
export function claimImpression(placementId: string): boolean {
  if (sent.has(placementId) || refused.has(placementId)) return false;
  sent.add(placementId);
  return true;
}

/** L'envoi a échoué sans réponse de l'API (réseau) : un autre essai est permis. */
export function releaseImpression(placementId: string): void {
  sent.delete(placementId);
}

/** L'API a refusé (409, 404) : l'emplacement ne revient pas dans cette session. */
export function refuseImpression(placementId: string): void {
  refused.add(placementId);
}

/**
 * Une carte compte comme vue quand son centre est dans la zone visible de la page (`top`, `bottom` : positions à l'écran,
 * sous la bande ORASSO et au-dessus de la barre d'onglets) : au moins la moitié de la carte est alors à la vue, et rien
 * de ce qui est caché dessous ne compte.
 */
export function countsAsSeen(y: number, height: number, top: number, bottom: number): boolean {
  if (!(height > 0) || !(bottom > top)) return false;
  const middle = y + height / 2;
  return middle >= top && middle <= bottom;
}

export const isImpressionRefused = (placementId: string): boolean => refused.has(placementId);

/** Pour les tests : remet la session à zéro. */
export function resetSponsoredSession(): void {
  sent.clear();
  refused.clear();
}

/** Un refus de l'API qui retire la carte : plafond atteint (409) ou emplacement arrêté (404). */
export const isRefusalStatus = (status: number | undefined): boolean => status === 409 || status === 404;
