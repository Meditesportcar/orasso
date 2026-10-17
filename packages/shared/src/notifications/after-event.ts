import type { NotificationFamily } from "../enums";

/**
 * Après l'événement et badge de structure (lot 27, ARCHITECTURE-SUITE § 11). Aux organisateurs (famille `staff`, qui ne
 * se coupe pas) : bilan prêt, remerciement à envoyer, badge qui expire ou suspendu. Aux présents : un élément du
 * Journal « Merci » (famille `event`) qui porte le lien d'avis, sans push ni e-mail (le message groupé de remerciement
 * a déjà son push dans la Boîte).
 */
export const afterEventNotificationTypes = {
  event_report_ready: "staff",
  event_thanks_suggested: "staff",
  event_thanks: "event",
  structure_badge_expiring: "staff",
  structure_badge_suspended: "staff",
} as const satisfies Record<string, NotificationFamily>;

/** E-mail même quand un appareil reçoit le push : le badge est une échéance qu'on ne doit pas rater (docs/01). */
export const afterEventEmailAlwaysTypes = ["structure_badge_expiring", "structure_badge_suspended"] as const;

/** Élément du Journal seulement (ni push, ni e-mail, livré tout de suite). */
export const afterEventJournalOnlyTypes: readonly string[] = ["event_thanks"];

/**
 * Jamais d'e-mail de repli : bilan et suggestion de remerciement sont un confort (push et Journal), comme les
 * annonces (budget Brevo de 300 e-mails par jour).
 */
export const afterEventNoEmailTypes: readonly string[] = ["event_report_ready", "event_thanks_suggested"];

export const afterEventNotificationLabels: Record<keyof typeof afterEventNotificationTypes, string> = {
  event_report_ready: "Bilan d'un événement prêt",
  event_thanks_suggested: "Remerciement à envoyer",
  event_thanks: "Remerciement d'un organisateur",
  structure_badge_expiring: "Badge de structure qui expire",
  structure_badge_suspended: "Structure suspendue faute de renouvellement",
};
