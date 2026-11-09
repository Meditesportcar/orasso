// Les affichages d'une carte « Sponsorisé » (lot R7k2) : un emplacement est compté **une fois par session** de l'appli
// (l'API limite à 600 affichages par heure et par personne : un parcours de plusieurs pages ne doit pas la saturer).
// La clé est `sponsoredSessionKey(compte, emplacement)` : compte, jour de Paris et emplacement (tour 2).
// Tour 3 : la session, la règle de visibilité, les reprises après une panne et l'attente d'un clic derrière l'affichage
// sont communes à l'appli et au site (`@orasso/shared`, `rules/sponsoredImpressions`) ; ce module en garde l'instance.
import { countsAsSeen, createImpressionSession, isSponsoredRefusal } from "@orasso/shared";

export const impressionSession = createImpressionSession();

/** Réserve l'envoi de l'affichage ; faux si l'emplacement a déjà été envoyé ou refusé dans cette session. */
export const claimImpression = impressionSession.claim;

/** L'envoi a échoué sans réponse de l'API (réseau) : un autre essai est permis. */
export const releaseImpression = impressionSession.release;

/** L'API a refusé (409, 404) : l'emplacement ne revient pas dans cette session. */
export const refuseImpression = impressionSession.refuse;

export const isImpressionRefused = impressionSession.isRefused;

/** Pour les tests : remet la session à zéro. */
export const resetSponsoredSession = impressionSession.reset;

/** Une carte compte comme vue à 50 % de sa hauteur dans la zone utile (30 % pour une carte plus haute que la zone). */
export { countsAsSeen };

/** Un refus de l'API qui retire la carte : plafond atteint (409) ou emplacement arrêté (404). */
export const isRefusalStatus = isSponsoredRefusal;
