// Équipe en bulles (lot 52, DA v2, prototype `s-ostaff`) : l'historique d'un membre avec la structure. La taille de la
// bulle suit `eventsHeld`, le nombre d'événements tenus (terminés ou en cours, présence confirmée).
import type { StaffRole } from "../roles";

export type TeamHistoryEvent = {
  eventId: string;
  title: string;
  startsAt: string;
  /** Les rôles tenus à cet événement ; `null` : aucun rôle noté pour cet événement. */
  roles: StaffRole[] | null;
  presence: "unknown" | "present" | "absent";
};

export type TeamMemberHistory = {
  userId: string;
  /** Événements tenus : passés ou en cours, présence confirmée. */
  eventsHeld: number;
  /** Les derniers événements (huit au plus), le plus récent d'abord. */
  events: TeamHistoryEvent[];
};
