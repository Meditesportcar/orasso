// Modération (lot 32, ARCHITECTURE-SUITE § 15.2, § 15.3) : entrées des routes.
import { z } from "zod";

import { reportReasons, reportStatuses, reportTargets, sanctionKinds } from "../moderation";
import { MODERATION } from "../rules/moderation";
import { optionalText } from "./common";

/**
 * `POST /reports`. Pour un message, la copie des 5 messages avant et après est faite par le serveur parmi ceux que le
 * signaleur peut lire (rien à envoyer). `screenshotKey` : clé de `POST /me/uploads purpose=report`.
 */
export const reportCreateSchema = z
  .object({
    targetType: z.enum(reportTargets),
    targetId: z.string().trim().min(1).max(100),
    reason: z.enum(reportReasons),
    details: optionalText(MODERATION.detailsMax),
    screenshotKey: z
      .string()
      .regex(/^private\/reports\/[0-9a-f-]{36}\.webp$/, "Capture inconnue")
      .nullish()
      .transform((v) => v ?? null),
  })
  .refine((v) => v.reason !== "other" || Boolean(v.details), {
    message: "Précise le motif « Autre » en quelques mots",
    path: ["details"],
  });
export type ReportCreate = z.infer<typeof reportCreateSchema>;

export const adminReportsQuery = z.object({
  status: z.enum(reportStatuses).default("pending"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(200).optional(),
});

/** `POST /admin/reports/:id/status` : `resolved_action` confirme la sanction ou le retrait déjà décidé. */
export const adminReportStatusSchema = z.object({
  status: z.enum(["reviewing", "resolved_no_action", "resolved_action", "dismissed_abusive"]),
  note: optionalText(MODERATION.noteMax),
});

/**
 * `POST /admin/reports/:id/sanction` : sanction du propriétaire de la cible (ou du signaleur, après un signalement
 * rejeté comme abusif), et/ou retrait du contenu. Au moins l'un des deux.
 */
export const adminSanctionSchema = z
  .object({
    kind: z
      .enum(sanctionKinds)
      .nullish()
      .transform((v) => v ?? null),
    note: optionalText(MODERATION.noteMax),
    hideContent: z.boolean().default(false),
    subject: z.enum(["owner", "reporter"]).default("owner"),
  })
  .refine((v) => v.kind !== null || v.hideContent, { message: "Choisis une sanction ou le retrait du contenu" });
export type AdminSanctionInput = z.infer<typeof adminSanctionSchema>;

export const sanctionContestSchema = z.object({
  message: z.string().trim().min(1, "Explique en quelques mots").max(MODERATION.contestMax),
});

export const sanctionDecisionSchema = z.object({
  decision: z.enum(["uphold", "lift"]),
  note: optionalText(MODERATION.noteMax),
});

export const sanctionLiftSchema = z.object({ note: optionalText(MODERATION.noteMax) });

export const adminSanctionsQuery = z.object({
  filter: z.enum(["contested", "active", "all"]).default("contested"),
});
