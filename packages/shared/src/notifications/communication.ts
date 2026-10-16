import type { NotificationFamily } from "../enums";

/**
 * Communication de l'organisateur (lot 20). `event_announcement` (famille `event`) : annonce publiée avec « prévenir
 * les inscrits », en push et au Journal. `structure_announcement` (famille `social`) : annonce publique d'une structure
 * suivie, au Journal seulement (actualité, ni push ni e-mail).
 */
export const communicationNotificationTypes = {
  event_announcement: "event",
  structure_announcement: "social",
} as const satisfies Record<string, NotificationFamily>;

/** Actualités du Journal (ni push ni e-mail, livrées tout de suite). */
export const communicationJournalOnlyTypes: readonly string[] = ["structure_announcement"];

/**
 * Jamais d'e-mail de repli, même sans appareil enregistré (quota Brevo de 300 e-mails par jour, et docs/01 : « les
 * notifications remplacent autant que possible les e-mails ») : push et Journal seulement. Les consignes, annonces et
 * changements de statut partent à des centaines d'inscrits d'un coup. `event_cancelled` garde son e-mail (rare, et la
 * personne ne doit pas se déplacer pour rien).
 */
export const communicationNoEmailTypes: readonly string[] = [
  "event_announcement",
  "event_instructions",
  "event_outlook_changed",
];

export const communicationNotificationLabels: Record<keyof typeof communicationNotificationTypes, string> = {
  event_announcement: "Annonce d'un événement où je suis inscrit",
  structure_announcement: "Annonce d'un organisateur suivi",
};
