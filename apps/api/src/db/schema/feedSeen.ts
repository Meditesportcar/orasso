// Cartes vues du Fil (lot R8c1, migration 0080 `feed-seen`) : donnée de lecture **privée** de la personne. Une ligne = une
// carte du Fil (`genre:uuid`, jamais « Sponsorisé ») qu'elle a vue ; `interacted_at` dit qu'elle a ouvert ou partagé la
// carte (la flamme se lit dans `feed_post_reactions`). Une carte vue sans interaction n'est pas remontrée en haut du Fil.
// Jamais servie à un tiers, jamais comptée pour un auteur ; 30 jours (tâche `feed.seen-purge`), 5 000 lignes au plus par
// compte, effacée avec le compte.
import { index, pgTable, primaryKey, text } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { tstz } from "./common";

export const feedSeen = pgTable(
  "feed_seen",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    cardId: text("card_id").notNull(),
    /** Première fois vue (l'heure de l'appareil, ramenée entre maintenant − 24 h et maintenant). */
    seenAt: tstz("seen_at").notNull(),
    /** Première interaction (ouverture, partage), sinon nul. */
    interactedAt: tstz("interacted_at"),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.cardId], name: "feed_seen_pkey" }),
    index("feed_seen_user_seen_idx").on(t.userId, t.seenAt),
    // La purge quotidienne cherche par date seule.
    index("feed_seen_seen_idx").on(t.seenAt),
  ],
);
