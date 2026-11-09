// Les affichages d'une carte « Sponsorisé » sur le site (lot R7k2) : un emplacement est compté une seule fois par page
// ouverte (mêmes règles que l'appli : `features/fil/cards/sponsoredSession.ts`). La clé est
// `sponsoredSessionKey(compte, emplacement)` : compte, jour de Paris et emplacement (tour 2).
// Tour 3 : la session, la règle de visibilité, les reprises après une panne et l'attente d'un clic derrière l'affichage
// sont communes à l'appli et au site (`@orasso/shared`, `rules/sponsoredImpressions`) ; ce module en garde l'instance.
import { countsAsSeen, createImpressionSession, isSponsoredRefusal } from "@orasso/shared";

export const impressionSession = createImpressionSession();

/** Réserve l'envoi de l'affichage ; faux si l'emplacement a déjà été envoyé ou refusé sur cette page. */
export const claimImpression = impressionSession.claim;

/** L'envoi a échoué sans réponse de l'API (réseau) : un autre essai est permis. */
export const releaseImpression = impressionSession.release;

export const refuseImpression = impressionSession.refuse;

export const isImpressionRefused = impressionSession.isRefused;

/** Pour les tests. */
export const resetSponsoredSession = impressionSession.reset;

/** Une carte compte comme vue à 50 % de sa hauteur dans la zone utile (30 % pour une carte plus haute que la zone). */
export { countsAsSeen };

/** Un refus de l'API qui retire la carte : plafond atteint (409) ou emplacement arrêté (404). */
export const isRefusalStatus = isSponsoredRefusal;
