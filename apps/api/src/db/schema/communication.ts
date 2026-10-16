// Communication de l'organisateur (lot 20, ARCHITECTURE-SUITE § 5.1) : fil de l'événement, messages groupés et leurs
// destinataires, modèles de messages.
import {
  announcementAudiences,
  announcementKinds,
  groupMessageStatuses,
  messageSegments,
  templateKinds,
} from "@orasso/shared";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { timestamps, tstz } from "./common";
import { events } from "./events";
import { conversations, messages } from "./messaging";
import { structures } from "./structures";

export const announcementKindEnum = pgEnum("announcement_kind", announcementKinds);
export const announcementAudienceEnum = pgEnum("announcement_audience", announcementAudiences);
export const messageSegmentEnum = pgEnum("message_segment", messageSegments);
export const templateKindEnum = pgEnum("template_kind", templateKinds);
export const groupMessageStatusEnum = pgEnum("group_message_status", groupMessageStatuses);

/**
 * Fil de l'événement : annonces, consignes envoyées, changements de statut. Toujours au nom de la structure ;
 * `author_id` (organisation seulement) est retiré à la suppression du compte, le texte reste.
 */
export const eventAnnouncements = pgTable(
  "event_announcements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
    kind: announcementKindEnum("kind").notNull(),
    audience: announcementAudienceEnum("audience").notNull().default("public"),
    body: text("body").notNull(),
    /** Photo publique (copiée hors de `private/` à la publication). */
    imageKey: text("image_key"),
    imageWidth: smallint("image_width"),
    imageHeight: smallint("image_height"),
    pinned: boolean("pinned").notNull().default(false),
    /** « Prévenir les inscrits » demandé (les notifications sont écrites dans la même transaction). */
    notified: boolean("notified").notNull().default(false),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: tstz("deleted_at"),
    ...timestamps,
  },
  (t) => [
    index("event_announcements_event_published_idx").on(t.eventId, t.publishedAt.desc()),
    check("event_announcements_body_check", sql`char_length(${t.body}) between 1 and 2000`),
  ],
);

/**
 * Message groupé (S20) : une ligne par envoi, puis un message par destinataire dans sa conversation `organizer` avec la
 * structure. `client_id` unique par structure : le même envoi rejoué (double clic, réseau coupé) n'en crée qu'un.
 */
export const groupMessages = pgTable(
  "group_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    structureId: uuid("structure_id")
      .notNull()
      .references(() => structures.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
    authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
    segment: messageSegmentEnum("segment").notNull(),
    templateId: uuid("template_id").references(() => messageTemplates.id, { onDelete: "set null" }),
    subject: text("subject"),
    body: text("body").notNull(),
    clientId: uuid("client_id").notNull(),
    status: groupMessageStatusEnum("status").notNull().default("queued"),
    recipientsCount: integer("recipients_count").notNull().default(0),
    sentCount: integer("sent_count").notNull().default(0),
    sentAt: tstz("sent_at"),
    ...timestamps,
  },
  (t) => [
    unique("group_messages_structure_client_key").on(t.structureId, t.clientId),
    index("group_messages_structure_created_idx").on(t.structureId, t.createdAt),
    check("group_messages_body_check", sql`char_length(${t.body}) between 1 and 2000`),
    check("group_messages_subject_check", sql`${t.subject} is null or char_length(${t.subject}) <= 120`),
  ],
);

/**
 * Destinataires d'un message groupé, figés à l'envoi (jamais montrés à l'organisateur : il ne voit que des nombres).
 * La clé `(message groupé, personne)` dédoublonne ; `message_id` posé quand le message est écrit (reprise de la tâche
 * après une coupure sans doublon).
 */
export const groupMessageRecipients = pgTable(
  "group_message_recipients",
  {
    groupMessageId: uuid("group_message_id")
      .notNull()
      .references(() => groupMessages.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
    messageId: uuid("message_id").references(() => messages.id, { onDelete: "set null" }),
    sentAt: tstz("sent_at"),
    ...timestamps,
  },
  (t) => [
    primaryKey({ name: "group_message_recipients_pkey", columns: [t.groupMessageId, t.userId] }),
    index("group_message_recipients_pending_idx").on(t.groupMessageId).where(sql`${t.sentAt} is null`),
  ],
);

/** Modèles de messages : `structure_id` nul = modèle Orasso (lecture seule, proposé à toutes les structures). */
export const messageTemplates = pgTable(
  "message_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    structureId: uuid("structure_id").references(() => structures.id, { onDelete: "cascade" }),
    kind: templateKindEnum("kind").notNull(),
    name: text("name").notNull(),
    subject: text("subject"),
    body: text("body").notNull(),
    ...timestamps,
  },
  (t) => [
    index("message_templates_structure_idx").on(t.structureId),
    check("message_templates_name_check", sql`char_length(${t.name}) between 1 and 60`),
    check("message_templates_body_check", sql`char_length(${t.body}) between 1 and 2000`),
  ],
);
