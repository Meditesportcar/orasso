import type { NotificationFamily } from "../enums";

/**
 * Administration (lot 33, ARCHITECTURE-SUITE § 16). Réinitialisation de la double authentification par l'équipe (A5) :
 * famille `account`, e-mail toujours (gabarit de sécurité : il passe dans la réserve du budget d'e-mails). Véhicule
 * « Autre » rattaché au référentiel : famille `social` comme le reste du garage partagé. Demandes d'aide (mode
 * assistance, S41) : famille `staff` (outil de gestion, jamais coupée).
 */
export const adminNotificationTypes = {
  security_two_factor_reset: "account",
  vehicle_reassigned: "social",
  assistance_requested: "staff",
  assistance_closed: "staff",
} as const satisfies Record<string, NotificationFamily>;

export const adminEmailAlwaysTypes = ["security_two_factor_reset"] as const;

export const adminNotificationLabels: Record<keyof typeof adminNotificationTypes, string> = {
  security_two_factor_reset: "Double authentification réinitialisée par l'équipe",
  vehicle_reassigned: "Véhicule rattaché au référentiel",
  assistance_requested: "Demande d'aide d'un organisateur",
  assistance_closed: "Demande d'aide close",
};
