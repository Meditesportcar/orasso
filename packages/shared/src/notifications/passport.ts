import type { NotificationFamily } from "../enums";

/**
 * Passeport, prix du public, récap (lot 49, ARCHITECTURE-DA-V2 § 5.8). `stamp_received` : au Journal seulement (le
 * tampon tombe déjà à l'écran au scan, canal `user:{id}` `passport.stamped`) ; `audience_prize_won` : push et e-mail de
 * repli ; `event_recap_ready` : push sans e-mail de repli (des centaines de présents le même matin).
 */
export const passportNotificationTypes = {
  stamp_received: "grade",
  audience_prize_won: "grade",
  event_recap_ready: "event",
} as const satisfies Record<string, NotificationFamily>;

/** Ni push ni e-mail : le Journal. */
export const passportJournalOnlyTypes: readonly string[] = ["stamp_received"];
/** Push et Journal, pas d'e-mail de repli. */
export const passportNoEmailTypes: readonly string[] = ["event_recap_ready"];

/** Libellés des types (réglages des notifications). */
export const passportNotificationLabels: Record<keyof typeof passportNotificationTypes, string> = {
  stamp_received: "Nouveau tampon dans le passeport",
  audience_prize_won: "Prix du public gagné",
  event_recap_ready: "Récap d'un événement",
};
