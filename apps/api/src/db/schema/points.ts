// Points, saisons, contestations de malus (ARCHITECTURE.md § 1.7, § 2.6).
import { contestStatuses, pointKinds } from "@orasso/shared";
import { sql } from "drizzle-orm";
import { date, index, integer, pgEnum, pgTable, text, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { applications } from "./applications";
import { user } from "./auth";
import { timestamps, tstz } from "./common";
import { events } from "./events";

export const pointKindEnum = pgEnum("point_kind", pointKinds);
export const contestStatusEnum = pgEnum("contest_status", contestStatuses);

/** Une saison = une année civile (choix C10). */
export const seasons = pgTable(
  "seasons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    /** Report de fin de saison appliqué (tâche `season.rollover`) : garde la tâche idempotente. */
    openedAt: tstz("opened_at"),
    ...timestamps,
  },
  (t) => [unique("seasons_starts_on_key").on(t.startsOn)],
);

/** Journal des points : un seul compteur, `profiles.points_season` = somme de la saison courante. */
export const pointEntries = pgTable(
  "point_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "restrict" }),
    kind: pointKindEnum("kind").notNull(),
    /** Négatif pour un malus. */
    points: integer("points").notNull(),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
    applicationId: uuid("application_id").references(() => applications.id, { onDelete: "set null" }),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    note: text("note"),
    ...timestamps,
  },
  (t) => [
    index("point_entries_user_season_idx").on(t.userId, t.seasonId),
    // Jamais deux fois les points d'une même candidature (participation, malus, annulation du malus).
    uniqueIndex("point_entries_application_kind_key")
      .on(t.applicationId, t.kind)
      .where(sql`${t.applicationId} is not null`),
    // Points staff : une fois par événement et par personne.
    uniqueIndex("point_entries_staff_key").on(t.eventId, t.userId).where(sql`${t.kind} = 'staff'`),
    // Report de saison : une fois par saison et par personne.
    uniqueIndex("point_entries_carryover_key").on(t.userId, t.seasonId).where(sql`${t.kind} = 'season_carryover'`),
  ],
);

/** Contestation d'un malus : 7 jours pour contester, 7 jours pour l'organisateur, puis l'administration. */
export const malusContests = pgTable(
  "malus_contests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pointEntryId: uuid("point_entry_id")
      .notNull()
      .unique("malus_contests_point_entry_key")
      .references(() => pointEntries.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    applicationId: uuid("application_id").references(() => applications.id, { onDelete: "set null" }),
    message: text("message").notNull(),
    status: contestStatusEnum("status").notNull().default("pending"),
    decidedBy: text("decided_by").references(() => user.id, { onDelete: "set null" }),
    decidedAt: tstz("decided_at"),
    organizerNote: text("organizer_note"),
    escalatedAt: tstz("escalated_at"),
    ...timestamps,
  },
  (t) => [index("malus_contests_event_idx").on(t.eventId, t.status), index("malus_contests_status_idx").on(t.status)],
);
