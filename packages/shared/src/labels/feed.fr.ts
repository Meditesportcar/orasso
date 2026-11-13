import type { FeedAspect, FeedCardKind, FeedFilter, FeedReasonCode } from "../rules/feed";
import { FEED_SPONSORED_OPEN_REASON } from "../rules/sponsored";

// Le Fil (lot R7e1, D38) : libellés des raisons, des filtres, des genres de carte et du menu ⋯.

/**
 * « Pour ta sortie de samedi » : le jour du début, à Paris. Au-delà d'une semaine, le jour seul serait ambigu : « Pour ta
 * sortie du 21 novembre ». Une sortie déjà commencée dit le jour où elle a commencé.
 */
export function feedMyOutingLabel(startsAt: Date, now: Date): string {
  const tz = "Europe/Paris";
  if (startsAt.getTime() - now.getTime() > 6 * 86_400_000) {
    return `Pour ta sortie du ${startsAt.toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: tz })}`;
  }
  return `Pour ta sortie de ${startsAt.toLocaleDateString("fr-FR", { weekday: "long", timeZone: tz })}`;
}

/** « Pourquoi je vois ça » : la ligne sous la carte. `pseudo` ou `name` complètent les liens directs. */
export function feedReasonLabel(
  code: FeedReasonCode,
  who?: string | null,
  outing?: { startsAt: Date; now: Date },
): string {
  switch (code) {
    case "following_author":
      return who ? `Tu suis ${who}` : "Tu suis cette personne";
    case "following_structure":
      return "Nouveauté d'un abonnement";
    case "following_pro":
      return "Nouveauté d'un abonnement";
    case "crew_mate":
      return "Dans ton crew";
    case "your_styles":
      return "Dans tes styles";
    case "near_you":
      return "Autour de toi";
    case "recommended_event":
      return "Événement recommandé";
    case "lineup_today":
      return "Le plateau du jour";
    case "vote_result":
      return "Résultat du vote";
    case "pro_near":
      return "Pro près de chez toi";
    case "from_orasso":
      return "Proposé par Orasso";
    case "your_memory":
      return "Un souvenir pour toi";
    case "my_outing":
      return outing ? feedMyOutingLabel(outing.startsAt, outing.now) : "Pour ta sortie";
    case "new_here":
      return "Nouveau sur Orasso";
    case "sponsored":
      // Sans précision : la forme sûre. Une carte ciblée par département dit le département (`feedSponsoredReason`).
      return FEED_SPONSORED_OPEN_REASON;
  }
}

export const feedFilterLabels: Record<FeedFilter, string> = {
  for_you: "Pour toi",
  nearby: "Autour de moi",
  following: "Mes abonnements",
};

export const feedCardKindLabels: Record<FeedCardKind, string> = {
  event_recommended: "Événements",
  vehicle_public: "Voitures",
  lineup: "Plateaux",
  vote_result: "Résultats de votes",
  announcement: "Annonces",
  pro: "Pros",
  spot_meetup: "Rendez-vous au spot",
  feed_post: "Publications",
  memory: "Souvenirs",
  sponsored: "Sponsorisé",
  album: "Albums",
};

export const feedAspectLabels: Record<FeedAspect, string> = {
  portrait_4_5: "Portrait 4:5",
  square: "Carré 1:1",
  landscape: "Paysage",
};

export const feedLabels = {
  title: "Le Fil",
  empty: "Rien de nouveau pour l'instant.",
  emptyFollowing: "Les nouveautés des personnes et des clubs que tu suis arrivent ici.",
  emptyNearby: "Choisis ton coin dans ton profil pour voir ce qui se passe autour de toi.",
  lessAction: "Moins de ce genre",
  lessDone: "On t'en montrera moins.",
  lessUndo: "Annuler",
  whyThis: "Pourquoi je vois ça",
  report: "Signaler la publication",
  deletePost: "Supprimer la publication",
  plateDecision: "Pour chaque photo : floute la plaque, ou confirme qu'aucune plaque n'est visible.",
  tooManyPhotos: "Six photos au plus.",
  officialPseudo: "Orasso",
  pseudoReserved: "Ce pseudo est réservé : choisis-en un autre.",
  officialBio: "Le compte officiel d'Orasso : des photos pour bien démarrer.",
} as const;

/**
 * Publier au nom d'une casquette, pour un événement (vague R8, lot R8a1). Les mots du rattachement viennent de la
 * maquette R8.4 (`publierH`) : « pour le », « présent au », « sera au », « était au », suivis du titre de l'événement.
 */
export const feedAttachLabels = {
  organizer: "pour le",
  on_site: "présent au",
  attendeeBefore: "sera au",
  attendeeAfter: "était au",
  presentStamp: "Présent",
} as const;

/** Motifs d'une « Info importante » (maquette R8.4 : Horaires, Accès, Sécurité, Météo, Autre). */
export const importantReasonLabels = {
  schedule: "Horaires",
  access: "Accès",
  safety: "Sécurité",
  weather: "Météo",
  other: "Autre",
} as const;

/** Messages des refus de la publication au nom d'une casquette (codes de `errorCodes`). */
export const publicationErrors = {
  persona_forbidden: "Tu ne peux pas publier au nom de cette page.",
  event_not_attachable: "Tu ne peux pas rattacher ta publication à cet événement.",
  important_requires_event: "Une info importante se publie en tant qu'organisateur, pour un événement de ta structure.",
  account_changed: "Ta session a changé : recharge la page avant de publier.",
  post_unavailable: "Ta publication existe, mais elle n'est pas visible pour le moment.",
  important_quota: "Tu as atteint la limite d'infos importantes pour cet événement (une par jour, trois par semaine).",
  photo_required:
    "Ajoute une photo. Seule une publication rattachée à un événement qui a une affiche peut s'en passer.",
  captionTooLong: "La légende est trop longue.",
  choosePage: "Choisis la page au nom de laquelle tu publies.",
  unexpectedPage: "Une publication personnelle n'a pas de page.",
  fanOnly: "Cette option est réservée aux publications personnelles.",
  importantReasonRequired: "Choisis le motif de l'info importante.",
} as const;
