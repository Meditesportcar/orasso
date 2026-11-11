// Lot R8n1 : les listes de l'Essentiel, dans un fichier sans dépendance (lues par `notifications.ts` et par
// `eventNotifications.ts`, qui se lisent l'une l'autre sinon). Réexportées par `eventNotifications.ts`.
import type { NotificationType } from "../enums";

/** Décisions sur la candidature de la personne : elles lui parlent d'elle-même, même refusée (pas de condition de place). */
export const applicationDecisionTypes = [
  "application_accepted",
  "application_waitlisted",
  "application_refused",
  "offer_received",
] as const satisfies readonly NotificationType[];

/**
 * L'Essentiel : liste fermée. Y ajouter un type est une décision de produit (un type mal classé devient du bruit que
 * personne ne peut couper) : le test de la règle fige la liste. `offer_received` (« Place proposée », durée limitée) est un
 * ajout du lot R8n1, à revoir avec Damien. `event_announcement`, `event_reminder_week`, `new_event_followed`… restent
 * coupables.
 */
export const essentialNotificationTypes = [
  "event_updated",
  "schedule_change",
  "event_cancelled",
  "event_outlook_changed",
  "event_reminder_eve",
  "event_instructions",
  "event_important",
  ...applicationDecisionTypes,
] as const satisfies readonly NotificationType[];
