// Messagerie et Boîte (lot 18, ARCHITECTURE-SUITE § 3) : énumérations communes à l'API, au site et à l'appli.

/**
 * Sortes de conversation, toutes déclarées dès le lot 18 (§ 3.1) : `direct` (deux personnes) et `organizer` (une
 * personne et une structure) ici ; `crew` au lot 19 ; `structure_staff` et `event_staff` au lot 20. Chaque sorte a
 * ses règles d'accès dans `apps/api/src/modules/messaging/access/<kind>.ts`.
 */
export const conversationKinds = ["direct", "organizer", "crew", "structure_staff", "event_staff"] as const;
export type ConversationKind = (typeof conversationKinds)[number];

/** `admin` : côté structure dans une conversation `organizer` (et chef de crew / organisateurs aux lots 19 et 20). */
export const participantRoles = ["member", "admin"] as const;
export type ParticipantRole = (typeof participantRoles)[number];

/** `system` : message d'information (code dans `body`, libellé côté client), jamais compté comme non lu. */
export const messageKinds = ["text", "image", "system"] as const;
export type MessageKind = (typeof messageKinds)[number];

/** Demande de contact (docs/01 : « une seule demande est possible »). */
export const contactStatuses = ["pending", "accepted", "declined"] as const;
export type ContactStatus = (typeof contactStatuses)[number];

/**
 * Envoi de fichiers générique `POST /me/uploads` (§ 0.3). `message`, `incident`, `report` : clés privées, servies
 * seulement par une route contrôlée ; les autres : publiques (`/api/files`).
 */
export const uploadPurposes = [
  "message",
  "crew_logo",
  "incident",
  "report",
  "provider_photo",
  "announcement",
  // Lot 45 : logo d'un média, photos d'une galerie de contenu média (publiques une fois rattachées).
  "media_logo",
  "media_content",
] as const;
export type UploadPurpose = (typeof uploadPurposes)[number];

/**
 * Clés privées. `announcement` (lot 20) l'est **jusqu'à son rattachement** : la photo d'une annonce n'est copiée vers
 * une clé publique qu'à la publication de l'annonce (sinon la route servirait d'hébergement public d'images).
 */
export const privateUploadPurposes: readonly UploadPurpose[] = ["message", "incident", "report", "announcement"];

/**
 * Usages acceptés par `POST /me/uploads` **aujourd'hui** : seulement ceux qui ont un consommateur (relecture du lot 18 :
 * sinon la route servirait d'hébergement public d'images). Les lots 19, 20 et suivants ajoutent le leur ici, avec le code
 * qui rattache le fichier.
 */
export const acceptedUploadPurposes = [
  "message",
  "announcement",
  "crew_logo",
  // Lot 24 : photo de la main courante (consommateur : `fieldService.setIncidentPhoto`).
  "incident",
  // Lot 32 : capture jointe à un signalement (privée, rattachée par `POST /reports`, effacée avec le signalement).
  "report",
  // Lot 45 : logo du profil média (`POST /me/media-profile/logo`), galerie d'un contenu (`POST /me/media-contents`).
  "media_logo",
  "media_content",
] as const satisfies readonly UploadPurpose[];
