// Staff d'un événement (ARCHITECTURE.md § 1.6, § 2.7) : rôles ajustables par événement, présence, relances.
import { staffPresences } from "@orasso/shared";
import { boolean, index, pgEnum, pgTable, smallint, text, unique, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { timestamps, tstz } from "./common";
import { events } from "./events";

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
