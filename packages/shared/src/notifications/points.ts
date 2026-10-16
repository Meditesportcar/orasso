import type { NotificationFamily } from "../enums";

/** Points et grades. */
export const pointsNotificationTypes = {
  points_awarded: "grade",
  malus_applied: "grade",
  contest_decided: "grade",
  grade_changed: "grade",
  season_ended: "grade",
  /** Lot 15 : un filleul a vérifié son e-mail (+10 au parrain). */
  referral_confirmed: "grade",
} as const satisfies Record<string, NotificationFamily>;
