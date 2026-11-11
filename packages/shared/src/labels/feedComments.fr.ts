import type { MentionWhy } from "../rules/feedComments";

/** Commentaires d'une publication du Fil (lot R8k1) : messages d'erreur, notifications, suggestions « @ ». */
export const feedCommentLabels = {
  postNotFound: "Publication introuvable",
  commentNotFound: "Commentaire introuvable",
  commentsOff: "Les commentaires sont coupés sur cette publication.",
  /** Notification groupée : le corps est le début du commentaire entre guillemets français. */
  quote: (excerpt: string) => `« ${excerpt} »`,
  /** Lien de la notification vers la publication. */
  notificationLink: "Voir la publication",
  /** Suggestions après « @ » : la raison, telle que la maquette l'écrit. */
  mentionWhy: {
    thread: "dans la conversation",
    following: "tu la suis",
    follower: "te suit",
    event: "à l'événement",
  } satisfies Record<MentionWhy, string>,
} as const;
