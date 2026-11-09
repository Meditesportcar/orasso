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
  // Lot 47 : photo de l'affiche générée d'un événement (publique une fois rattachée).
  "event_poster_photo",
  // Lot R5c1 : photo du fil d'un crew (privée, jamais publique : D36).
  "crew_post",
  // Lot R7e1 : photo d'une publication du Fil (privée jusqu'à la publication, puis copiée sous une clé publique).
  "feed_post",

  // Lot R7f1 : photo d'une story (privée, composée en 9:16 par le serveur) ; la vidéo (`story_video`) est déclarée,
  // refusée (501) tant que le lot R7g1 n'est pas là.
  "story",
  "story_video",
] as const;
export type UploadPurpose = (typeof uploadPurposes)[number];

/**
 * Clés privées. `announcement` (lot 20) l'est **jusqu'à son rattachement** : la photo d'une annonce n'est copiée vers
 * une clé publique qu'à la publication de l'annonce (sinon la route servirait d'hébergement public d'images).
 */
export const privateUploadPurposes: readonly UploadPurpose[] = [
  "message",
  "incident",
  "report",
  "announcement",
  // Lot R5c1 (D36) : photo du fil d'un crew, servie seulement aux membres actifs du crew.
  "crew_post",
  // Lot R7e1 : la photo envoyée attend, privée, d'être publiée (floutage de plaque à la publication).
  "feed_post",

  // Lot R7f1 : la photo d'une story attend, privée, d'être composée.
  "story",
  "story_video",
];

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
  // Lot 47 : photo de l'affiche générée (`PATCH /events/:id`, `POST /events/:id/poster/generate`) ; l'aperçu
  // (`POST /posters/preview`) la lit sans la rattacher.
  "event_poster_photo",
  // Lot R5c1 : photo du fil d'un crew (`POST /crews/:id/posts`).
  "crew_post",
  // Lot R7e1 : photo d'une publication du Fil (`POST /me/feed-posts`).
  "feed_post",

  // Lot R7f1 : photo d'une story (`POST /me/stories`) ; la vidéo répond 501 « Vidéo bientôt » (lot R7g1).
  "story",
  "story_video",
] as const satisfies readonly UploadPurpose[];

/**
 * Pastilles de la barre du haut (lot R7a1, refaites au lot R7c2). Cloche « Activité » : ce qui est nouveau depuis la
 * dernière ouverture (`unseenActivity`) et les demandes en attente de ta réponse, **hors demandes de message** (la ligne
 * « Demandes · N » de l'Activité) ; bulle « Messages » : conversations non lues et demandes de message en attente (la
 * ligne « Demandes de message · N »). Une demande ne compte qu'une fois : sa notification n'est pas dans `unseenActivity`
 * (voir `requestNotificationTypes`). Appli et site s'en servent tous les deux.
 */
export type InboxCountsInput = {
  unreadMessages: number;
  unseenActivity: number;
  pendingRequests: number;
  requests: { contact: number };
};

export function inboxRowCounts(summary: InboxCountsInput | null): { activityRequests: number; messageRequests: number } {
  const contact = summary?.requests.contact ?? 0;
  return { activityRequests: Math.max(0, (summary?.pendingRequests ?? 0) - contact), messageRequests: contact };
}

export function topBarCounts(summary: InboxCountsInput | null): { activity: number; messages: number } {
  const { activityRequests, messageRequests } = inboxRowCounts(summary);
  return {
    activity: (summary?.unseenActivity ?? 0) + activityRequests,
    messages: (summary?.unreadMessages ?? 0) + messageRequests,
  };
}
