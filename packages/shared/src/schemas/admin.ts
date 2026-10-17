// Administration (lot 33, ARCHITECTURE-SUITE § 16) : entrées validées des routes `/admin/*` et types des réponses.
import { z } from "zod";

import { refusalReasons, vehicleTypes } from "../enums";
import { type Grade, grades } from "../grades";
import { reportReasons, sanctionKinds } from "../moderation";
import { vendorTypeCodes } from "../provider";
import { platformRoles } from "../roles";
import {
  type AdminSettingKey,
  type AdminSettingValues,
  adminSettingKeys,
  codeListProblem,
  thresholdsProblem,
} from "../rules/admin";
import { proActivities } from "../rules/pro";
import { isoDate } from "./common";

// --- Réglages ---------------------------------------------------------------------------------------------------------

const points = (min: number, max: number) =>
  z.number().int("Nombre entier attendu").min(min, `Au moins ${min}`).max(max, `Au plus ${max}`);

const codeList = <T extends readonly [string, ...string[]]>(key: AdminSettingKey, codes: T) =>
  z
    .array(z.enum(codes))
    .max(codes.length)
    .superRefine((list, ctx) => {
      const problem = codeListProblem(key, list);
      if (problem) ctx.addIssue({ code: "custom", message: problem });
    });

const thresholdsSchema = z
  .object(Object.fromEntries(grades.map((g) => [g, points(0, 100_000)])) as Record<Grade, ReturnType<typeof points>>)
  .strict()
  .superRefine((t, ctx) => {
    const problem = thresholdsProblem(t as Record<Grade, number>);
    if (problem) ctx.addIssue({ code: "custom", message: problem });
  });

/** Validation par clé (une valeur invalide est refusée en 400 avant toute écriture). */
export const adminSettingSchemas: { [K in AdminSettingKey]: z.ZodType<AdminSettingValues[K]> } = {
  "signup.enabled": z.boolean(),
  "sponsored.enabled": z.boolean(),
  "providers.enabled": z.boolean(),
  "points.participation": points(0, 500),
  "points.staff": points(0, 500),
  "points.referral": points(0, 500),
  "points.malus": points(-500, 0),
  "grades.thresholds": thresholdsSchema as unknown as z.ZodType<Record<Grade, number>>,
  "lists.refusal_reasons": codeList("lists.refusal_reasons", refusalReasons),
  "lists.vendor_types": codeList("lists.vendor_types", vendorTypeCodes),
  "lists.pro_activities": codeList("lists.pro_activities", proActivities),
};

export const adminSettingKeySchema = z.enum(adminSettingKeys);

/** Corps de `PUT /admin/settings/:key` pour une clé du lot 33 (la valeur est validée par `adminSettingSchemas`). */
export const adminSettingUpdateSchema = z.object({ value: z.unknown() });

/** Une ligne de la page des réglages. */
export type AdminSettingEntry = {
  key: AdminSettingKey;
  value: unknown;
  defaultValue: unknown;
  updatedAt: string | null;
  updatedBy: string | null;
};

// --- Motif obligatoire des actions sensibles ---------------------------------------------------------------------------

export const adminReasonSchema = z.object({
  reason: z.string().trim().min(5, "Indique le motif (5 caractères au moins)").max(500),
});
export type AdminReason = z.infer<typeof adminReasonSchema>;

// --- Registres --------------------------------------------------------------------------------------------------------

export const adminUsersQuery = z.object({
  q: z.string().trim().max(100).optional(),
  role: z.enum(platformRoles).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.string().max(200).optional(),
});

export type AdminUserRow = {
  id: string;
  pseudo: string;
  email: string;
  emailVerified: boolean;
  platformRole: (typeof platformRoles)[number];
  grade: Grade;
  pointsSeason: number;
  createdAt: string;
  suspendedUntil: string | null;
  bannedAt: string | null;
  deletedAt: string | null;
};

export type AdminUserDetail = AdminUserRow & {
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  departments: string[];
  newsletterOptIn: boolean;
  twoFactor: { totp: boolean; passkeys: number };
  structures: { id: string; slug: string; name: string; role: string; status: string }[];
  vehicles: { id: string; label: string; year: number | null; status: string; certified: boolean }[];
  points: { id: string; kind: string; points: number; at: string; note: string | null }[];
  sanctions: {
    id: string;
    kind: string;
    reason: string;
    startsAt: string;
    endsAt: string | null;
    liftedAt: string | null;
  }[];
  reports: { emitted: number; received: number; recent: { id: string; reason: string; status: string; at: string }[] };
  devices: { id: string; platform: string; lastSeenAt: string | null; revoked: boolean }[];
  sessions: { id: string; device: string; createdAt: string; updatedAt: string }[];
  pro: { id: string; slug: string; name: string } | null;
};

/** `POST /admin/users/:id/sanction` : sanction directe depuis la fiche (même échelle que les signalements, lot 32). */
export const adminUserSanctionSchema = z.object({
  kind: z.enum(sanctionKinds),
  reason: z.enum(reportReasons),
  note: z.string().trim().min(5, "Indique le motif (5 caractères au moins)").max(1000),
});

export const adminProsQuery = z.object({
  filter: z.enum(["to_verify", "all"]).default("to_verify"),
  q: z.string().trim().max(100).optional(),
});

export type AdminProRow = {
  id: string;
  slug: string;
  name: string;
  owner: { id: string; pseudo: string } | null;
  city: string | null;
  department: string | null;
  activities: string[];
  siret: string | null;
  registryStatus: string | null;
  verified: boolean;
  published: boolean;
  createdAt: string;
};

export const adminProVerifySchema = z.object({
  verified: z.boolean(),
  note: z.string().trim().min(5, "Indique le motif (5 caractères au moins)").max(500),
});

export const adminStructurePatchSchema = z.object({
  /** Messages groupés aux abonnés par 30 jours (S18) ; `null` = valeur par défaut d'Orasso. */
  followerMessageQuota: z.number().int().min(0).max(30).nullable(),
  reason: z.string().trim().min(5, "Indique le motif (5 caractères au moins)").max(500),
});

export const adminAuditQuery = z.object({
  action: z.string().trim().max(60).optional(),
  actor: z.string().trim().max(64).optional(),
  structure: z.uuid().optional(),
  target: z.string().trim().max(64).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(200).optional(),
});

// --- Base véhicules et file « Autre » ---------------------------------------------------------------------------------

const refName = z.string().trim().min(1, "Nom obligatoire").max(80);

export const vehicleMakeCreateSchema = z.object({
  name: refName,
  country: z
    .string()
    .trim()
    .regex(/^[A-Z]{2}$/, "Code pays sur deux lettres (FR, DE…)")
    .nullish()
    .transform((v) => v ?? null),
});
export const vehicleMakeUpdateSchema = vehicleMakeCreateSchema.partial();

export const vehicleModelCreateSchema = z.object({
  makeId: z.uuid(),
  name: refName,
  vehicleType: z.enum(vehicleTypes),
});
export const vehicleModelUpdateSchema = z.object({
  name: refName.optional(),
  vehicleType: z.enum(vehicleTypes).optional(),
});

const year = z.number().int().min(1886).max(2100);
export const vehicleGenerationCreateSchema = z
  .object({
    modelId: z.uuid(),
    name: refName,
    yearFrom: year.nullish().transform((v) => v ?? null),
    yearTo: year.nullish().transform((v) => v ?? null),
  })
  .refine((g) => g.yearFrom === null || g.yearTo === null || g.yearTo >= g.yearFrom, {
    message: "L'année de fin précède l'année de début",
    path: ["yearTo"],
  });
export const vehicleGenerationUpdateSchema = z.object({
  name: refName.optional(),
  yearFrom: year.nullable().optional(),
  yearTo: year.nullable().optional(),
});

export const vehicleReassignSchema = z.object({
  makeId: z.uuid(),
  modelId: z.uuid(),
  generationId: z
    .uuid()
    .nullish()
    .transform((v) => v ?? null),
});

export type ReferenceMake = { id: string; name: string; country: string | null; isOther: boolean; vehicles: number };
export type ReferenceModel = {
  id: string;
  makeId: string;
  name: string;
  vehicleType: string;
  isOther: boolean;
  vehicles: number;
};
export type ReferenceGeneration = {
  id: string;
  modelId: string;
  name: string;
  yearFrom: number | null;
  yearTo: number | null;
  isOther: boolean;
  vehicles: number;
};

/** File « Autre » : véhicules dont la marque, le modèle ou la génération est « Autre », groupés par ce qui est connu. */
export type OtherVehicleGroup = {
  key: string;
  level: "make" | "model" | "generation";
  make: { id: string; name: string; isOther: boolean };
  model: { id: string; name: string; isOther: boolean };
  vehicles: {
    id: string;
    ownerPseudo: string;
    vehicleType: string;
    year: number | null;
    engine: string | null;
    description: string | null;
    photoUrl: string | null;
    generation: { id: string; name: string; isOther: boolean } | null;
    createdAt: string;
  }[];
};

// --- Mode assistance (S41) --------------------------------------------------------------------------------------------

export const assistanceRequestCreateSchema = z.object({
  message: z.string().trim().min(10, "Explique en quelques mots ce dont tu as besoin").max(1000),
});

export const assistanceStatuses = ["open", "closed"] as const;
export type AssistanceStatus = (typeof assistanceStatuses)[number];
export const assistanceCloseReasons = ["organizer", "admin", "expired"] as const;
export type AssistanceCloseReason = (typeof assistanceCloseReasons)[number];

export type AssistanceRequestView = {
  id: string;
  structure: { id: string; slug: string; name: string };
  requestedBy: { id: string; pseudo: string } | null;
  message: string;
  status: AssistanceStatus;
  createdAt: string;
  expiresAt: string;
  closedAt: string | null;
  closedBy: { id: string; pseudo: string } | null;
  closeReason: AssistanceCloseReason | null;
  /** Interventions faites pendant la demande (écritures tracées). */
  interventions: number;
};

/** `GET /structures/:id/assistance` : ce que voit la structure, et le bandeau d'un super admin. */
export type AssistanceState = {
  /** `null` pour un membre ; `read_only` / `intervention` pour un super admin qui survole. */
  mode: "read_only" | "intervention" | null;
  current: AssistanceRequestView | null;
  history: AssistanceRequestView[];
};

export const adminAssistanceQuery = z.object({ status: z.enum(["open", "closed", "all"]).default("open") });

// --- Newsletter -------------------------------------------------------------------------------------------------------

export const newsletterStatuses = ["draft", "scheduled", "sending", "sent"] as const;
export type NewsletterStatus = (typeof newsletterStatuses)[number];

export const newsletterDraftSchema = z.object({
  subject: z.string().trim().min(3, "Objet trop court").max(120),
  bodyMd: z.string().trim().min(1, "Le message est vide").max(20_000),
});

export const newsletterScheduleSchema = z.object({ at: isoDate });

export type NewsletterView = {
  id: string;
  subject: string;
  bodyMd: string;
  status: NewsletterStatus;
  scheduledAt: string | null;
  sentAt: string | null;
  recipientsCount: number;
  /** Envois faits jusqu'ici (pendant l'envoi). */
  delivered: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Destinataires possibles (opt-in, adresse confirmée, compte actif) : affiché avant de planifier. */
export type NewsletterAudience = { recipients: number };

// --- Accueil ----------------------------------------------------------------------------------------------------------

/** `GET /admin/overview` : toutes les files et leurs compteurs (docs/02 « Administration »). */
export type AdminOverview = {
  structuresPending: number;
  badgesExpiring: number;
  prosToVerify: number;
  reportsPending: number;
  certificationsPending: number;
  plateTransfersArbitrated: number;
  otherVehicles: number;
  malusContestsEscalated: number;
  sanctionsContested: number;
  assistanceOpen: number;
  newslettersScheduled: number;
};

export type AdminAuditRow = {
  id: string;
  action: string;
  actorUserId: string;
  actorPseudo: string | null;
  targetType: string;
  targetId: string;
  structureId: string | null;
  assistanceRequestId: string | null;
  reason: string | null;
  ip: string | null;
  createdAt: string;
};
