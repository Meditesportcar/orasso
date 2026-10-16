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
