import type { NotificationFamily } from "../enums";

/**
 * Modération (lot 32, § 15.2) : famille `account` (jamais coupée, livrée tout de suite, même pendant les heures calmes),
 * e-mail toujours. `moderation_priority_alert` : suspension automatique, aux modérateurs et au super administrateur.
 */
export const moderationNotificationTypes = {
  sanction_received: "account",
  report_handled: "account",
  sanction_contest_decided: "account",
  sanction_lifted: "account",
  moderation_priority_alert: "account",
} as const satisfies Record<string, NotificationFamily>;

export const moderationEmailAlwaysTypes = [
  "sanction_received",
  "report_handled",
  "sanction_contest_decided",
  "sanction_lifted",
  "moderation_priority_alert",
] as const;

export const moderationNotificationLabels: Record<keyof typeof moderationNotificationTypes, string> = {
  sanction_received: "Sanction reçue",
  report_handled: "Signalement traité",
  sanction_contest_decided: "Décision sur ma contestation",
  sanction_lifted: "Sanction levée",
  moderation_priority_alert: "Alerte prioritaire de modération",
};
