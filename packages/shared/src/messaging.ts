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

  // Lot R7f1 : photo d'une story (privée, composée en 9:16 par le serveur). Lot R7g : la vidéo (`story_video`, 60 Mo,
  // MP4/MOV H.264 de 31 s au plus, vérifiée sans ffmpeg) et sa vignette (`story_poster`, première image, WebP).
  "story",
  "story_video",
  "story_poster",
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
  "story_poster",
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

  // Lot R7f1 : photo d'une story (`POST /me/stories`) ; lot R7g : sa vidéo et la vignette de celle-ci.
  "story",
  "story_video",
  "story_poster",
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
  /** Lot R8o : invitations à publier en attente (absent d'un résumé plus ancien). */
  pendingCoauthors?: number;
  requests: { contact: number };
};

export function inboxRowCounts(summary: InboxCountsInput | null): {
  activityRequests: number;
  messageRequests: number;
} {
  const contact = summary?.requests.contact ?? 0;
  const pending = (summary?.pendingRequests ?? 0) + (summary?.pendingCoauthors ?? 0);
  return { activityRequests: Math.max(0, pending - contact), messageRequests: contact };
}

/**
 * Les deux lignes « Demandes · N » et « Demandes de message · N » (lot R7c2, tours 2 et 3). Un compteur **inconnu** n'est
 * pas zéro. Si `GET /me/inbox/summary` ne répond pas (encore, ou plus), on se rabat sur la liste des demandes
 * (`GET /me/requests`, première page) :
 * - liste complète (`items.length >= total`) : les nombres sont exacts ;
 * - liste incomplète (plus d'une page) : les nombres de la page sont des **minimums** (`atLeast`), jamais « total moins ce
 *   qu'on a vu » (les demandes de message d'une page suivante fausseraient la soustraction) ; un minimum de 0 devient
 *   `null` (ligne sans nombre : il y a sûrement quelque chose plus loin).
 * `status` : `loading` tant que rien n'a répondu et qu'aucun des deux n'a échoué (pas d'erreur à montrer : la ligne
 * attend) ; `failed` seulement quand le résumé **et** la liste ont échoué (ligne sans nombre, avec « Réessayer ») ;
 * `ready` dès qu'un des deux a répondu. `failed` = ce qu'ont signalé les écrans (`error` de chaque lecture).
 */
export type RequestRowCounts = {
  activityRequests: number | null;
  messageRequests: number | null;
  atLeast: boolean;
  status: "loading" | "ready" | "failed";
};

export function requestRowCounts(
  summary: InboxCountsInput | null,
  requests: { total: number; items: readonly { kind: string }[] } | null = null,
  failed: { summary: boolean; list: boolean } = { summary: false, list: false },
): RequestRowCounts {
  if (summary) return { ...inboxRowCounts(summary), atLeast: false, status: "ready" };
  if (!requests) {
    return {
      activityRequests: null,
      messageRequests: null,
      atLeast: false,
      status: failed.summary && failed.list ? "failed" : "loading",
    };
  }
  const contact = requests.items.filter((i) => i.kind === "contact").length;
  const others = requests.items.length - contact;
  if (requests.items.length >= requests.total) {
    return {
      activityRequests: Math.max(0, requests.total - contact),
      messageRequests: contact,
      atLeast: false,
      status: "ready",
    };
  }
  return {
    activityRequests: others > 0 ? others : null,
    messageRequests: contact > 0 ? contact : null,
    atLeast: true,
    status: "ready",
  };
}

/**
 * La ligne « Demandes de message · N » de Messages (tour 3) : même règle que `requestRowCounts`. Le résumé prime ; sans lui,
 * la liste complète des demandes de message reçues (`incoming`, `null` tant qu'elle n'a pas répondu) ; l'erreur n'est
 * montrée (`failed`) qu'après l'échec des deux lectures, jamais pendant le premier chargement (`loading`).
 */
export function messageRowCount(
  summary: InboxCountsInput | null,
  incoming: number | null,
  failed: { summary: boolean; list: boolean },
): { count: number | null; status: RequestRowCounts["status"] } {
  if (summary) return { count: inboxRowCounts(summary).messageRequests, status: "ready" };
  if (incoming !== null) return { count: incoming, status: "ready" };
  return { count: null, status: failed.summary && failed.list ? "failed" : "loading" };
}

/** La ligne « Demandes » (ou « Demandes de message ») se montre : en échec, sans nombre connu, ou avec au moins une demande. */
export function requestRowShown(count: number | null, status: RequestRowCounts["status"]): boolean {
  return status === "failed" || (status === "ready" && (count === null || count > 0));
}

/** « 3 » ou, quand la liste est incomplète, « 3+ » ; la phrase lue à voix haute dit « au moins 3 ». */
export const requestCountText = (n: number, atLeast: boolean): string => (atLeast ? `${n}+` : String(n));
export const requestCountSpoken = (n: number, atLeast: boolean): string =>
  atLeast ? `au moins ${n} en attente` : `${n} en attente`;

export function topBarCounts(summary: InboxCountsInput | null): { activity: number; messages: number } {
  const { activityRequests, messageRequests } = inboxRowCounts(summary);
  return {
    activity: (summary?.unseenActivity ?? 0) + activityRequests,
    messages: (summary?.unreadMessages ?? 0) + messageRequests,
  };
}

// Lot R9d : les pastilles de la barre du haut d'un organisateur (cloche = Activité de la structure, bulle = Messages).
export { type StructureInboxCountsInput, structureTopBarCounts } from "./rules/structureActivity";
