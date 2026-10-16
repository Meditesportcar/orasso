import type { NotificationFamily } from "../enums";

/** Candidatures : décision du tri, offres de la liste d'attente. */
export const applicationNotificationTypes = {
  application_accepted: "application",
  application_waitlisted: "application",
  application_refused: "application",
  offer_received: "application",
  offer_expired: "application",
} as const satisfies Record<string, NotificationFamily>;

/** Libellés des types (réglages des notifications). */
export const applicationNotificationLabels: Record<keyof typeof applicationNotificationTypes, string> = {
  application_accepted: "Candidature retenue",
  application_waitlisted: "Liste d'attente",
  application_refused: "Candidature refusée",
  offer_received: "Place proposée",
  offer_expired: "Place proposée expirée",
};
