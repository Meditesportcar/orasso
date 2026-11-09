// Le Fil (lot R7e1, décision D38, ARCHITECTURE-R7 § 1.4) : publications des membres (photos en 4:5 par défaut, 1:1 et
// paysage acceptés), flamme. Une publication est visible de tout membre connecté (compte public) ou des abonnés acceptés
// (compte privé) ; jamais d'un crew. Les photos portent une décision de plaque vraie (floutée, ou « aucune plaque
// visible » confirmée) et sont stockées sous une clé privée `private/feed/<postId>/<hex>.webp` (servie par `GET /feed-posts/:id/photos/:nom`, jamais par `/api/files`).
import { feedAspects } from "@orasso/shared";
import { sql } from "drizzle-orm";
import {
  boolean,
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
import { events } from "./events";
import { proProfiles } from "./pros";
import { vehicles } from "./vehicles";

export const feedAspectEnum = pgEnum("feed_aspect", feedAspects);

/**
 * Une publication. Suppression douce (`deleted_at`, `deleted_by` : l'auteur ou la modération) ; ses photos sont effacées
 * tout de suite (lignes et fichiers). `department` : celui de l'auteur à la publication (« Autour de moi »).
 * `commercial_partner_id` : posé par R7m2 (« Collaboration commerciale »), jamais par l'auteur.
 */
export const feedPosts = pgTable(
  "feed_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authorId: text("author_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    caption: text("caption"),
    vehicleId: uuid("vehicle_id").references(() => vehicles.id, { onDelete: "set null" }),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
    commercialPartnerId: uuid("commercial_partner_id").references(() => proProfiles.id, { onDelete: "set null" }),
    aspect: feedAspectEnum("aspect").notNull().default("portrait_4_5"),
    /** Département de l'auteur à la publication ; chaîne vide si l'auteur n'en a pas choisi. */
    department: text("department").notNull().default(""),
    reactionsCount: integer("reactions_count").notNull().default(0),
    /** Identifiant tiré par l'appareil : un nouvel essai après une réponse perdue rend la même publication. */
    clientId: uuid("client_id"),
    deletedAt: tstz("deleted_at"),
    deletedBy: text("deleted_by").references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("feed_posts_created_idx").on(t.createdAt.desc()).where(sql`${t.deletedAt} is null`),
    index("feed_posts_author_idx").on(t.authorId, t.createdAt.desc()),
    index("feed_posts_department_idx").on(t.department, t.createdAt.desc()),
    // Tour 2 : clés étrangères lues à la suppression d'un véhicule, d'un événement ou d'un compte (set null).
    index("feed_posts_vehicle_idx").on(t.vehicleId),
    index("feed_posts_event_idx").on(t.eventId),
    index("feed_posts_deleted_by_idx").on(t.deletedBy),
    uniqueIndex("feed_posts_client_key").on(t.authorId, t.clientId).where(sql`${t.clientId} is not null`),
    check("feed_posts_caption_check", sql`${t.caption} is null or char_length(${t.caption}) <= 500`),
    check("feed_posts_reactions_check", sql`${t.reactionsCount} >= 0`),
  ],
);

/** Photos d'une publication : 1 à 6, dans l'ordre. Clé privée ; une décision de plaque vraie sur chacune. */
export const feedPostPhotos = pgTable(
  "feed_post_photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => feedPosts.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull().unique("feed_post_photos_storage_key_key"),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    position: smallint("position").notNull(),
    plateBlurred: boolean("plate_blurred").notNull().default(false),
    noPlateConfirmed: boolean("no_plate_confirmed").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("feed_post_photos_position_key").on(t.postId, t.position),
    check("feed_post_photos_position_check", sql`${t.position} between 0 and 5`),
    check("feed_post_photos_plate_check", sql`${t.plateBlurred} or ${t.noPlateConfirmed}`),
  ],
);

/** La flamme : une par personne et par publication. */
export const feedPostReactions = pgTable(
  "feed_post_reactions",
  {
    postId: uuid("post_id")
      .notNull()
      .references(() => feedPosts.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.postId, t.userId], name: "feed_post_reactions_pkey" }),
    index("feed_post_reactions_user_idx").on(t.userId),
  ],
);
