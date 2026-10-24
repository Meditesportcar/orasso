// Amitiés (lot 17, ARCHITECTURE-SUITE § 2.1) : suivi d'amis avec acceptation des deux côtés.
import { friendSources, friendshipStatuses } from "@orasso/shared";
import { sql } from "drizzle-orm";
import { check, index, pgEnum, pgTable, primaryKey, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { timestamps, tstz } from "./common";

export const friendshipStatusEnum = pgEnum("friendship_status", friendshipStatuses);
export const friendSourceEnum = pgEnum("friend_source", friendSources);

/**
 * Une seule ligne par paire de personnes, quel que soit le sens de la demande (index unique d'expression sur
 * `(least, greatest)`) : A→B puis B→A est refusé tant que la relation existe. Un refus garde la ligne 30 jours (S7).
 */
export const friendships = pgTable(
  "friendships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requesterId: text("requester_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    addresseeId: text("addressee_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: friendshipStatusEnum("status").notNull().default("pending"),
    message: text("message"),
    source: friendSourceEnum("source").notNull().default("profile"),
    respondedAt: tstz("responded_at"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("friendships_pair_key").on(
      sql`least(${t.requesterId}, ${t.addresseeId})`,
      sql`greatest(${t.requesterId}, ${t.addresseeId})`,
    ),
    index("friendships_addressee_status_idx").on(t.addresseeId, t.status),
    index("friendships_requester_status_idx").on(t.requesterId, t.status),
    check("friendships_not_self_check", sql`${t.requesterId} <> ${t.addresseeId}`),
    check("friendships_message_check", sql`${t.message} is null or char_length(${t.message}) <= 200`),
  ],
);

/**
 * Lot R4c (maquettes 10.2 et R4.6) : suivre une personne, sans acceptation (seulement un compte public). Suivre ne montre
 * rien de plus que le profil déjà visible ; les listes ne sont visibles que par soi. Compteurs lus par index (pas de cache).
 */
export const userFollows = pgTable(
  "user_follows",
  {
    followerId: text("follower_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    followedId: text("followed_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: "user_follows_pkey", columns: [t.followerId, t.followedId] }),
    index("user_follows_followed_idx").on(t.followedId, t.createdAt),
    check("user_follows_not_self_check", sql`${t.followerId} <> ${t.followedId}`),
  ],
);
