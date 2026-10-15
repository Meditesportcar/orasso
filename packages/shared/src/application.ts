import { z } from "zod";

/**
 * Statut d'une candidature (une candidature = un véhicule ou une casquette pour un événement).
 * Machine à états : ARCHITECTURE.md § 2.1. « Sur place » n'est pas un statut (= retenue + pointage).
 */
export const applicationStatuses = [
  "pending",
  "accepted",
  "waitlisted",
  "offered",
  "refused",
  "withdrawn",
  "expired",
  "cancelled",
] as const;

export const applicationStatusSchema = z.enum(applicationStatuses);
export type ApplicationStatus = z.infer<typeof applicationStatusSchema>;

/** Libellés d'interface, exactement ceux des docs (StatusBadge) et du prototype. */
export const applicationStatusLabels: Record<ApplicationStatus, string> = {
  pending: "En attente",
  accepted: "Retenue",
  waitlisted: "Liste d'attente",
  offered: "Liste d'attente",
  refused: "Refusée",
  withdrawn: "Désistée",
  expired: "Offre expirée",
  cancelled: "Événement annulé",
};
