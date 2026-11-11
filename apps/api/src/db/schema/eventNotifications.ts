// Préférence de notification par événement (vague R8, lot R8n1, ARCHITECTURE-R8 § 1.3). Pas de ligne = Nouveautés
// activées. L'Essentiel n'a pas de colonne : il ne se coupe pas tant que la personne a une place.
import { boolean, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { timestamps } from "./common";
import { events } from "./events";

export const eventNotificationPrefs = pgTable(
  "event_notification_prefs",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    /** « Nouveautés de l'événement » : les publications de l'événement entrent dans le résumé quotidien. */
    news: boolean("news").notNull().default(true),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.userId, t.eventId] })],
);
