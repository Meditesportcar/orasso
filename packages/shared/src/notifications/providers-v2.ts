import type { NotificationFamily } from "../enums";

/**
 * Prestataires v2 (lot 46, ARCHITECTURE-DA-V2 § 5.8) : emplacement attribué et avis reçu (le prestataire, famille
 * `event`) ; candidature sur une mission (les organisateurs, famille `staff`, jamais coupée).
 */
export const providersV2NotificationTypes = {
  provider_spot_assigned: "event",
  provider_review_received: "event",
  need_application_received: "staff",
} as const satisfies Record<string, NotificationFamily>;

/** Libellés des types (réglages des notifications). */
export const providersV2NotificationLabels: Record<keyof typeof providersV2NotificationTypes, string> = {
  provider_spot_assigned: "Emplacement attribué",
  provider_review_received: "Avis d'un organisateur",
  need_application_received: "Candidature sur une mission",
};
