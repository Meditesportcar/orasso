// Jour J : lectures de QR, entrées, inscriptions express (ARCHITECTURE.md § 1.6, § 2.5, § 4).
import { checkinMethods, localScanDecisions, scanServerResults } from "@orasso/shared";
import { type AnyPgColumn, index, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { accessPasses } from "./access";
import { applications } from "./applications";
import { user } from "./auth";
import { timestamps, tstz } from "./common";
import { events, eventZones } from "./events";
import { devices } from "./profiles";

export const localScanDecisionEnum = pgEnum("local_scan_decision", localScanDecisions);
export const scanServerResultEnum = pgEnum("scan_server_result", scanServerResults);
export const checkinMethodEnum = pgEnum("checkin_method", checkinMethods);

/**
 * Chaque lecture, telle que l'appareil l'a décidée (jamais modifiée) ; seul le résultat serveur peut évoluer
 * quand un scan plus ancien arrive ensuite (il devient alors le premier, l'autre le doublon).
 */
export const scanEvents = pgTable(
  "scan_events",
  {
    /** Généré par l'appareil : clé d'idempotence des envois. */
    id: uuid("id").primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    deviceId: uuid("device_id").references(() => devices.id, { onDelete: "set null" }),
    staffUserId: text("staff_user_id").references(() => user.id, { onDelete: "set null" }),
    passId: uuid("pass_id").references(() => accessPasses.id, { onDelete: "set null" }),
    /** Candidature du pass (raccourci du rapport). */
    applicationId: uuid("application_id").references(() => applications.id, { onDelete: "set null" }),
    /** Texte lu quand le QR n'a pas été résolu par l'appareil. */
    rawPayload: text("raw_payload"),
    localDecision: localScanDecisionEnum("local_decision").notNull(),
    localReason: text("local_reason"),
    zoneCode: text("zone_code"),
    /** Horloge de l'appareil, ramenée à la réception si l'écart dépasse 24 h (choix C22). */
    scannedAt: tstz("scanned_at").notNull(),
    receivedAt: tstz("received_at").notNull(),
    serverResult: scanServerResultEnum("server_result").notNull(),
    duplicateOfScanId: uuid("duplicate_of_scan_id").references((): AnyPgColumn => scanEvents.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (t) => [
    index("scan_events_event_received_idx").on(t.eventId, t.receivedAt),
    index("scan_events_event_pass_idx").on(t.eventId, t.passId),
    index("scan_events_application_idx").on(t.applicationId),
  ],
);

/** L'entrée effective, une par candidature : donne « Sur place » et la participation à J+2. */
export const checkins = pgTable(
  "checkins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id")
      .notNull()
      .unique("checkins_application_key")
      .references(() => applications.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    method: checkinMethodEnum("method").notNull(),
    /** La plus ancienne heure d'entrée connue. */
    checkedInAt: tstz("checked_in_at").notNull(),
    deviceId: uuid("device_id").references(() => devices.id, { onDelete: "set null" }),
    staffUserId: text("staff_user_id").references(() => user.id, { onDelete: "set null" }),
    zoneId: uuid("zone_id").references(() => eventZones.id, { onDelete: "set null" }),
    sourceScanId: uuid("source_scan_id").references(() => scanEvents.id, { onDelete: "set null" }),
    /** Pointage manuel : « entré sans scan », raison libre. */
    note: text("note"),
    ...timestamps,
  },
  (t) => [index("checkins_event_idx").on(t.eventId, t.checkedInAt)],
);

/** Inscription express à l'entrée : lien par e-mail valable 24 h (formulaire au lot 13). */
export const expressInvites = pgTable(
  "express_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    token: text("token").notNull().unique("express_invites_token_key"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    expiresAt: tstz("expires_at").notNull(),
    usedAt: tstz("used_at"),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    applicationId: uuid("application_id").references(() => applications.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("express_invites_event_idx").on(t.eventId)],
);
