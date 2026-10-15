import { z } from "zod";

/** Statut d'une candidature (une candidature = un véhicule ou une casquette pour un événement). */
export const applicationStatuses = ["pending", "accepted", "waitlist", "refused", "withdrawn"] as const;

export const applicationStatusSchema = z.enum(applicationStatuses);
export type ApplicationStatus = z.infer<typeof applicationStatusSchema>;

/** Libellés d'interface, exactement ceux des docs (StatusBadge). */
export const applicationStatusLabels: Record<ApplicationStatus, string> = {
  pending: "En attente",
  accepted: "Retenue",
  waitlist: "Liste d'attente",
  refused: "Refusée",
  withdrawn: "Désistée",
};
