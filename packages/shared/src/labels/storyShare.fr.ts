// La story de l'organisateur « En cours » (lot R7h) : les mentions, « Ajouter à ma story », « Retirer », « Repartager ».
// Mêmes mots sur l'appli et le site.
export const storyShareLabels = {
  mentions: "Mentions",
  mentionsCount: (n: number) => `Mentions · ${n}`,
  mentionsTitle: "Les stories où tu es identifié",
  mentionsHint:
    "Les stories qui citent ta structure ou un de tes événements. Ajoute-les à ta story : l'auteur est crédité.",
  mentionsEmpty: "Aucune story ne vous cite pour le moment.",
  mentionsError: "Les mentions n'ont pas pu être lues.",
  mentionsMore: "Voir plus",
  mentionBy: (author: string, when: string) => `${author} · ${when}`,
  add: "Ajouter à ma story",
  addExplain: "Elle rejoint ta story, visible par tous, jusqu'à la fin de l'originale.",
  addCredit: (author: string) => `${author} est crédité et prévenu. S'il la supprime, elle quitte ta story.`,
  alreadyAdded: "Déjà dans ta story",
  added: "Ajoutée à ta story. Elle disparaît avec l'originale.",
  addError: "L'ajout n'a pas marché. Réessaie.",
  addAs: (name: string) => `Ajouter à la story de ${name}`,

  mine: "Ma story",
  mineTitle: "La story de ta structure",
  mineHint: "Ce que ta structure montre à ses abonnés pendant l'événement. Les ajouts gardent leur auteur en crédit.",
  mineEmpty: "Ta structure n'a pas de story pour le moment.",
  mineAddedBy: (author: string) => `Story de ${author}`,
  remove: "Retirer",
  removeConfirm: "Retirer cette story de la tienne ? L'originale reste chez son auteur.",
  removeDone: "Retirée de ta story.",
  removeError: "Le retrait n'a pas marché. Réessaie.",

  /** Ligne d'Activité, côté auteur. */
  activityShared: (by: string) => `${by} a ajouté ta story à la sienne`,
  sharedTitle: (by: string) => `${by} a repris ta story`,
  reshare: "Repartager",
  reshared: "Repartagée dans ta story. Elle disparaît avec l'originale.",
  resharedAlready: "Déjà repartagée",
  reshareError: "Le repartage n'a pas marché. Réessaie.",
  reshareRefused: "Cette story ne peut pas être reprise.",
  untag: "Retirer",
  untagged: "Tu n'es plus identifié dans cette story.",
  gone: "Cette story n'est plus disponible.",

  /** Refus de `share-to-mine`, affichés tels quels. */
  refusals: {
    crew_story: "Une story de crew ne sort pas du crew.",
    private_author: "Le compte de l'auteur est privé : sa story ne peut pas être reprise.",
    own_story: "C'est déjà ta story.",
    not_tagged: "Tu n'es pas identifié dans cette story.",
    already_shared: "Tu as déjà ajouté cette story.",
  },

  /** Bloc « En cours » de l'Accueil et fiche de l'événement. */
  organizerStory: "Story de l'organisateur",
  organizerStoryHint: (name: string) => `La story de ${name}`,
  organizerStoryOpen: "Voir la story de l'organisateur",
  ringLive: "En cours",
} as const;
