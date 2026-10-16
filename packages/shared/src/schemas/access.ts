// Accès, staff, jour J (ARCHITECTURE.md § 3, § 4, § 5.3 « Accès, staff, jour J »).
import { z } from "zod";
import type { ApplicationStatus } from "../application";
import {
  type CheckinMethod,
  checkinMethods,
  type EventFormat,
  type ScanServerResult,
  type StaffPresence,
  staffPresences,
  type VehicleType,
} from "../enums";
import type { Grade } from "../grades";
import { localScanDecisions, type PassRevokedReason } from "../qr/pass";
import { type StaffRole, staffRoleSchema } from "../roles";
import { isoDate, optionalText } from "./common";

// --- Pass et clés ---------------------------------------------------------------------------------------------

/** `GET /api/applications/:id/pass` : le QR du titulaire. */
export type AccessPass = {
  applicationId: string;
  eventId: string;
  eventNo: number;
  passId: string;
  /** Texte du QR (version 6-M, mode alphanumérique) ; `null` si le pass est révoqué. */
  payload: string | null;
  issuedAt: string;
  revokedAt: string | null;
  revokedReason: PassRevokedReason | null;
};

/** `GET /api/keys` : clés publiques Ed25519 (32 octets, base64url). */
export type PublicSigningKey = {
  kid: number;
  algorithm: string;
  publicKey: string;
  activeFrom: string;
  retiredAt: string | null;
};

// --- Staff ----------------------------------------------------------------------------------------------------

export const presenceSchema = z.object({ present: z.boolean() });

export const eventStaffUpdateSchema = z
  .object({
    /** Rôles pour cet événement ; `null` = ceux de la structure. */
    roles: z.array(staffRoleSchema).max(6).nullable(),
    canDecide: z.boolean().nullable(),
    /** L'organisateur corrige la présence jusqu'au règlement de J+2 (choix C13). */
    presence: z.enum(staffPresences),
  })
  .partial();
export type EventStaffUpdate = z.infer<typeof eventStaffUpdateSchema>;

/** Organisateur : présences et relances (`GET /api/events/:id/staff`). */
export type EventStaffMember = {
  userId: string;
  pseudo: string;
  roles: StaffRole[];
  /** Rôles ajustés pour l'événement (`null` = ceux de la structure). */
  rolesOverride: StaffRole[] | null;
  canDecide: boolean;
  presence: StaffPresence;
  presenceUpdatedAt: string | null;
  reminderCount: number;
  lastRemindedAt: string | null;
  syncedAt: string | null;
};

/** « Où je suis staff » (`GET /api/me/staff-events`). */
export type MyStaffEvent = {
  event: {
    id: string;
    eventNo: number;
    slug: string;
    title: string;
    format: EventFormat;
    startsAt: string;
    endsAt: string;
    city: string | null;
    lockAt: string;
    isLocked: boolean;
  };
  structure: { id: string; name: string };
  roles: StaffRole[];
  canDecide: boolean;
  presence: StaffPresence;
  syncedAt: string | null;
  /** Jamais synchronisé, ou synchronisé avant le verrouillage alors qu'il est passé. */
  pendingSync: boolean;
  staffModeOpensAt: string;
  staffModeClosesAt: string;
  staffModeOpen: boolean;
};

export const staffSyncQuerySchema = z.object({ since: isoDate.optional() });

/** Entrée de la liste d'accès synchronisée (une par pass, valide ou révoqué). */
export type AccessListEntry = {
  passId: string;
  applicationId: string;
  status: "valid" | "revoked";
  revokedReason: PassRevokedReason | null;
  pseudo: string;
  vehicleLabel: string | null;
  vehicleType: VehicleType | null;
  categories: string[];
  /** 3 premiers caractères de la plaque normalisée (recherche hors ligne) ; `null` sans plaque. */
  plateHint: string | null;
  /** HMAC-SHA256(event.plateSalt, plaque normalisée), hex tronqué à 16 caractères. */
  plateHash: string | null;
  /** Plaque en clair : organisateur seulement (docs/01). */
  plate?: string | null;
  zoneCode: string | null;
  zoneName: string | null;
  checkedInAt: string | null;
  checkinMethod: CheckinMethod | null;
  /** Coordonnées : super staff et organisateur seulement. */
  contact?: { firstName: string | null; lastName: string | null; phone: string | null; email: string };
  updatedAt: string;
};

/**
 * `GET /api/events/:id/staff/sync?since=` (§ 4.1). Signature Ed25519 (clé `signatureKid`) du SHA-256 de
 * `accessListSigningText(corps)` : tout le corps sauf `signature` et `signatureKid`.
 */
export type StaffSync = {
  event: {
    id: string;
    eventNo: number;
    title: string;
    startsAt: string;
    endsAt: string;
    lockAt: string;
    isLocked: boolean;
    /** Sel du hachage de plaque (16 octets, base64url) : l'appli hache la saisie du staff. */
    plateSalt: string;
    zones: { id: string; code: string; name: string; capacity: number | null }[];
  };
  keys: { kid: number; publicKey: string; retiredAt: string | null }[];
  myRoles: StaffRole[];
  /** Synchro complète (`false` = delta depuis `since`). */
  full: boolean;
  entries: AccessListEntry[];
  /** Toujours vide en V1 : un pass n'est jamais supprimé, il est révoqué (entrée `revoked`). */
  removedPassIds: string[];
  /** À renvoyer en `since` : horodatage de la dernière modification incluse. */
  cursor: string | null;
  generatedAt: string;
  signatureKid: number;
  signature: string;
};

// --- Scans et pointage ------------------------------------------------------------------------------------------

const scanItem = z.object({
  kind: z.literal("scan"),
  /** Généré par l'appareil : clé d'idempotence. */
  id: z.uuid(),
  passId: z.uuid().nullish(),
  rawPayload: z.string().max(512).nullish(),
  decision: z.enum(localScanDecisions),
  reason: optionalText(80),
  zoneCode: optionalText(8),
  scannedAt: isoDate,
});

/** Pointage fait hors ligne depuis la liste (« Pointer ») ou le pointage rapide par plaque. */
const checkinItem = z.object({
  kind: z.enum(["manual", "plate"]),
  id: z.uuid(),
  applicationId: z.uuid(),
  note: optionalText(200),
  scannedAt: isoDate,
});

export const scanBatchSchema = z.object({
  deviceId: z.uuid(),
  items: z
    .array(z.discriminatedUnion("kind", [scanItem, checkinItem]))
    .min(1)
    .max(200),
});
export type ScanBatch = z.infer<typeof scanBatchSchema>;
export type ScanBatchItem = ScanBatch["items"][number];

export type ScanBatchResult = {
  id: string;
  result: ScanServerResult;
  applicationId: string | null;
  checkedInAt: string | null;
  /** Lecture qui a fait entrer le véhicule (pour un doublon). */
  duplicateOf: string | null;
  zone: { code: string; name: string } | null;
  /** `settled` : points de l'événement déjà réglés, l'élément est refusé (l'appli le retire de sa file). */
  reason?: "settled";
};

export const checkinCreateSchema = z.object({
  applicationId: z.uuid(),
  method: z.enum(["manual", "plate"]).default("manual"),
  note: optionalText(200),
});

export const checkinsByPlatesSchema = z.object({ plates: z.array(z.string().trim().min(2).max(20)).min(1).max(300) });

export const checkinsQuerySchema = z.object({
  method: z.enum(checkinMethods).optional(),
  zoneId: z.uuid().optional(),
  q: z.string().trim().max(40).optional(),
});

export const staffSearchQuerySchema = z.object({ q: z.string().trim().min(2).max(40) });

/** Une ligne de pointage (liste, recherche, pointage par plaque). */
export type CheckinListItem = {
  applicationId: string;
  pseudo: string;
  vehicleLabel: string | null;
  zone: { code: string; name: string } | null;
  status: ApplicationStatus;
  checkedInAt: string | null;
  method: CheckinMethod | null;
  note: string | null;
};

export type CheckinResult = CheckinListItem & { created: boolean };

export type ScanReport = {
  totals: {
    scans: number;
    accepted: number;
    checkins: number;
    expected: number;
    byMethod: Record<CheckinMethod, number>;
    duplicates: number;
    rejected: number;
    overrides: number;
    unknown: number;
  };
  byDevice: {
    deviceId: string | null;
    deviceName: string | null;
    staffPseudo: string | null;
    scans: number;
    duplicates: number;
  }[];
  duplicates: {
    applicationId: string;
    pseudo: string;
    vehicleLabel: string | null;
    first: { scanId: string | null; device: string | null; staff: string | null; at: string };
    others: { scanId: string; device: string | null; staff: string | null; at: string; result: ScanServerResult }[];
  }[];
  overrides: {
    scanId: string;
    applicationId: string | null;
    pseudo: string | null;
    staff: string | null;
    at: string;
  }[];
  rejected: {
    scanId: string;
    result: ScanServerResult;
    localDecision: string;
    reason: string | null;
    pseudo: string | null;
    staff: string | null;
    at: string;
  }[];
};

/** Direct de l'organisateur (`GET /api/events/:id/live`, canal `event:<id>:live`). */
export type LiveCounters = {
  arrived: number;
  expected: number;
  byCategory: { categoryId: string; slug: string; label: string; arrived: number; expected: number }[];
  byZone: { zoneId: string | null; code: string | null; name: string | null; arrived: number; expected: number }[];
  staffPresent: number;
  staffExpected: number;
  alertsOpen: number;
};

export const expressInviteSchema = z.object({ email: z.email().max(200) });

/** Formulaire de l'inscription express (écran au lot 13). */
export const expressSignupSchema = z
  .object({
    pseudo: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_.]{3,24}$/),
    password: z.string().min(10).max(128),
    firstName: z.string().trim().min(1).max(60),
    lastName: z.string().trim().min(1).max(60),
    plate: optionalText(20),
    unregistered: z.boolean().default(false),
    makeId: z.uuid(),
    modelId: z.uuid(),
    generationId: z.uuid().nullish(),
  })
  .refine((v) => v.unregistered || Boolean(v.plate), { path: ["plate"], message: "Plaque obligatoire" });
export type ExpressSignup = z.infer<typeof expressSignupSchema>;

export type ExpressInvitePublic = {
  event: { id: string; slug: string; title: string; startsAt: string; city: string | null };
  email: string;
  expiresAt: string;
  used: boolean;
};

// --- Terrain : alertes et main courante ---------------------------------------------------------------------------

export const staffAlertCreateSchema = z.object({
  clientId: z.uuid().nullish(),
  lat: z.number().min(-90).max(90).nullish(),
  lng: z.number().min(-180).max(180).nullish(),
  message: optionalText(300),
});

export const incidentCreateSchema = z.object({
  clientId: z.uuid().nullish(),
  occurredAt: isoDate,
  location: optionalText(200),
  lat: z.number().min(-90).max(90).nullish(),
  lng: z.number().min(-180).max(180).nullish(),
  description: z.string().trim().min(1).max(4000),
});

// --- Points ---------------------------------------------------------------------------------------------------

export const malusContestSchema = z.object({ message: z.string().trim().min(1).max(1000) });
export const contestDecideSchema = z.object({
  decision: z.enum(["accept", "reject"]),
  note: optionalText(1000),
  /** Acceptée : pointer aussi la présence (« entré sans scan »), pour le bilan. */
  checkin: z.boolean().default(false),
});
export const pointsAdjustSchema = z.object({
  points: z
    .number()
    .int()
    .min(-1000)
    .max(1000)
    .refine((n) => n !== 0),
  note: z.string().trim().min(1).max(300),
});

export type MyPoints = {
  pointsSeason: number;
  grade: Grade;
  next: { grade: Grade; threshold: number } | null;
  season: { name: string; startsOn: string; endsOn: string };
  entries: {
    id: string;
    kind: string;
    points: number;
    at: string;
    event: { id: string; title: string } | null;
    applicationId: string | null;
    note: string | null;
    /** Malus : échéance et état de la contestation. */
    contest: { deadline: string; canContest: boolean; status: string | null } | null;
  }[];
  /** Événements terminés en attente du règlement de J+2 (« Pointage en attente »). */
  pending: { eventId: string; title: string; settlesAt: string }[];
};

export type MalusContestView = {
  id: string;
  status: string;
  message: string;
  createdAt: string;
  escalatesAt: string;
  escalatedAt: string | null;
  decidedAt: string | null;
  organizerNote: string | null;
  user: { userId: string; pseudo: string };
  event: { id: string; title: string };
  applicationId: string | null;
  checkedIn: boolean;
};

// --- QR de compte ---------------------------------------------------------------------------------------------

export const accountQrVerifySchema = z.object({ payload: z.string().trim().min(1).max(64) });

export type AccountQrSecret = { secret: string; shortId: string; stepSeconds: number; digits: number };

export type AccountQrVerify =
  // Résultat d'un scan par un pro (lot 14) : pseudo, grade et remise du pro pour ce grade, rien d'autre.
  | { valid: true; pseudo: string; grade: Grade; discount: { percent: number } | null }
  | { valid: false; reason: "malformed" | "unknown" | "expired" | "replayed" };
