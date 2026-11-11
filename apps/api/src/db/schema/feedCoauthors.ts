// Collaboration (vague R8, lot R8o, migration `feed-coauthors`, ARCHITECTURE-R8 § 1.6) : le co-auteur d'une publication.
// Une seule ligne par publication (`post_id` clé primaire : un seul co-auteur invité). Tant que `status` n'est pas
// `accepted`, rien ne montre le co-auteur (ni la publication, ni ses listes, ni son Fil). `coauthor_id` n'a pas de clé
// étrangère (il désigne un compte, une structure, une fiche pro, un prestataire ou un média selon `coauthor_kind`) : la
// lecture revérifie que la cible existe et est en règle ; un compte supprimé efface sa ligne (`anonymize.ts`).
import { authorKinds } from "@orasso/shared";
import { sql } from "drizzle-orm";
import { check, index, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { tstz } from "./common";
import { feedPosts } from "./feed";

export const coauthorKindEnum = pgEnum("coauthor_kind", authorKinds);
export const coauthorStatusEnum = pgEnum("coauthor_status", ["pending", "accepted", "declined", "withdrawn"]);

export const feedPostCoauthors = pgTable(
  "feed_post_coauthors",
  {
    postId: uuid("post_id")
      .primaryKey()
      .references(() => feedPosts.id, { onDelete: "cascade" }),
    coauthorKind: coauthorKindEnum("coauthor_kind").notNull(),
    coauthorId: text("coauthor_id").notNull(),
    status: coauthorStatusEnum("status").notNull().default("pending"),
    /** Le compte qui a invité (pour une page, la personne qui publie). */
    invitedBy: text("invited_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    invitedAt: tstz("invited_at").notNull().defaultNow(),
    /** Qui a répondu, au nom d'une casquette ou de soi ; vide si ce compte disparaît. */
    respondedBy: text("responded_by").references(() => user.id, { onDelete: "set null" }),
    respondedAt: tstz("responded_at"),
  },
  (t) => [
    index("feed_post_coauthors_target_idx").on(t.coauthorKind, t.coauthorId, t.status),
    index("feed_post_coauthors_invited_by_idx").on(t.invitedBy, t.invitedAt),
    index("feed_post_coauthors_responded_by_idx").on(t.respondedBy),
    check("feed_post_coauthors_id_check", sql`char_length(${t.coauthorId}) between 1 and 64`),
  ],
);
