import type { NotificationFamily } from "../enums";

/**
 * Sorties du crew (lot R5c2, maquette R5.9) : famille `social` (« Abonnements et messages »), donc coupées avec elle, et
 * livrées après les heures calmes. Une nouvelle sortie prévient les membres du crew ; son annulation, ceux qui venaient.
 */
export const crewOutingNotificationTypes = {
  crew_outing_new: "social",
  crew_outing_cancelled: "social",
} as const satisfies Record<string, NotificationFamily>;

export const crewOutingNotificationLabels: Record<keyof typeof crewOutingNotificationTypes, string> = {
  crew_outing_new: "Nouvelle sortie de mon crew",
  crew_outing_cancelled: "Sortie de mon crew annulée",
};
