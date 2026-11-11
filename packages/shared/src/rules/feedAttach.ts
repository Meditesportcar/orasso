// Rattachement d'une publication à un événement (vague R8, lot R8a1, ARCHITECTURE-R8 § 2.3) : le rôle est **déduit des
// droits** au moment de publier, jamais reçu du client. Règles pures : `now` est toujours passé.

/** Rôle d'un rattachement : organisateur (« pour le »), sur place (« présent au »), passionné (« sera au », « était au »). */
export const feedEventRoles = ["organizer", "on_site", "attendee"] as const;
export type FeedEventRole = (typeof feedEventRoles)[number];

/** Motif obligatoire d'une « Info importante ». */
export const importantReasons = ["schedule", "access", "safety", "weather", "other"] as const;
export type ImportantReason = (typeof importantReasons)[number];

/** Avant, pendant ou après l'événement. */
export type FeedAttachPhase = "before" | "running" | "after";

/** Fenêtre après la fin d'un événement pendant laquelle on peut encore s'y rattacher (jours). */
export const ATTACH_AFTER_DAYS = 30;
/** Plafond d'une « Info importante » : par jour et par semaine, par événement (jour et semaine civils de Paris, lundi). */
export const IMPORTANT_PER_DAY = 1;
export const IMPORTANT_PER_WEEK = 3;
/** Longueur de la légende : passionné / casquette. */
export const FEED_CAPTION_PERSONA_MAX = 2000;
/** Longueur du lieu libre d'une publication hors événement. */
export const FEED_PLACE_LABEL_MAX = 80;
/** Nombre d'événements rattachables rendus au plus. */
export const ATTACHABLE_EVENTS_MAX = 50;

export type AttachableWindowEvent = { startsAt: Date; endsAt: Date; status: string };
