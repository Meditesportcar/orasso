// Activité et Messages de la structure (lot R9d) : libellés de l'appli et du site, au caractère près (maquette R9.4).

export const structureActivityLabels = {
  title: "Activité",
  messagesTitle: "Messages",
  chips: {
    all: "Tout",
    triage: "À trier",
    mentions: "Mentions",
    comments: "Commentaires",
    collaborations: "Collaborations",
  },
  messageChips: { all: "Tout", participants: "Participants", team: "Équipe" },
  requests: "Demandes",
  staffAsks: "voudrait rejoindre le staff",
  requestsListFailed: "Les demandes n'ont pas pu être chargées.",
  requestsUnknown: "Le nombre de demandes n'a pas pu être lu.",
  newMessage: "Nouveau message",
  groupedMessage: "Message groupé",
  staffDiscussion: "Discussion de staff",
  empty: (structure: string) => `Aucune nouveauté pour ${structure}.`,
  loadError: "L'activité ne s'est pas chargée.",
  retry: "Réessayer",
  today: "Aujourd'hui",
  week: "Cette semaine",
  earlier: "Plus tôt",
  /** Lignes de l'écran Messages : « Message groupé · inscrits du Lydia ». */
  groupedLine: (audience: string) => `Message groupé · ${audience}`,
} as const;

/** Textes des notifications de la structure (le titre nu : l'écran dit déjà la structure ; le push est préfixé de son nom). */
export const structureNotificationTexts = {
  applicationVehicle: (count: number, event: string) =>
    count === 1 ? `1 candidature à trier · ${event}` : `${count} candidatures à trier · ${event}`,
  applicationAllSorted: (event: string) => `Tout est trié · ${event}`,
  applicationMedia: (media: string, event: string) => `${media} demande une accréditation pour ${event}`,
  applicationProvider: (provider: string, event: string) => `${provider} propose ses services pour ${event}`,
  commentedPost: (structure: string) => `{name} a commenté la publication de ${structure}`,
  repliedComment: (structure: string) => `{name} a répondu au commentaire de ${structure}`,
} as const;

/**
 * Le modèle (`{name}` = la personne ou la page qui écrit) du titre et du corps d'une ligne de commentaire d'une structure :
 * recomposé quand la ligne est relue (garde de livraison, commentaire devenu illisible). `null` : ce n'est pas une ligne de structure.
 */
export function structureCommentTemplate(
  type: string,
  data: { structureName?: unknown },
  structureId: string | null,
): string | null {
  if (!structureId || typeof data.structureName !== "string") return null;
  if (type === "feed_comment") return structureNotificationTexts.commentedPost(data.structureName);
  if (type === "feed_comment_reply") return structureNotificationTexts.repliedComment(data.structureName);
  return null;
}
