// Événements, jours, zones (ARCHITECTURE.md § 1.4). Invitations nominatives : `invitations.ts` (lot 25).

import type { RecurrenceRule } from "@orasso/shared";
import {
  dayAccesses,
  eventAdmissions,
  eventFormats,
  eventOutlooks,
  eventPublicAccesses,
  eventStatuses,
} from "@orasso/shared";
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { bytea, timestamps, tstz } from "./common";
import { gradeEnum } from "./profiles";
import { structures } from "./structures";

export const eventFormatEnum = pgEnum("event_format", eventFormats);
export const eventAdmissionEnum = pgEnum("event_admission", eventAdmissions);
export const eventPublicAccessEnum = pgEnum("event_public_access", eventPublicAccesses);
export const eventStatusEnum = pgEnum("event_status", eventStatuses);
export const eventOutlookEnum = pgEnum("event_outlook", eventOutlooks);
export const dayAccessEnum = pgEnum("day_access", dayAccesses);

export type EventCriteria = { categoryIds: string[]; makeIds: string[]; countries: string[]; text: string | null };

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Identifiant court (4 octets) embarqué dans le QR (lot 06). */
    eventNo: integer("event_no").notNull().generatedAlwaysAsIdentity().unique("events_event_no_key"),
    /** Sel du hachage de plaque de la synchro staff (correction du coordinateur, 15/10) ; généré par l'API. */
    plateSalt: bytea("plate_salt").notNull(),
    structureId: uuid("structure_id")
      .notNull()
      .references(() => structures.id, { onDelete: "restrict" }),
    slug: text("slug").notNull().unique("events_slug_key"),
    title: text("title").notNull(),
    description: text("description"),
    posterKey: text("poster_key"),
    format: eventFormatEnum("format").notNull(),
    startsAt: tstz("starts_at").notNull(),
    endsAt: tstz("ends_at").notNull(),
    timezone: text("timezone").notNull().default("Europe/Paris"),
    addressLine: text("address_line"),
    postalCode: text("postal_code"),
    city: text("city"),
    department: text("department"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    admittedVehicleTypes: text("admitted_vehicle_types").array().notNull(),
    /** `null` = sans limite. */
    capacity: integer("capacity"),
    maxVehiclesPerUser: smallint("max_vehicles_per_user").notNull().default(1),
    admission: eventAdmissionEnum("admission").notNull(),
    criteria: jsonb("criteria").$type<EventCriteria>(),
    publicAccess: eventPublicAccessEnum("public_access").notNull().default("free"),
    externalTicketUrl: text("external_ticket_url"),
    /** Billetterie Orasso ouverte pour cet événement (deuxième interrupteur, après le réglage général, lot 14). */
    ticketsEnabled: boolean("tickets_enabled").notNull().default(false),
    /** Rôle « boutique » activé pour cet événement (lot 24) : contrôle des billets du public, compteur d'entrées. */
    shopEnabled: boolean("shop_enabled").notNull().default(false),
    /** Lot 26 (S27) : accès des participants d'un événement sur plusieurs jours ; `whole` pour un événement d'un jour. */
    dayAccess: dayAccessEnum("day_access").notNull().default("whole"),
    status: eventStatusEnum("status").notNull().default("draft"),
    outlook: eventOutlookEnum("outlook").notNull().default("maintained"),
    registrationsOpenAt: tstz("registrations_open_at").notNull(),
    previewHours: smallint("preview_hours").notNull().default(24),
    lockOffsetMinutes: integer("lock_offset_minutes").notNull().default(120),
    /** Hauts grades (lot 25, ARCHITECTURE-SUITE § 9.2) : priorité en liste d'attente, avant-première supplémentaire. */
    highGradePriority: boolean("high_grade_priority").notNull().default(false),
    highGradePreviewHours: smallint("high_grade_preview_hours").notNull().default(0),
    highGradeMin: gradeEnum("high_grade_min").notNull().default("circuit"),
    /** Trace posée par la tâche `event.lock` ; la règle vit dans `isLocked()`. */
    lockedAt: tstz("locked_at"),
    rulesText: text("rules_text"),
    instructions: text("instructions"),
    /** Types de prestataires attendus (cases à cocher et « + » de l'assistant, lot 13) ; pas de candidature en V1. */
    vendorTypes: text("vendor_types").array().notNull().default(sql`'{}'::text[]`),
    /** Duplication ou récurrence (lot 13) : l'événement dont celui-ci est la copie ou une occurrence. */
    parentEventId: uuid("parent_event_id").references((): AnyPgColumn => events.id, { onDelete: "set null" }),
    /** Règle de récurrence, posée sur l'événement d'origine seulement (les occurrences sont créées une fois). */
    recurrenceRule: jsonb("recurrence_rule").$type<RecurrenceRule>(),
    publishedAt: tstz("published_at"),
    cancelledAt: tstz("cancelled_at"),
    settledAt: tstz("settled_at"),
    /** Remerciement envoyé aux présents (posé au lot 20, utilisé au lot 27). */
    thanksSentAt: tstz("thanks_sent_at"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("events_structure_starts_idx").on(t.structureId, t.startsAt),
    index("events_status_starts_idx").on(t.status, t.startsAt),
    index("events_department_idx").on(t.department),
    index("events_lat_lng_idx").on(t.lat, t.lng),
    // Lot 29 : recherche par morceau de titre ou de ville, voir `0029_search_extension`.
    index("events_title_trgm_idx").using("gin", t.title.op("gin_trgm_ops")),
    index("events_city_trgm_idx").using("gin", t.city.op("gin_trgm_ops")),
    check("events_dates_check", sql`${t.endsAt} > ${t.startsAt}`),
    check("events_capacity_check", sql`${t.capacity} is null or ${t.capacity} > 0`),
    check("events_lock_offset_check", sql`${t.lockOffsetMinutes} between 0 and 1440`),
    check("events_max_vehicles_check", sql`${t.maxVehiclesPerUser} >= 1`),
    check("events_high_grade_preview_check", sql`${t.highGradePreviewHours} between 0 and 168`),
  ],
);

/**
 * Événements sur plusieurs jours (lot 26, ARCHITECTURE-SUITE § 10) : une ligne par jour, au moins deux. Aucune ligne
 * = événement d'un jour (tous les événements d'avant le lot 26). `events.starts_at` / `ends_at` = bornes.
 */
export const eventDays = pgTable(
  "event_days",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    /** Date locale (fuseau de l'événement). */
    dayDate: date("day_date", { mode: "string" }).notNull(),
    startsAt: tstz("starts_at").notNull(),
    endsAt: tstz("ends_at").notNull(),
    /** Places ce jour ; `null` = la capacité de l'événement. */
    capacity: integer("capacity"),
    ...timestamps,
  },
  (t) => [
    unique("event_days_event_day_key").on(t.eventId, t.dayDate),
    check("event_days_dates_check", sql`${t.endsAt} > ${t.startsAt}`),
    check("event_days_capacity_check", sql`${t.capacity} is null or ${t.capacity} > 0`),
  ],
);

export const eventZones = pgTable(
  "event_zones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    /** 1 à 4 caractères, affichés en grand au scan (« A », « JDM »). */
    code: text("code").notNull(),
    name: text("name").notNull(),
    capacity: integer("capacity"),
    position: smallint("position").notNull().default(0),
    ...timestamps,
  },
  (t) => [unique("event_zones_event_code_key").on(t.eventId, t.code)],
);
