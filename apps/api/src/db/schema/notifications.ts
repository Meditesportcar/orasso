// Notifications (Journal de l'appli) et file des e-mails (ARCHITECTURE.md § 1.8).
import { notificationFamilies } from "@orasso/shared";
import { sql } from "drizzle-orm";
import { boolean, index, jsonb, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { timestamps, tstz } from "./common";
import { events } from "./events";

export const notificationFamilyEnum = pgEnum("notification_family", notificationFamilies);
export const emailStatusEnum = pgEnum("email_status", ["queued", "sent", "failed"]);
export const mailTransportEnum = pgEnum("mail_transport", ["journal", "brevo"]);

export type NotificationData = { eventId?: string; applicationId?: string; screen?: string; [k: string]: unknown };

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Valeurs : `notificationTypes` de @orasso/shared. */
    type: text("type").notNull(),
    family: notificationFamilyEnum("family").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    data: jsonb("data").$type<NotificationData>().notNull().default({}),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
    /** Heures calmes : envoi différé à 08:00 hors jour J. */
    deliverAfter: tstz("deliver_after").notNull(),
    deliveredAt: tstz("delivered_at"),
    pushSentAt: tstz("push_sent_at"),
    emailSentAt: tstz("email_sent_at"),
    readAt: tstz("read_at"),
    /** Lot 15 : faux pour un push qui n'encombre pas le Journal (ex. message reçu). */
    inJournal: boolean("in_journal").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    // Types « une fois par événement » (lot 15) : jamais deux fois la même notification pour un événement.
    uniqueIndex("notifications_once_per_event_key")
      .on(t.userId, t.type, t.eventId)
      .where(sql`${t.type} in ('event_nearby_interest')`),
    index("notifications_user_created_idx").on(t.userId, t.createdAt.desc()),
    index("notifications_undelivered_idx").on(t.deliverAfter).where(sql`${t.deliveredAt} is null`),
  ],
);

/** Toute sortie e-mail passe par là (rejouable, lisible en dev). */
export const emailOutbox = pgTable(
  "email_outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    to: text("to").notNull(),
    subject: text("subject").notNull(),
    template: text("template").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    status: emailStatusEnum("status").notNull().default("queued"),
    transport: mailTransportEnum("transport").notNull(),
    sentAt: tstz("sent_at"),
    error: text("error"),
    ...timestamps,
  },
  (t) => [index("email_outbox_status_idx").on(t.status)],
);
