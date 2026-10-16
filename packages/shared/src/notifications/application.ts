import type { NotificationFamily } from "../enums";

/** Candidatures : décision du tri, offres de la liste d'attente. */
export const applicationNotificationTypes = {
  application_accepted: "application",
  application_waitlisted: "application",
  application_refused: "application",
  offer_received: "application",
  offer_expired: "application",
} as const satisfies Record<string, NotificationFamily>;
