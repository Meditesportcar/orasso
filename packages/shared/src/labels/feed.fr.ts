import type { FeedAspect, FeedCardKind, FeedFilter, FeedReasonCode } from "../rules/feed";
import { FEED_SPONSORED_OPEN_REASON } from "../rules/sponsored";

// Le Fil (lot R7e1, D38) : libellés des raisons, des filtres, des genres de carte et du menu ⋯.

/** « Pourquoi je vois ça » : la ligne sous la carte. `pseudo` ou `name` complètent les liens directs. */
export function feedReasonLabel(code: FeedReasonCode, who?: string | null): string {
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
