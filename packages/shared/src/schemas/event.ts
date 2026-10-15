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
  capacity: z.number().int().positive().max(100_000).nullable().default(null),
  maxVehiclesPerUser: z.number().int().min(1).max(10).default(1),
  admission: z.enum(eventAdmissions),
  criteria: criteriaSchema.nullish(),
  publicAccess: z.enum(eventPublicAccesses).default("free"),
  externalTicketUrl: z.url().max(300).nullish(),
  registrationsOpenAt: isoDate,
  previewHours: z.number().int().min(0).max(168).default(24),
  lockOffsetMinutes: z.number().int().min(0).max(1440).default(120),
  rulesText: optionalText(10000),
  instructions: optionalText(2000),
});

const datesRule = (v: { startsAt?: Date; endsAt?: Date }, ctx: z.RefinementCtx) => {
  if (v.startsAt && v.endsAt && v.endsAt <= v.startsAt) {
    ctx.addIssue({ code: "custom", path: ["endsAt"], message: "La fin doit suivre le début" });
  }
};

export const eventCreateSchema = eventFields.superRefine(datesRule);
export type EventCreate = z.infer<typeof eventCreateSchema>;

export const eventUpdateSchema = eventFields.partial().superRefine(datesRule);
export type EventUpdate = z.infer<typeof eventUpdateSchema>;

export const outlookUpdateSchema = z.object({ outlook: z.enum(eventOutlooks) });

export const zoneCreateSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Z0-9]{1,4}$/, "1 à 4 lettres ou chiffres en majuscules"),
  name: z.string().trim().min(1).max(60),
  capacity: z.number().int().positive().nullish(),
  position: z.number().int().min(0).max(100).default(0),
});
export const zoneUpdateSchema = zoneCreateSchema.partial();

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
  posterUrl: string | null;
  status: EventStatus;
  outlook: EventOutlook;
  structure: { id: string; slug: string; name: string; logoUrl: string | null };
  capacity: number | null;
  remaining: number | null;
};

export type MyApplicationBrief = { id: string; vehicleId: string | null; status: ApplicationStatus };

export type EventPublic = EventCard & {
  description: string | null;
  addressLine: string | null;
  postalCode: string | null;
  lat: number | null;
  lng: number | null;
  timezone: string;
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
};
