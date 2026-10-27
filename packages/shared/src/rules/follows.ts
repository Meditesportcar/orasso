import type { ProfileVisibility } from "../enums";

// Lot R4c (maquette R4.6), puis lot R6b (D37, Damien le 27/10 : « on fait comme sur Instagram, on abandonne ami ») :
// un seul lien entre passionnés, « Suivre ». Vers un compte public, l'abonnement est accepté tout de suite ; vers un
// compte privé, c'est une demande que la personne accepte ou refuse (sans prévenir). Ce que donnait l'amitié passe aux
// abonnés acceptés. Les listes (abonnés, abonnements, demandes) ne sont visibles que par soi.

/** Taille d'une page des listes du réseau (abonnés, abonnements, demandes). */
export const FOLLOW_PAGE_SIZE = 30;

/** Statut d'un abonnement : accepté, ou demande en attente (compte privé). */
export const followStatuses = ["accepted", "pending"] as const;
export type FollowStatus = (typeof followStatuses)[number];

/** Mon lien vers une personne : aucun, demande en attente, abonnement accepté. */
export type FollowState = "none" | FollowStatus;

/**
 * On peut suivre (ou demander à suivre) toute personne disponible, jamais soi-même. Un compte supprimé, banni ou
 * suspendu n'est pas suivable.
 */
export function canFollowUser(input: {
  isSelf: boolean;
  /** Supprimé, banni ou suspendu en ce moment. */
  unavailable?: boolean;
}): boolean {
  return !input.isSelf && !input.unavailable;
}

/** Un abonnement vers ce compte commence-t-il accepté (public) ou en demande (privé) ? */
export function followStatusFor(visibility: ProfileVisibility): FollowStatus {
  return visibility === "public" ? "accepted" : "pending";
}

/**
 * Le bouton unique du profil d'un membre (maquette R6.1) :
 * - `follow` : « Suivre » (compte public) ;
 * - `follow_back` : « Suivre en retour » (la personne me suit déjà ; demande si son compte est privé) ;
 * - `request` : « Demander à suivre » (compte privé) ;
 * - `following` : « Abonné » (toucher : ne plus suivre, avec confirmation) ;
 * - `requested` : « Demandé » (toucher : annuler la demande) ;
 * - `null` : pas de bouton (soi-même, compte indisponible).
 */
export type FollowButtonKind = "follow" | "follow_back" | "request" | "following" | "requested";

export function followButtonKind(input: {
  canFollow: boolean;
  mine: FollowState;
  followsMe: boolean;
  visibility: ProfileVisibility;
}): FollowButtonKind | null {
  if (input.mine === "accepted") return "following";
  if (input.mine === "pending") return "requested";
  if (!input.canFollow) return null;
  if (input.followsMe) return "follow_back";
  return input.visibility === "public" ? "follow" : "request";
}

/**
 * Décision de Damien (24/10, tour 2) : les nombres (abonnés, abonnements, sorties) sont visibles de tout membre
 * connecté, comme sur Instagram, même pour un compte privé. Les profils restent réservés aux connectés (docs/01) ; les
 * listes restent visibles par soi seul.
 */
export function networkCountsVisible(input: { connected: boolean }): boolean {
  return input.connected;
}

/**
 * Une alerte « … te suit » ou « … demande à te suivre » par paire au plus par 24 h (suivre, ne plus suivre, suivre ;
 * demander, annuler, demander : pas de nouvelle alerte). Lot R6b, tour 2 : comptée sur une trace de la paire
 * (`follow_traces`) que l'annulation n'efface pas, à l'horloge de l'appli.
 */
export const FOLLOW_NOTIFY_WINDOW_MS = 24 * 3_600_000;

/**
 * Lot R6b, tour 2 (choix du coordinateur) : une personne refusée (ou retirée de ses abonnés) peut redemander, et rien ne
 * lui dit qu'elle a été refusée ; mais pendant 30 jours sa nouvelle demande n'envoie aucune alerte : elle apparaît
 * seulement dans Demandes.
 */
export const FOLLOW_DECLINED_QUIET_MS = 30 * 24 * 3_600_000;

/** Texte de la notification regroupée : « Kenji_66 te suit », « Kenji_66 et Lea_11 te suivent », « … et 3 autres ». */
export function followNotificationBody(pseudos: readonly string[], total: number): string {
  const [first, second] = pseudos;
  if (!first) return "";
  if (total <= 1) return `${first} te suit.`;
  if (total === 2 && second) return `${first} et ${second} te suivent.`;
  const others = total - 1;
  return `${first} et ${others} autres personnes te suivent.`;
}

/** « Kenji_66 demande à te suivre. » */
export const followRequestNotificationBody = (pseudo: string) => `${pseudo} demande à te suivre.`;
/** « Julie_66 a accepté ta demande. » */
export const followAcceptedNotificationBody = (pseudo: string) => `${pseudo} a accepté ta demande.`;
