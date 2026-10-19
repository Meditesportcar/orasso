import type { NotificationFamily } from "../enums";

/**
 * Média et accréditation presse (lot 45, ARCHITECTURE-DA-V2 § 5.1) : famille `staff` pour l'organisation (une demande
 * à trancher), `event` pour le média (décision, contenu mis en avant).
 */
export const mediaNotificationTypes = {
  accreditation_requested: "staff",
  accreditation_accepted: "event",
  accreditation_refused: "event",
  media_content_featured: "event",
} as const satisfies Record<string, NotificationFamily>;

/** Libellés des types (réglages des notifications). */
export const mediaNotificationLabels: Record<keyof typeof mediaNotificationTypes, string> = {
  accreditation_requested: "Demande d'accréditation presse",
  accreditation_accepted: "Accréditation presse acceptée",
  accreditation_refused: "Accréditation presse refusée",
  media_content_featured: "Contenu mis en avant",
};
