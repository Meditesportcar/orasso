// Listes de publications, journal d'un événement, mentions, épingle (vague R8, lot R8a2) : messages d'erreur.

export const feedListErrors = {
  authorKeyInvalid: "Cette page ou cette personne est introuvable.",
  authorNotFound: "Cette page ou cette personne est introuvable.",
  eventNotFound: "Événement introuvable.",
  postNotInJournal: "Cette publication n'est pas dans le journal de cet événement.",
  mentionNotFound: "Cette mention est introuvable.",
  targetNotManageable: "Tu ne peux pas masquer une mention sur cette fiche.",
  hiddenForbidden: "Seuls les responsables de la fiche voient les mentions masquées.",
  signInRequired: "Connecte-toi pour voir cette liste.",
  photoNotFound: "Photo introuvable.",
} as const;

/** Notification « cité dans une publication » (`feed_post_mention`) : `name` = la page ou le pseudo de qui cite. */
export const feedMentionLabels = {
  notificationTitle: (name: string) => `${name} te cite dans une publication`,
  notificationBody: (name: string) => `${name} t'a cité dans une publication.`,
} as const;
