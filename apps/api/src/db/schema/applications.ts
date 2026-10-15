// Candidatures et journal des transitions (ARCHITECTURE.md § 1.5).
import {
  applicationKinds,
  applicationSources,
  applicationStatuses,
  type FilteringOpinion,
  type RefusalReason,
  transitionActors,
} from "@orasso/shared";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { timestamps, tstz } from "./common";
import { eventDays, events, eventZones } from "./events";
import { vehicles } from "./vehicles";

export const applicationKindEnum = pgEnum("application_kind", applicationKinds);
export const applicationStatusEnum = pgEnum("application_status", applicationStatuses);
export const applicationSourceEnum = pgEnum("application_source", applicationSources);
export const transitionActorEnum = pgEnum("transition_actor", transitionActors);

export type FilteringOpinionEntry = { userId: string; opinion: FilteringOpinion; note: string | null; at: string };

export const applications = pgTable(
  "applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: applicationKindEnum("kind").notNull().default("vehicle"),
    vehicleId: uuid("vehicle_id").references(() => vehicles.id, { onDelete: "restrict" }),
    /** [préparé] Multi-jours. */
    eventDayId: uuid("event_day_id").references(() => eventDays.id, { onDelete: "set null" }),
    status: applicationStatusEnum("status").notNull(),
    rulesAcceptedAt: tstz("rules_accepted_at").notNull(),
    companions: smallint("companions").notNull().default(0),
    message: text("message"),
    followStructure: boolean("follow_structure").notNull(),
    decidedAt: tstz("decided_at"),
    decidedBy: text("decided_by").references(() => user.id, { onDelete: "set null" }),
    refusalReasons: text("refusal_reasons").array().$type<RefusalReason[]>().notNull().default(sql`'{}'::text[]`),
    refusalNote: text("refusal_note"),
    refusalSent: boolean("refusal_sent").notNull().default(true),
    waitlistRank: integer("waitlist_rank"),
    waitlistedAt: tstz("waitlisted_at"),
    offeredAt: tstz("offered_at"),
    offerExpiresAt: tstz("offer_expires_at"),
    withdrawnAt: tstz("withdrawn_at"),
    /** Désistement après verrouillage → malus à J+2 (lot 06). */
    withdrawnAfterLock: boolean("withdrawn_after_lock").notNull().default(false),
    zoneId: uuid("zone_id").references(() => eventZones.id, { onDelete: "set null" }),
    source: applicationSourceEnum("source").notNull().default("self"),
    filteringOpinion: jsonb("filtering_opinion").$type<FilteringOpinionEntry[]>(),
    ...timestamps,
  },
  (t) => [
    index("applications_event_status_idx").on(t.eventId, t.status),
    index("applications_user_status_idx").on(t.userId, t.status),
    index("applications_event_waitlist_idx").on(t.eventId, t.waitlistRank),
    // Une candidature active par véhicule et par événement.
    uniqueIndex("applications_active_vehicle_key")
      .on(t.eventId, t.vehicleId)
      .where(sql`${t.status} in ('pending', 'accepted', 'waitlisted', 'offered')`),
    check("applications_vehicle_kind_check", sql`${t.kind} <> 'vehicle' or ${t.vehicleId} is not null`),
    check("applications_companions_check", sql`${t.companions} between 0 and 9`),
  ],
);

/** Journal des transitions : toute transition passe par `ApplicationService` qui écrit ici. */
export const applicationEvents = pgTable(
  "application_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    fromStatus: applicationStatusEnum("from_status"),
    toStatus: applicationStatusEnum("to_status").notNull(),
    actor: transitionActorEnum("actor").notNull(),
    actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
    reason: text("reason"),
    at: tstz("at").notNull(),
  },
  (t) => [index("application_events_application_idx").on(t.applicationId, t.at)],
);
