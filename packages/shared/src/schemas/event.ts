import { z } from "zod";
import type { ApplicationStatus } from "../application";
import {
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
import type { Affinity } from "../rules/affinity";
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
  rulesText: optionalText(10000),
  instructions: optionalText(2000),
  /** Types de prestataires attendus (cases à cocher et « + »), sans candidature en V1. */
  vendorTypes: z.array(z.string().trim().min(1).max(40)).max(16),
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
    vendorTypes: eventFields.shape.vendorTypes.default([]),
  })
  .superRefine(datesRule);
export type EventCreate = z.infer<typeof eventCreateSchema>;

export const eventUpdateSchema = eventFields.partial().superRefine(datesRule);
export type EventUpdate = z.infer<typeof eventUpdateSchema>;

export const outlookUpdateSchema = z.object({ outlook: z.enum(eventOutlooks) });

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

export type MyApplicationBrief = { id: string; vehicleId: string | null; status: ApplicationStatus };

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
  lockAt: string;
  isLocked: boolean;
  rulesText: string | null;
  /** Consignes : réservées aux inscrits retenus et à l'organisation. */
  instructions: string | null;
  acceptedCount: number;
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
};
