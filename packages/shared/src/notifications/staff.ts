import type { NotificationFamily } from "../enums";

/** Staff et organisateurs : relances, alertes, compte Stripe de la structure. La famille `staff` ne se coupe pas. */
export const staffNotificationTypes = {
  staff_presence_reminder: "staff",
  staff_sync_reminder: "staff",
  staff_alert: "staff",
  stripe_account_changed: "staff",
} as const satisfies Record<string, NotificationFamily>;

export const staffEmailAlwaysTypes = ["staff_presence_reminder"] as const;

/** Libellés des types (réglages des notifications). */
export const staffNotificationLabels: Record<keyof typeof staffNotificationTypes, string> = {
  staff_presence_reminder: "Relance « je suis là »",
  staff_sync_reminder: "Synchronisation du mode staff",
  staff_alert: "Alerte du staff",
  stripe_account_changed: "Compte Stripe de la structure",
};
