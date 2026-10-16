import type { NotificationFamily } from "../enums";

/** Événements : changements, rappels, avant-première, nouveaux événements. */
export const eventNotificationTypes = {
  event_updated: "event",
  event_cancelled: "event",
  event_outlook_changed: "event",
  event_instructions: "event",
  event_reminder_eve: "event",
  event_reminder_week: "event",
  preview_open: "event",
  new_event_followed: "event",
  event_nearby_interest: "event",
} as const satisfies Record<string, NotificationFamily>;

/** Envoyés par e-mail même quand un appareil reçoit le push (docs/01 « Rappel par e-mail… toujours »). */
export const eventEmailAlwaysTypes = ["event_reminder_week"] as const;

/** Libellés des types (réglages des notifications). */
export const eventNotificationLabels: Record<keyof typeof eventNotificationTypes, string> = {
  event_updated: "Événement modifié",
  event_cancelled: "Événement annulé",
  event_outlook_changed: "Maintenu ou incertain",
  event_instructions: "Consignes de l'organisateur",
  event_reminder_eve: "Rappel la veille",
  event_reminder_week: "Rappel une semaine avant",
  preview_open: "Avant-première ouverte",
  new_event_followed: "Nouvel événement d'un organisateur suivi",
  event_nearby_interest: "Événement près de chez toi",
};
