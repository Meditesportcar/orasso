// Amitiés (lot 17) puis abonnements (lot R4c, lot R6b : D37, « Suivre » comme sur Instagram).
import { followStatuses } from "@orasso/shared";
import { sql } from "drizzle-orm";
import { check, index, pgEnum, pgTable, primaryKey, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { timestamps, tstz } from "./common";

export const friendshipStatusEnum = pgEnum("friendship_status", ["pending", "accepted", "declined"]);
export const friendSourceEnum = pgEnum("friend_source", ["search", "qr", "invite_link", "profile", "event"]);
export const followStatusEnum = pgEnum("follow_status", followStatuses);

/**
 * ARCHIVE depuis le lot R6b (D37) : plus aucun code ne lit ni n'écrit cette table, sauf la suppression d'un compte
 * (`anonymize.ts`, données personnelles). Sa migration a recopié chaque amitié acceptée en deux abonnements acceptés et
 * chaque demande en attente en demande d'abonnement. Elle sera retirée dans un lot suivant, après la mise en ligne.
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
 * Lot R4c (maquettes 10.2 et R4.6), lot R6b (D37, maquettes R6.1 et R6.2) : suivre une personne. Compte public :
 * abonnement accepté tout de suite ; compte privé : demande (`pending`) que la personne accepte (`accepted`, date
 * d'acceptation) ou refuse (la ligne disparaît, sans prévenir). L'abonné accepté voit ce que voyait l'ami. Les listes ne
 * sont visibles que par soi. Compteurs lus par index (pas de cache).
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
    status: followStatusEnum("status").notNull().default("accepted"),
    createdAt: tstz("created_at").notNull().defaultNow(),
    /** Date d'acceptation (tout de suite pour un compte public), `null` tant que la demande attend. */
    acceptedAt: tstz("accepted_at"),
  },
  (t) => [
    primaryKey({ name: "user_follows_pkey", columns: [t.followerId, t.followedId] }),
    index("user_follows_followed_idx").on(t.followedId, t.createdAt),
    index("user_follows_followed_status_idx").on(t.followedId, t.status),
    index("user_follows_follower_status_idx").on(t.followerId, t.status),
    check("user_follows_not_self_check", sql`${t.followerId} <> ${t.followedId}`),
  ],
);
