// Après l'événement (lot 27, ARCHITECTURE-SUITE § 11) : bilans, notes internes, exports et consultations des
// coordonnées tracés.
import type { EventReportData } from "@orasso/shared";
import { sql } from "drizzle-orm";
import { check, date, index, inet, integer, jsonb, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";

import { applications } from "./applications";
import { user } from "./auth";
import { timestamps, tstz } from "./common";
import { events } from "./events";
import { structures } from "./structures";

/**
 * Bilan d'un événement, calculé une fois au règlement (J+2) puis rafraîchi une fois à J+8 (fin des avis). Des nombres
 * seulement : aucune personne n'y figure. Une ligne par événement.
 */
export const eventReports = pgTable("event_reports", {
  eventId: uuid("event_id")
    .primaryKey()
    .references(() => events.id, { onDelete: "cascade" }),
  generatedAt: tstz("generated_at").notNull(),
  /** Posé par la tâche `event.report-refresh` (J+8) ; null tant que le bilan est provisoire. */
  refreshedAt: tstz("refreshed_at"),
  data: jsonb("data").$type<EventReportData>().notNull(),
  ...timestamps,
});

/**
 * Note interne d'une structure sur une personne (participant ou prestataire) : privée, jamais exportée, jamais montrée
 * à la personne ni à une autre structure. Retirée (`deleted_at`) plutôt que supprimée ; effacée avec le compte de la
 * personne (anonymisation).
 */
export const structureNotes = pgTable(
  "structure_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    structureId: uuid("structure_id")
      .notNull()
      .references(() => structures.id, { onDelete: "cascade" }),
    subjectUserId: text("subject_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
    deletedAt: tstz("deleted_at"),
    ...timestamps,
  },
  (t) => [
    index("structure_notes_subject_idx").on(t.structureId, t.subjectUserId).where(sql`${t.deletedAt} is null`),
    index("structure_notes_structure_created_idx").on(t.structureId, t.createdAt),
    check("structure_notes_body_check", sql`char_length(${t.body}) between 1 and 500`),
  ],
);

/** Export des participants d'un événement : qui, quand, quoi (nombre de lignes), pourquoi. Insert seulement. */
export const participantExports = pgTable(
  "participant_exports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    structureId: uuid("structure_id")
      .notNull()
      .references(() => structures.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    reason: text("reason").notNull(),
    rowCount: integer("row_count").notNull(),
    ip: inet("ip"),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => [index("participant_exports_event_idx").on(t.eventId, t.createdAt)],
);

/**
 * Consultations des coordonnées d'un participant après J+7 : une ligne par fiche, par personne et par jour (heure de
 * Paris). La clé primaire rend l'écriture sans course ; la ligne du journal d'administration n'est écrite que si celle-ci
 * est nouvelle.
 */
export const participantContactViews = pgTable(
  "participant_contact_views",
  {
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    viewerId: text("viewer_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    day: date("day", { mode: "string" }).notNull(),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ name: "participant_contact_views_pkey", columns: [t.applicationId, t.viewerId, t.day] })],
);
