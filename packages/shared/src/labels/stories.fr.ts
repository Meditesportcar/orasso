// Stories (lot R7f1) : libellés de l'API, de l'appli et du site, mêmes mots partout.
import { STORY_CAPTION_MAX, STORY_LIVE_MAX, STORY_TAGS_MAX } from "../rules/audience";

export const storyLabels = {
  stories: "Stories",
  myStory: "Ma story",
  plateDecisionRequired: "Floute la plaque ou confirme qu'aucune plaque n'est visible avant de publier.",
  captionTooLong: `Ta légende dépasse ${STORY_CAPTION_MAX} caractères.`,
  tooManyTags: `${STORY_TAGS_MAX} identifications au plus.`,
  crewOnly: "Cette story est réservée aux membres du crew.",
  notYours: "C'est ta story.",
  notMember: "Tu n'es pas membre actif de ce crew.",
  notOrganizer: "Tu n'organises pas cette structure.",
  notPro: "Ce n'est pas ta fiche pro.",
  personaUnavailable: "Tu n'as pas cette casquette.",
  privateAccountPublic: "Un compte privé publie seulement à ses abonnés ou à son crew.",
  crewAudiencePersona: "Une story de crew se publie en tant que passionné.",
  videoSoon: "Vidéo bientôt.",
  tooManyStories: `${STORY_LIVE_MAX} stories en cours au plus : supprime-en une avant d'en publier une autre.`,
  replyUnavailable: "Cette page ne reçoit pas de messages pour le moment.",
  linkedUnsupported: "Ce contenu ne peut pas encore être lié à une story.",
  videoNotLinked: "Une story vidéo ne peut pas porter un contenu partagé.",
  skipped: {
    not_visible: "Cette personne ne pourrait pas voir ta story.",
    private_account: "Un compte privé ne peut pas identifier une structure, un pro ou un événement.",
    crew_story: "Une story de crew ne s'identifie pas hors du crew.",
    unavailable: "Introuvable.",
    tags_full: "Dix identifications au plus : celle-ci n'a pas été gardée.",
    not_yours: "Ce véhicule n'est pas le tien.",
  },
  mention: (pseudo: string) => `${pseudo} t'a identifié dans sa story.`,
  mentionStructure: (pseudo: string, name: string) => `${pseudo} a identifié ${name} dans sa story.`,
  mentionTitle: (pseudo: string) => `${pseudo} t'a identifié dans une story`,
  published: (name: string) => `${name} a publié une story.`,
  liked: (pseudos: string[], n: number) =>
    n <= 1
      ? `${pseudos[0] ?? "Quelqu'un"} a aimé ta story.`
      : `${pseudos.join(", ")} et ${n - pseudos.length} autre${n - pseudos.length > 1 ? "s" : ""} ont aimé ta story.`,
  likedTitle: "Flamme sur ta story",
  reportTitle: (pseudo: string) => `Story de ${pseudo}`,
  reportGone: "Story supprimée",
} as const;
