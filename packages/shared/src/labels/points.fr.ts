import type { ContestStatus, PointKind } from "../rules/points";

// Points et contestations (lot 06).

/** Lignes du barème (prototype « Points et grade ») et des autres écritures. */
export const pointKindLabels: Record<PointKind, string> = {
  participation: "Présent à un événement",
  staff: "Staff sur un événement",
  referral: "Ami invité",
  malus: "Absent sans désistement",
  malus_reversal: "Malus annulé",
  season_carryover: "Report de la saison précédente",
  admin_adjustment: "Ajustement par l'équipe Orasso",
};

export const contestStatusLabels: Record<ContestStatus, string> = {
  pending: "Contesté",
  accepted: "Contestation acceptée",
  rejected: "Contestation refusée",
  escalated: "Transmise à l'administration",
};

/** « Pointage en attente » (docs/01 « après l'événement »). */
export const POINTS_PENDING_LABEL = "Pointage en attente";
