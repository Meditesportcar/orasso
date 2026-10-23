// Messagerie et Boîte (lot 18, ARCHITECTURE-SUITE § 3.1) et envois de fichiers génériques (§ 0.3).
import { contactStatuses, conversationKinds, messageKinds, participantRoles, uploadPurposes } from "@orasso/shared";
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
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { timestamps, tstz } from "./common";
import { crews } from "./crews";
import { events } from "./events";
import { structures } from "./structures";

export const conversationKindEnum = pgEnum("conversation_kind", conversationKinds);
export const participantRoleEnum = pgEnum("participant_role", participantRoles);
export const messageKindEnum = pgEnum("message_kind", messageKinds);
export const contactStatusEnum = pgEnum("contact_status", contactStatuses);
export const uploadPurposeEnum = pgEnum("upload_purpose", uploadPurposes);

/**
 * Une conversation. `direct_key` rend unique la conversation d'une paire (`<min>:<max>`), d'une personne avec une
 * structure (`structure:<sid>:<uid>`) et, aux lots 19 et 20, d'un crew ou d'une discussion de staff.
 */
export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: conversationKindEnum("kind").notNull(),
    directKey: text("direct_key").unique("conversations_direct_key_key"),
    structureId: uuid("structure_id").references(() => structures.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "cascade" }),
    /** Discussion d'un crew (lot 19) : une seule par crew (`direct_key = crew:<id>`). */
    crewId: uuid("crew_id").references(() => crews.id, { onDelete: "cascade" }),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    /** Plus d'écriture après cette date. */
    closedAt: tstz("closed_at"),
    /** Plus de lecture après cette date. */
    readableUntil: tstz("readable_until"),
    lastMessageAt: tstz("last_message_at"),
    lastMessagePreview: text("last_message_preview"),
    messagesCount: integer("messages_count").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index("conversations_structure_idx").on(t.structureId).where(sql`${t.structureId} is not null`),
    check("conversations_preview_check", sql`char_length(${t.lastMessagePreview}) <= 80`),
  ],
);

/**
 * Participants. Le marqueur de lecture (`last_read_message_id` + sa date `last_read_message_at`) donne « lu par » et
 * le non lu ; `last_push_at` porte le dédoublonnage des push (S12). Côté structure d'une conversation `organizer`, la
 * ligne d'un organisateur est créée à son premier accès (ou au premier message de la personne).
 */
export const conversationParticipants = pgTable(
  "conversation_participants",
  {
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: participantRoleEnum("role").notNull().default("member"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    leftAt: tstz("left_at"),
    lastReadMessageId: uuid("last_read_message_id"),
    lastReadMessageAt: tstz("last_read_message_at"),
    lastReadAt: tstz("last_read_at"),
    mutedUntil: tstz("muted_until"),
    lastPushAt: tstz("last_push_at"),
    ...timestamps,
  },
  (t) => [
    primaryKey({ name: "conversation_participants_pkey", columns: [t.conversationId, t.userId] }),
    index("conversation_participants_user_idx").on(t.userId).where(sql`${t.leftAt} is null`),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    senderId: text("sender_id").references(() => user.id, { onDelete: "set null" }),
    kind: messageKindEnum("kind").notNull().default("text"),
    body: text("body"),
    imageKey: text("image_key"),
    imageWidth: smallint("image_width"),
    imageHeight: smallint("image_height"),
    /** Idempotence de l'envoi (même `clientId` dans la même conversation = même message). */
    clientId: uuid("client_id"),
    /** Écrit au nom de la structure (conversation `organizer`, messages groupés du lot 20). */
    asStructure: boolean("as_structure").notNull().default(false),
    /** Message groupé d'origine (lot 20). */
    groupMessageId: uuid("group_message_id"),
    /** Lot M4 : écrit depuis la fiche de cet événement (« À propos de »), visible des deux côtés. */
    aboutEventId: uuid("about_event_id").references(() => events.id, { onDelete: "set null" }),
    deletedAt: tstz("deleted_at"),
    moderatedAt: tstz("moderated_at"),
    ...timestamps,
  },
  (t) => [
    unique("messages_conversation_client_key").on(t.conversationId, t.clientId),
    index("messages_conversation_created_idx").on(t.conversationId, t.createdAt.desc(), t.id.desc()),
    index("messages_sender_created_idx").on(t.senderId, t.createdAt),
    uniqueIndex("messages_image_key_key").on(t.imageKey).where(sql`${t.imageKey} is not null`),
    check("messages_body_check", sql`${t.body} is null or char_length(${t.body}) <= 2000`),
  ],
);

/** Demande de contact : une seule, pour toujours, d'une personne vers une autre (docs/01). */
export const contactRequests = pgTable(
  "contact_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fromUserId: text("from_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    toUserId: text("to_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    message: text("message").notNull(),
    status: contactStatusEnum("status").notNull().default("pending"),
    respondedAt: tstz("responded_at"),
    conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    unique("contact_requests_pair_key").on(t.fromUserId, t.toUserId),
    index("contact_requests_to_status_idx").on(t.toUserId, t.status),
    index("contact_requests_from_created_idx").on(t.fromUserId, t.createdAt),
    check("contact_requests_not_self_check", sql`${t.fromUserId} <> ${t.toUserId}`),
    check("contact_requests_message_check", sql`char_length(${t.message}) between 1 and 500`),
  ],
);

/**
 * Fichiers envoyés par `POST /me/uploads` (§ 0.3), en attente d'être rattachés (une image de message n'est utilisable
 * qu'une fois, par son auteur). Ceux jamais rattachés sont effacés après 24 h.
 */
export const uploads = pgTable(
  "uploads",
  {
    key: text("key").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    purpose: uploadPurposeEnum("purpose").notNull(),
    width: smallint("width").notNull(),
    height: smallint("height").notNull(),
    bytes: integer("bytes").notNull(),
    consumedAt: tstz("consumed_at"),
    ...timestamps,
  },
  (t) => [index("uploads_user_pending_idx").on(t.userId, t.createdAt).where(sql`${t.consumedAt} is null`)],
);
