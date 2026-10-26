// Fil d'un crew (lot R5c1, maquettes R5.7 et R5.10, décision D36) : publications (photos, texte, sondage), flamme,
// commentaires, sondages. Tout est réservé aux membres actifs du crew ; les photos (clés `private/crew-posts/…`) ne
// sortent jamais du crew et ne deviennent jamais des photos de véhicule.
import { crewPostKinds } from "@orasso/shared";
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { timestamps, tstz } from "./common";
import { crews } from "./crews";
import { events } from "./events";
import { vehicles } from "./vehicles";

export const crewPostKindEnum = pgEnum("crew_post_kind", crewPostKinds);

/**
 * Une publication. Suppression douce (`deleted_at`, `deleted_by` : l'auteur, le chef ou la modération) ; ses photos sont
 * effacées tout de suite (lignes et fichiers). Le véhicule est celui de l'auteur (vérifié par l'API).
 */
export const crewPosts = pgTable(
  "crew_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    crewId: uuid("crew_id")
      .notNull()
      .references(() => crews.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: crewPostKindEnum("kind").notNull(),
    text: text("text"),
    vehicleId: uuid("vehicle_id").references(() => vehicles.id, { onDelete: "set null" }),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
    deletedAt: tstz("deleted_at"),
    deletedBy: text("deleted_by").references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("crew_posts_feed_idx").on(t.crewId, t.createdAt.desc(), t.id.desc()).where(sql`${t.deletedAt} is null`),
    index("crew_posts_author_idx").on(t.authorId),
    check("crew_posts_text_check", sql`${t.text} is null or char_length(${t.text}) <= 500`),
  ],
);

/** Photos d'une publication : 1 à 6, dans l'ordre, au format d'origine (largeur et hauteur réelles). */
export const crewPostPhotos = pgTable(
  "crew_post_photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => crewPosts.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull().unique("crew_post_photos_storage_key_key"),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    position: smallint("position").notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("crew_post_photos_position_key").on(t.postId, t.position),
    check("crew_post_photos_position_check", sql`${t.position} between 0 and 5`),
  ],
);

/** La flamme : une par personne et par publication. */
export const crewPostReactions = pgTable(
  "crew_post_reactions",
  {
    postId: uuid("post_id")
      .notNull()
      .references(() => crewPosts.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.postId, t.userId], name: "crew_post_reactions_pkey" }),
    index("crew_post_reactions_user_idx").on(t.userId),
  ],
);

/** Commentaires (300 caractères), suppression douce par leur auteur, le chef ou la modération. */
export const crewPostComments = pgTable(
  "crew_post_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => crewPosts.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    deletedAt: tstz("deleted_at"),
    deletedBy: text("deleted_by").references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("crew_post_comments_post_idx").on(t.postId, t.createdAt, t.id),
    index("crew_post_comments_author_idx").on(t.authorId),
    check("crew_post_comments_text_check", sql`char_length(${t.text}) between 1 and 300`),
  ],
);

/** Sondage d'une publication `poll` : une question, une date de fin facultative, clos par l'auteur ou le chef. */
export const crewPolls = pgTable(
  "crew_polls",
  {
    postId: uuid("post_id")
      .primaryKey()
      .references(() => crewPosts.id, { onDelete: "cascade" }),
    question: text("question").notNull(),
    endsAt: tstz("ends_at"),
    closedAt: tstz("closed_at"),
    closedBy: text("closed_by").references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [check("crew_polls_question_check", sql`char_length(${t.question}) between 1 and 120`)],
);

/** Réponses d'un sondage : 2 à 6, dans l'ordre. */
export const crewPollOptions = pgTable(
  "crew_poll_options",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => crewPolls.postId, { onDelete: "cascade" }),
    label: text("label").notNull(),
    position: smallint("position").notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("crew_poll_options_position_key").on(t.postId, t.position),
    check("crew_poll_options_label_check", sql`char_length(${t.label}) between 1 and 60`),
    check("crew_poll_options_position_check", sql`${t.position} between 0 and 5`),
  ],
);

/** Une voix par personne et par sondage, modifiable tant qu'il est ouvert. Personne ne voit qui a voté quoi. */
export const crewPollVotes = pgTable(
  "crew_poll_votes",
  {
    postId: uuid("post_id")
      .notNull()
      .references(() => crewPolls.postId, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    optionId: uuid("option_id")
      .notNull()
      .references(() => crewPollOptions.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.postId, t.userId], name: "crew_poll_votes_pkey" }),
    index("crew_poll_votes_option_idx").on(t.optionId),
    index("crew_poll_votes_user_idx").on(t.userId),
  ],
);
