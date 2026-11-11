// Commentaires d'une publication du Fil (vague R8, lot R8k1, migration 0078, ARCHITECTURE-R8 § 1.2). Un commentaire tient à
// une ligne de `feed_posts` (jamais à une carte du Fil), sur un seul niveau de réponses. Suppression douce : les compteurs
// (`comments_count` de la publication, `replies_count` du commentaire, `reactions_count`) ne comptent que les commentaires
// non supprimés et sont tenus sous verrou de ligne. `persona` et ses colonnes de page existent dès la livraison 2 mais
// restent `fan` jusqu'à la livraison 3 (T7 : commenter en casquette).
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { timestamps, tstz } from "./common";
import { feedPosts } from "./feed";
import { mediaProfiles } from "./media";
import { proProfiles } from "./pros";
import { providerProfiles } from "./providers";
import { storyPersonaEnum } from "./stories";
import { structures } from "./structures";

export const feedPostComments = pgTable(
  "feed_post_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => feedPosts.id, { onDelete: "cascade" }),
    /** La personne qui a écrit (trace pour une casquette, jamais servie). */
    authorId: text("author_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    persona: storyPersonaEnum("persona").notNull().default("fan"),
    structureId: uuid("structure_id").references(() => structures.id, { onDelete: "cascade" }),
    proId: uuid("pro_id").references(() => proProfiles.id, { onDelete: "cascade" }),
    providerId: uuid("provider_id").references(() => providerProfiles.id, { onDelete: "cascade" }),
    mediaId: uuid("media_id").references(() => mediaProfiles.id, { onDelete: "cascade" }),
    /** Le commentaire de premier niveau dont c'est une réponse ; nul au premier niveau (un seul niveau, vérifié par le service). */
    parentId: uuid("parent_id").references((): AnyPgColumn => feedPostComments.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    reactionsCount: integer("reactions_count").notNull().default(0),
    repliesCount: integer("replies_count").notNull().default(0),
    /** Identifiant tiré par l'appareil : un nouvel essai après une réponse perdue rend le même commentaire. */
    clientId: uuid("client_id").notNull(),
    deletedAt: tstz("deleted_at"),
    deletedBy: text("deleted_by").references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("feed_post_comments_top_idx")
      .on(t.postId, t.createdAt, t.id)
      .where(sql`${t.parentId} is null and ${t.deletedAt} is null`),
    index("feed_post_comments_replies_idx").on(t.parentId, t.createdAt, t.id),
    uniqueIndex("feed_post_comments_client_key").on(t.authorId, t.clientId),
    index("feed_post_comments_deleted_by_idx").on(t.deletedBy),
    check("feed_post_comments_text_check", sql`char_length(${t.text}) between 1 and 300`),
    check("feed_post_comments_counts_check", sql`${t.reactionsCount} >= 0 and ${t.repliesCount} >= 0`),
    // Exactement la colonne de la casquette, aucune pour `fan` (comme les publications).
    check(
      "feed_post_comments_persona_check",
      sql`(${t.persona} = 'fan' and ${t.structureId} is null and ${t.proId} is null and ${t.providerId} is null and ${t.mediaId} is null)
        or (${t.persona} = 'organizer' and ${t.structureId} is not null and ${t.proId} is null and ${t.providerId} is null and ${t.mediaId} is null)
        or (${t.persona} = 'pro' and ${t.proId} is not null and ${t.structureId} is null and ${t.providerId} is null and ${t.mediaId} is null)
        or (${t.persona} = 'provider' and ${t.providerId} is not null and ${t.structureId} is null and ${t.proId} is null and ${t.mediaId} is null)
        or (${t.persona} = 'media' and ${t.mediaId} is not null and ${t.structureId} is null and ${t.proId} is null and ${t.providerId} is null)`,
    ),
  ],
);

/** La flamme d'un commentaire : une par personne. */
export const feedPostCommentReactions = pgTable(
  "feed_post_comment_reactions",
  {
    commentId: uuid("comment_id")
      .notNull()
      .references(() => feedPostComments.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.commentId, t.userId], name: "feed_post_comment_reactions_pkey" }),
    index("feed_post_comment_reactions_user_idx").on(t.userId),
  ],
);

/** Les personnes citées par `@pseudo` qui peuvent voir la publication (les autres n'ont pas de ligne). */
export const feedCommentMentions = pgTable(
  "feed_comment_mentions",
  {
    commentId: uuid("comment_id")
      .notNull()
      .references(() => feedPostComments.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.commentId, t.userId], name: "feed_comment_mentions_pkey" }),
    index("feed_comment_mentions_user_idx").on(t.userId),
  ],
);
