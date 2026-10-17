import { z } from "zod";
import type { ApplicationStatus } from "../application";
import {
  type DayAccess,
  dayAccesses,
  departmentSchema,
  type EventAdmission,
  type EventFormat,
  type EventOutlook,
  type EventPublicAccess,
  type EventStatus,
  eventAdmissions,
  eventFormats,
  eventOutlooks,
  eventPublicAccesses,
  type VehicleType,
  vehicleTypes,
} from "../enums";
import { type Grade, grades } from "../grades";
import type { Affinity } from "../rules/affinity";
import { type EventDayInput, MAX_EVENT_DAYS } from "../rules/eventDays";
import { RECURRENCE_MAX_COUNT, type RecurrenceRule } from "../rules/recurrence";
import { isoDate, optionalText, pageQuery } from "./common";

const criteriaSchema = z.object({
  categoryIds: z.array(z.uuid()).max(30).default([]),
  makeIds: z.array(z.uuid()).max(50).default([]),
  countries: z.array(z.string().length(2)).max(30).default([]),
  text: optionalText(1000),
});

const eventFields = z.object({
  title: z.string().trim().min(3).max(120),
  description: optionalText(5000),
  format: z.enum(eventFormats),
  startsAt: isoDate,
  endsAt: isoDate,
  addressLine: optionalText(200),
  postalCode: optionalText(10),
  city: optionalText(80),
  department: departmentSchema.nullish(),
  lat: z.number().min(-90).max(90).nullish(),
  lng: z.number().min(-180).max(180).nullish(),
  admittedVehicleTypes: z.array(z.enum(vehicleTypes)).min(1),
  /** `null` = sans limite. */
  capacity: z.number().int().positive().max(100_000).nullable(),
  maxVehiclesPerUser: z.number().int().min(1).max(10),
  admission: z.enum(eventAdmissions),
  criteria: criteriaSchema.nullish(),
  publicAccess: z.enum(eventPublicAccesses),
  externalTicketUrl: z.url().max(300).nullish(),
  registrationsOpenAt: isoDate,
  previewHours: z.number().int().min(0).max(168),
  lockOffsetMinutes: z.number().int().min(0).max(1440),
  /** Hauts grades (lot 25, § 9.2) : priorité en liste d'attente, avant-première supplémentaire, à partir de quel grade. */
  highGradePriority: z.boolean(),
  highGradePreviewHours: z.number().int().min(0).max(168),
  highGradeMin: z.enum(grades),
  rulesText: optionalText(10000),
  instructions: optionalText(2000),
  /** Types de prestataires attendus (cases à cocher et « + »), sans candidature en V1. */
  vendorTypes: z.array(z.string().trim().min(1).max(40)).max(16),
  /** Rôle « boutique » du staff activé pour cet événement (lot 24). */
  shopEnabled: z.boolean(),
  /**
   * Accès des participants d'un événement sur plusieurs jours (lot 26, S27). Sans effet tant que l'événement n'a pas
   * au moins deux jours (`PUT /events/:id/days`).
   */
  dayAccess: z.enum(dayAccesses),
});

const datesRule = (v: { startsAt?: Date; endsAt?: Date }, ctx: z.RefinementCtx) => {
  if (v.startsAt && v.endsAt && v.endsAt <= v.startsAt) {
    ctx.addIssue({ code: "custom", path: ["endsAt"], message: "La fin doit suivre le début" });
  }
};

/** Création : valeurs par défaut des docs. (Les défauts ne vont jamais dans les schémas de mise à jour : avec zod 4,
 * `.partial()` les garde, et un PATCH partiel remettrait la capacité ou le verrouillage à leur valeur par défaut.) */
export const eventCreateSchema = eventFields
  .extend({
    capacity: eventFields.shape.capacity.default(null),
    maxVehiclesPerUser: eventFields.shape.maxVehiclesPerUser.default(1),
    publicAccess: eventFields.shape.publicAccess.default("free"),
    previewHours: eventFields.shape.previewHours.default(24),
    lockOffsetMinutes: eventFields.shape.lockOffsetMinutes.default(120),
    highGradePriority: eventFields.shape.highGradePriority.default(false),
    highGradePreviewHours: eventFields.shape.highGradePreviewHours.default(0),
    highGradeMin: eventFields.shape.highGradeMin.default("circuit"),
    vendorTypes: eventFields.shape.vendorTypes.default([]),
    shopEnabled: eventFields.shape.shopEnabled.default(false),
    dayAccess: eventFields.shape.dayAccess.default("whole"),
  })
  .superRefine(datesRule);
export type EventCreate = z.infer<typeof eventCreateSchema>;

export const eventUpdateSchema = eventFields.partial().superRefine(datesRule);
export type EventUpdate = z.infer<typeof eventUpdateSchema>;

export const outlookUpdateSchema = z.object({ outlook: z.enum(eventOutlooks) });

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Heure au format HH:MM");

/** Un jour saisi dans l'assistant (lot 26) : date locale, heures murales dans le fuseau de l'événement. */
export const eventDayInputSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date au format AAAA-MM-JJ")
    .refine((s) => !Number.isNaN(Date.parse(`${s}T12:00:00Z`)) && new Date(`${s}T12:00:00Z`).toISOString().startsWith(s), {
      message: "Date inconnue",
    }),
  startTime: hhmm,
  /** Avant ou égale au début : le lendemain (nocturne après minuit). */
  endTime: hhmm,
  /** `null` = la capacité de l'événement. */
  capacity: z.number().int().positive().max(100_000).nullable().default(null),
}) satisfies z.ZodType<EventDayInput, unknown>;

/**
 * `PUT /events/:id/days` : la liste complète des jours (lot 26). Liste vide = événement d'un seul jour (dates de
 * l'événement inchangées). Deux jours ou plus : les dates de l'événement deviennent les bornes.
 */
export const eventDaysPutSchema = z.object({
  days: z.array(eventDayInputSchema).max(MAX_EVENT_DAYS),
  dayAccess: z.enum(dayAccesses).optional(),
});
export type EventDaysPut = z.infer<typeof eventDaysPutSchema>;

/** Un jour d'un événement sur plusieurs jours, tel que les clients le reçoivent. */
export type EventDay = {
  id: string;
  /** Date locale `AAAA-MM-JJ` (fuseau de l'événement). */
  date: string;
  startsAt: string;
  endsAt: string;
  /** `null` = la capacité de l'événement. */
  capacity: number | null;
  /** Places restantes ce jour (`null` = sans limite). */
  remaining: number | null;
};

/** Récurrence (« chaque premier dimanche du mois ») : créée une seule fois, les occurrences sont des brouillons. */
export const recurrenceRuleSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("weekly"),
    interval: z.number().int().min(1).max(4),
    count: z.number().int().min(1).max(RECURRENCE_MAX_COUNT),
  }),
  z.object({
    kind: z.literal("monthly_nth_weekday"),
    nth: z
      .number()
      .int()
      .refine((n) => n === -1 || (n >= 1 && n <= 4), "Rang de 1 à 4, ou -1 pour le dernier"),
    weekday: z.number().int().min(0).max(6),
    count: z.number().int().min(1).max(RECURRENCE_MAX_COUNT),
  }),
]) satisfies z.ZodType<RecurrenceRule>;
export const recurrenceCreateSchema = z.object({ rule: recurrenceRuleSchema });

const zoneFields = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Z0-9]{1,4}$/, "1 à 4 lettres ou chiffres en majuscules"),
  name: z.string().trim().min(1).max(60),
  capacity: z.number().int().positive().nullish(),
  position: z.number().int().min(0).max(100),
});
export const zoneCreateSchema = zoneFields.extend({ position: zoneFields.shape.position.default(0) });
export const zoneUpdateSchema = zoneFields.partial();

export const eventSorts = ["date", "affinity", "distance"] as const;
export type EventSort = (typeof eventSorts)[number];

export const eventListQuerySchema = pageQuery.extend({
  format: z.enum(eventFormats).optional(),
  categoryId: z.uuid().optional(),
  department: departmentSchema.optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().min(1).max(500).optional(),
  structureId: z.uuid().optional(),
  q: z.string().trim().max(80).optional(),
  /** `upcoming` (défaut) : pas encore terminés, du plus proche au plus lointain ; `past` : terminés, du plus récent. */
  scope: z.enum(["upcoming", "past"]).default("upcoming"),
  /**
   * Ordre (lot 29, Explorer) : `date` (défaut), `affinity` (organisateurs suivis, centres d'intérêt, proximité : S34,
   * connecté), `distance` (à la position envoyée ou au secteur du profil). Sans position connue, retombe sur la date.
   */
  sort: z.enum(eventSorts).default("date"),
});
export type EventListQuery = z.infer<typeof eventListQuerySchema>;

export type EventZone = { id: string; code: string; name: string; capacity: number | null; position: number };

export type EventCounters = {
  /** Places restantes (`null` sans limite). */
  remaining: number | null;
  accepted: number;
  pending: number;
  waitlisted: number;
  refused: number;
};

export type EventCard = {
  id: string;
  slug: string;
  title: string;
  format: EventFormat;
  startsAt: string;
  endsAt: string;
  city: string | null;
  department: string | null;
  /** Position sur la carte de `/evenements`. */
  lat: number | null;
  lng: number | null;
  posterUrl: string | null;
  status: EventStatus;
  outlook: EventOutlook;
  structure: { id: string; slug: string; name: string; logoUrl: string | null };
  capacity: number | null;
  remaining: number | null;
  /** Distance à ma position (lot 29) : renseignée seulement quand la requête en a une (envoyée ou secteur du profil). */
  distanceKm?: number | null;
  /** Affinités avec moi (lot 29) : renseignées pour le tri `affinity`. */
  affinity?: Affinity;
};

export type MyApplicationBrief = {
  id: string;
  vehicleId: string | null;
  status: ApplicationStatus;
  /** Lot 26 : jour choisi (`null` = tout l'événement). */
  eventDayId: string | null;
};

export type EventPublic = EventCard & {
  description: string | null;
  addressLine: string | null;
  postalCode: string | null;
  timezone: string;
  vendorTypes: string[];
  admittedVehicleTypes: VehicleType[];
  maxVehiclesPerUser: number;
  admission: EventAdmission;
  criteria: z.infer<typeof criteriaSchema> | null;
  publicAccess: EventPublicAccess;
  externalTicketUrl: string | null;
  registrationsOpenAt: string;
  previewHours: number;
  /** Hauts grades (lot 25) : priorité en liste d'attente et avant-première supplémentaire, à partir de `highGradeMin`. */
  highGradePriority: boolean;
  highGradePreviewHours: number;
  highGradeMin: Grade;
  lockAt: string;
  isLocked: boolean;
  rulesText: string | null;
  /** Consignes : réservées aux inscrits retenus et à l'organisation. */
  instructions: string | null;
  acceptedCount: number;
  /** Lot 26 : jours (vide = événement d'un jour) et mode d'accès (`whole` pour un événement d'un jour). */
  days: EventDay[];
  dayAccess: DayAccess;
  /** Connecté seulement. */
  myApplications?: MyApplicationBrief[];
  registrationOpensAtForMe?: string;
};

export type EventOrganizer = EventPublic & {
  zones: EventZone[];
  counters: EventCounters;
  publishedAt: string | null;
  cancelledAt: string | null;
  lockedAt: string | null;
  /** Duplication ou occurrence d'une série : l'événement d'origine. */
  parentEventId: string | null;
  recurrenceRule: RecurrenceRule | null;
  /** Rôle « boutique » activé (lot 24). */
  shopEnabled: boolean;
};
