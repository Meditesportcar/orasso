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

/**
 * Les écrans des commentaires, appli et site (lot R8k2, maquette R8.3 `f-clair`) : la ligne d'actions, les deux commentaires sous la
 * carte, la feuille, le champ, le menu. Les mots sont ceux de la maquette ; ce qu'elle n'écrit pas est au journal des choix.
 */
export const feedCommentScreenLabels = {
  /** Boutons de la ligne d'actions d'une carte (libellés accessibles). */
  comment: "Commenter",
  share: "Partager",
  commentsSheet: "Commentaires",
  close: "Fermer",
  more: "Plus",
  /** Dans la feuille. */
  fireOnComment: "Flamme sur le commentaire",
  reply: "Répondre",
  hideReplies: "Masquer",
  loadMore: "Voir plus",
  empty: "Sois le premier à commenter.",
  off: "Les commentaires sont coupés.",
  retry: "Réessayer",
  loadFailed: "Les commentaires ne se chargent pas.",
  goneNotice: "Cette publication n'est plus disponible.",
  /** Le champ. */
  inputLabel: "Écrire un commentaire",
  placeholder: "Un commentaire (300 caractères)",
  replyPlaceholder: "Ta réponse (300 caractères)",
  replyingTo: (pseudo: string) => `Réponse à ${pseudo}`,
  cancelReply: "Annuler la réponse",
  send: "Envoyer",
  counter: (length: number, max: number) => `${length} / ${max}`,
  emptyInput: "Écris un commentaire.",
  tooLong: "300 caractères au plus.",
  /** Un envoi qui n'est pas parti : le texte n'est jamais perdu. */
  notSent: "Non envoyé",
  sending: "Envoi…",
  /** Les menus. */
  deleteComment: "Supprimer",
  deleteConfirm: "Supprimer ce commentaire ? Ses réponses partent avec lui.",
  deleteReplyConfirm: "Supprimer ce commentaire ?",
  reportComment: "Signaler ce commentaire",
  commentsOff: "Couper les commentaires",
  commentsOn: "Rouvrir les commentaires",
  commentsOffHint: "Plus personne ne peut commenter ; tu peux les rouvrir",
  commentsOnHint: "Les commentaires sont coupés ; les anciens restent lisibles",
  /** Les suggestions après « @ » : « tu la suis » ne se décide pas (genre inconnu). */
  mentionList: "Personnes à identifier",
  mentionWhy: {
    thread: "dans la conversation",
    following: "tu suis ce compte",
    follower: "te suit",
    event: "inscrit à l'événement",
  } satisfies Record<MentionWhy, string>,
} as const;
