// Communication de l'organisateur (lot 20, ARCHITECTURE-SUITE § 5) : énumérations communes à l'API, au site et à
// l'appli. Règles pures : `rules/templates.ts` ; entrées et vues : `schemas/communication.ts` ; libellés :
// `labels/communication.fr.ts`.

/**
 * Entrée du fil de l'événement : annonce de l'organisateur, consignes envoyées, changement de statut (automatique :
 * Maintenu / Incertain / Annulé), information d'Orasso.
 */
export const announcementKinds = ["announcement", "instructions", "status_change", "system"] as const;
export type AnnouncementKind = (typeof announcementKinds)[number];

/** `public` : tout le monde, même sans compte ; `participants` : retenus (véhicules et prestataires) et la structure. */
export const announcementAudiences = ["public", "participants"] as const;
export type AnnouncementAudience = (typeof announcementAudiences)[number];

/**
 * Segments d'un message groupé (docs/01 : acceptés, liste d'attente, prestataires, staff, abonnés de la structure ;
 * ARCHITECTURE-SUITE § 5.2 ajoute les candidatures à trier et les entrés). Tous sauf `staff` et `followers` exigent un
 * événement.
 */
export const messageSegments = [
  "accepted",
  "waitlisted",
  "pending",
  "providers",
  "staff",
  "followers",
  "checked_in",
] as const;
export type MessageSegment = (typeof messageSegments)[number];

/** Usage d'un modèle de message (le formulaire où il est proposé). */
export const templateKinds = ["message", "announcement", "instructions", "thanks"] as const;
export type TemplateKind = (typeof templateKinds)[number];

/** Avancement d'un message groupé (envoi en tâche, par lots de 500). */
export const groupMessageStatuses = ["queued", "sending", "sent"] as const;
export type GroupMessageStatus = (typeof groupMessageStatuses)[number];
