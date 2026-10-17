import { z } from "zod";
import type { StructureSuspensionReason, StructureVerification } from "../enums";
import { type BadgeReminders, EXPORT_REASON_MAX, EXPORT_REASON_MIN, STRUCTURE_NOTE_MAX } from "../rules/afterEvent";
import { GROUP_MESSAGE_BODY_MAX, GROUP_MESSAGE_SUBJECT_MAX } from "../rules/templates";
import { optionalText } from "./common";
import type { VerificationDocument } from "./structure";

// Après l'événement et badge de structure (lot 27, ARCHITECTURE-SUITE § 11) : entrées et vues de l'API.

// --- Bilan -------------------------------------------------------------------------------------------------------

export type ReportCount = { label: string; count: number };

/** Le bilan d'un événement : des nombres seulement, jamais une personne (réservé à l'organisation). */
export type EventReportData = {
  /** Candidatures de véhicules reçues (hors venues en crew jamais confirmées). */
  registered: number;
  accepted: number;
  present: number;
  absent: number;
  /** Présents sur présents + absents, entre 0 et 1 ; null sans personne attendue. */
  presenceRate: number | null;
  byCategory: ReportCount[];
  byMake: ReportCount[];
  /** Premier département du profil des présents. */
  byDepartment: ReportCount[];
  providers: { accepted: number; present: number };
  staff: { expected: number; present: number };
  /** Nouveaux abonnés venus d'une candidature, de la publication à J+7. */
  newFollowers: number;
  incidents: number;
  reviews: { count: number; average: number | null };
  scans: { total: number; duplicates: number; overrides: number };
  /** Points de l'événement : doit coïncider avec les présents (contrôle de cohérence). */
  points: { participations: number; malus: number };
  /**
   * Lot 26 : bilan par jour d'un événement sur plusieurs jours (absent ou vide = un seul jour). Un jour compte ses
   * candidatures et celles de tout l'événement ; présent ce jour-là = entrée de la candidature du jour, ou pour tout
   * l'événement, entrée ou lecture du QR à cette date (une seule entrée par candidature, S29).
   */
  byDay?: { dayId: string; date: string; accepted: number; present: number; absent: number }[];
};

export type ThanksState = {
  sentAt: string | null;
  /** Pourquoi l'envoi est impossible (libellé), ou null. */
  blockedReason: "sent" | "not_published" | "not_ended" | "too_late" | null;
  /** Présents qui recevront le message (hors comptes supprimés, suspendus, bannis, bannis de la structure). */
  recipients: number;
  /** Date limite : J+7. */
  closesAt: string;
  /** Modèle Orasso prérempli (variables non remplacées). */
  template: { id: string | null; subject: string | null; body: string };
  /** Aperçu rendu pour l'organisateur lui-même. */
  preview: string;
};

export type EventReportView = {
  eventId: string;
  /** Quand le bilan sera définitif (J+8). */
  refreshAt: string;
  /** Le bilan : absent tant que les points ne sont pas attribués (J+2). */
  report: {
    generatedAt: string;
    /** Date du rafraîchissement à J+8 (null tant qu'il n'a pas eu lieu). */
    refreshedAt: string | null;
    data: EventReportData;
  } | null;
  thanks: ThanksState;
};

/** `POST /events/:id/thanks` : un modèle ou un texte libre, sinon le modèle Orasso « Remerciement ». */
export const thanksSchema = z.object({
  templateId: z.uuid().optional(),
  subject: optionalText(GROUP_MESSAGE_SUBJECT_MAX),
  body: z.string().trim().min(1).max(GROUP_MESSAGE_BODY_MAX).optional(),
});
export type ThanksInput = z.infer<typeof thanksSchema>;

export type ThanksResult = { groupMessageId: string; recipientsCount: number; sentAt: string };

// --- Export tracé ------------------------------------------------------------------------------------------------

/** `POST /events/:id/participants/export {reason}` : motif obligatoire, tracé au journal d'administration. */
export const exportQuerySchema = z.object({
  reason: z
    .string()
    .trim()
    .min(EXPORT_REASON_MIN, `Le motif demande au moins ${EXPORT_REASON_MIN} caractères`)
    .max(EXPORT_REASON_MAX),
});
export type ExportQuery = z.infer<typeof exportQuerySchema>;

// --- Notes internes ----------------------------------------------------------------------------------------------

export type StructureNoteView = {
  id: string;
  subjectUserId: string;
  subjectPseudo: string;
  eventId: string | null;
  eventTitle: string | null;
  body: string;
  authorPseudo: string | null;
  /** Écrite par la personne qui regarde. */
  mine: boolean;
  createdAt: string;
  updatedAt: string;
};

const noteBody = z.string().trim().min(1, "La note est vide").max(STRUCTURE_NOTE_MAX);

/** `POST /structures/:id/notes` : la personne par son pseudo (déjà candidate à un événement de la structure). */
export const noteCreateSchema = z.object({
  pseudo: z.string().trim().min(1).max(40),
  eventId: z.uuid().optional(),
  body: noteBody,
});
export type NoteCreate = z.infer<typeof noteCreateSchema>;

export const noteUpdateSchema = z.object({ body: noteBody });
export type NoteUpdate = z.infer<typeof noteUpdateSchema>;

/** `GET /structures/:id/notes` : toutes les notes (recherche par pseudo) ou celles d'une personne. */
export const noteListQuerySchema = z.object({
  userId: z.string().min(1).max(64).optional(),
  q: z.string().trim().max(40).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type NoteListQuery = z.infer<typeof noteListQuerySchema>;

// --- Badge de structure ------------------------------------------------------------------------------------------

/** Une structure vue de l'équipe sous l'angle du badge (`GET /admin/structures?badge=…`). */
export type AdminBadgeRow = {
  id: string;
  slug: string;
  name: string;
  verification: StructureVerification;
  suspendedReason: StructureSuspensionReason | null;
  suspendedAt: string | null;
  badgeExpiresAt: string | null;
  /** Jours avant l'échéance (0 = aujourd'hui ou passée) ; null sans échéance. */
  daysLeft: number | null;
  reminded: BadgeReminders;
  owner: { pseudo: string; email: string } | null;
};

export type AdminBadgeCounts = { expiring: number; suspended: number };

export type AdminStructureDetail = AdminBadgeRow & {
  kind: string;
  city: string | null;
  members: { userId: string; pseudo: string; role: string; status: string }[];
  documents: VerificationDocument[];
};

export const badgeFilters = ["expiring", "suspended", "all"] as const;
export type BadgeFilter = (typeof badgeFilters)[number];
export const badgeQuerySchema = z.object({ badge: z.enum(badgeFilters).default("expiring") });

const adminReason = z.string().trim().min(3, "Écris le motif").max(500);

/** `POST /admin/structures/:id/renew-badge` : une note facultative (les retours qui justifient le renouvellement). */
export const badgeRenewSchema = z.object({ note: optionalText(500) });
export type BadgeRenew = z.infer<typeof badgeRenewSchema>;

/** `POST /admin/structures/:id/suspend` et `/lift`. */
export const badgeReasonSchema = z.object({ reason: adminReason });
export type BadgeReason = z.infer<typeof badgeReasonSchema>;

/** `POST /admin/structures/:id/transfer-owner` : le nouveau propriétaire (id ou pseudo), le motif, le justificatif. */
export const transferOwnerSchema = z
  .object({
    userId: z.string().min(1).max(64).optional(),
    pseudo: z.string().trim().min(1).max(40).optional(),
    reason: z.string().trim().min(10, "Le motif demande au moins 10 caractères").max(500),
    documentId: z.uuid(),
  })
  .refine((v) => Boolean(v.userId) !== Boolean(v.pseudo), {
    message: "Indique le nouveau propriétaire (id ou pseudo)",
  });
export type TransferOwner = z.infer<typeof transferOwnerSchema>;
