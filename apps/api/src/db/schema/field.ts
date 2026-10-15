// Terrain du jour J : main courante et alertes du staff (ARCHITECTURE.md § 1.6, § 4.7).
import { doublePrecision, index, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { timestamps, tstz } from "./common";
import { events } from "./events";

/** Main courante : heure, lieu, description, photo (assurance, autorités). */
export const incidents = pgTable(
  "incidents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    reporterUserId: text("reporter_user_id").references(() => user.id, { onDelete: "set null" }),
    occurredAt: tstz("occurred_at").notNull(),
    location: text("location"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    description: text("description").notNull(),
    photoKey: text("photo_key"),
    /** Identifiant généré par l'appli : idempotence des envois hors ligne. */
    clientId: uuid("client_id").unique("incidents_client_id_key"),
    ...timestamps,
  },
  (t) => [index("incidents_event_idx").on(t.eventId, t.occurredAt)],
);

/** Alerte prioritaire, avec la position, à tout le staff présent et à l'organisateur. */
export const staffAlerts = pgTable(
  "staff_alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    message: text("message"),
    resolvedAt: tstz("resolved_at"),
    resolvedBy: text("resolved_by").references(() => user.id, { onDelete: "set null" }),
    clientId: uuid("client_id").unique("staff_alerts_client_id_key"),
    ...timestamps,
  },
  (t) => [index("staff_alerts_event_idx").on(t.eventId, t.createdAt)],
);
