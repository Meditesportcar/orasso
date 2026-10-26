import type { NotificationFamily } from "../enums";

/**
 * Fil d'un crew (lot R5c1) : notifications calmes, famille `social` (préférences et heures calmes existantes).
 * `crew_post_comment` : des commentaires sur ta publication, regroupés tant que la notification n'est pas lue ;
 * `crew_poll_new` : un nouveau sondage du crew. Jamais une notification par photo, jamais d'image (D36).
 */
export const crewFeedNotificationTypes = {
  crew_post_comment: "social",
  crew_poll_new: "social",
} as const satisfies Record<string, NotificationFamily>;

export const crewFeedNotificationLabels: Record<keyof typeof crewFeedNotificationTypes, string> = {
  crew_post_comment: "Commentaire sur ma publication dans le crew",
  crew_poll_new: "Nouveau sondage dans mon crew",
};
