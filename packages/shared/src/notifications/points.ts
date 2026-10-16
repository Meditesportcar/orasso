import type { NotificationFamily } from "../enums";

/** Points et grades. */
export const pointsNotificationTypes = {
  points_awarded: "grade",
  malus_applied: "grade",
  contest_decided: "grade",
  grade_changed: "grade",
  season_ended: "grade",
} as const satisfies Record<string, NotificationFamily>;
