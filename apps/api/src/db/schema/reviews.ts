// Avis après l'événement (docs/01 « Découvrir et participer », ARCHITECTURE.md § 1.10, lot 12).
import { sql } from "drizzle-orm";
import { check, index, pgTable, smallint, text, unique, uuid } from "drizzle-orm/pg-core";

import { applications } from "./applications";
import { user } from "./auth";
import { timestamps, tstz } from "./common";
import { events } from "./events";

/** Un avis par participant pointé et par événement ; on note l'événement, jamais des personnes. */
export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Candidature pointée qui ouvre le droit à l'avis. */
    applicationId: uuid("application_id").references(() => applications.id, { onDelete: "set null" }),
    rating: smallint("rating").notNull(),
    comment: text("comment").notNull(),
    /** Droit de réponse public de l'organisateur. */
    reply: text("reply"),
    repliedAt: tstz("replied_at"),
    repliedBy: text("replied_by").references(() => user.id, { onDelete: "set null" }),
    /**
     * Point d'accroche de la modération (signalement, chantier à venir) : un avis masqué n'est plus affiché ni compté.
     * Les signalements viseront `reviews.id` (`target_type = 'review'`).
     */
    hiddenAt: tstz("hidden_at"),
    ...timestamps,
  },
  (t) => [
    unique("reviews_event_user_key").on(t.eventId, t.userId),
    index("reviews_event_idx").on(t.eventId, t.createdAt),
    check("reviews_rating_check", sql`${t.rating} between 1 and 3`),
  ],
);
