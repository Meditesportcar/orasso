// Staff d'un événement (ARCHITECTURE.md § 1.6, § 2.7) : rôles ajustables par événement, présence, relances.
import { staffPresences, ticketScanServerResults } from "@orasso/shared";
import { sql } from "drizzle-orm";
import { boolean, check, index, pgEnum, pgTable, smallint, text, unique, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { timestamps, tstz } from "./common";
import { events } from "./events";
import { devices } from "./profiles";
import { tickets } from "./ticketing";

export const staffPresenceEnum = pgEnum("staff_presence", staffPresences);

/**
 * Une ligne par membre du staff de la structure et par événement (choix C25), créée à la publication et pour tout
 * nouveau membre tant que l'événement n'est pas fini. `roles`/`canDecide` nuls = ceux de la structure.
 */
export const eventStaff = pgTable(
  "event_staff",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    roles: text("roles").array(),
    canDecide: boolean("can_decide"),
    presence: staffPresenceEnum("presence").notNull().default("unknown"),
    presenceUpdatedAt: tstz("presence_updated_at"),
    lastRemindedAt: tstz("last_reminded_at"),
    reminderCount: smallint("reminder_count").notNull().default(0),
    /** Dernière synchronisation réussie de la liste d'accès (informatif). */
    syncedAt: tstz("synced_at"),
    addedBy: text("added_by").references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [unique("event_staff_event_user_key").on(t.eventId, t.userId), index("event_staff_user_idx").on(t.userId)],
);

export const ticketScanResultEnum = pgEnum("ticket_scan_result", ticketScanServerResults);

/**
 * Contrôle d'un billet du public par le rôle « boutique » (lot 24), tel que l'appareil l'a décidé hors ligne ; le
 * résultat du serveur est l'arbitre (premier arrivé : `accepted`, les autres : `already`). `id` est généré par
 * l'appareil : un rejeu renvoie la même réponse sans rien écrire. Aucune coordonnée, aucun QR brut n'est gardé.
 */
export const ticketScans = pgTable(
  "ticket_scans",
  {
    id: uuid("id").primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    deviceId: uuid("device_id").references(() => devices.id, { onDelete: "set null" }),
    staffUserId: text("staff_user_id").references(() => user.id, { onDelete: "set null" }),
    ticketId: uuid("ticket_id").references(() => tickets.id, { onDelete: "set null" }),
    localDecision: text("local_decision").notNull(),
    reason: text("reason"),
    scannedAt: tstz("scanned_at").notNull(),
    receivedAt: tstz("received_at").notNull(),
    serverResult: ticketScanResultEnum("server_result").notNull(),
    ...timestamps,
  },
  (t) => [
    index("ticket_scans_event_idx").on(t.eventId, t.receivedAt),
    index("ticket_scans_ticket_idx").on(t.ticketId),
  ],
);

/**
 * Compteur d'entrées des visiteurs (lot 24) : un toucher du staff boutique = une ligne (±1, ±10), `id` généré par
 * l'appareil (idempotence). Le total de l'événement est la somme des lignes (jamais affichée en dessous de 0) ; aucune
 * identité de visiteur n'est enregistrée.
 */
export const visitorEntries = pgTable(
  "visitor_entries",
  {
    id: uuid("id").primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    deviceId: uuid("device_id").references(() => devices.id, { onDelete: "set null" }),
    staffUserId: text("staff_user_id").references(() => user.id, { onDelete: "set null" }),
    delta: smallint("delta").notNull(),
    at: tstz("at").notNull(),
    ...timestamps,
  },
  (t) => [
    index("visitor_entries_event_idx").on(t.eventId, t.at),
    check("visitor_entries_delta_check", sql`${t.delta} in (-10, -1, 1, 10)`),
  ],
);
