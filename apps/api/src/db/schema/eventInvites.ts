// Lot R6c (maquettes R6.4 et R6.6) : invitations entre passionnés à un événement, et invitations coupées.
// À ne pas confondre avec `event_invitations` (lot 25) : les invitations nominatives de l'organisateur à un événement
// « sur invitation », qui ouvrent l'accès. Celles-ci ne réservent rien : l'invité candidate comme tout le monde.
import { sql } from "drizzle-orm";
import { check, index, pgTable, primaryKey, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { tstz } from "./common";
import { events } from "./events";

/**
 * Une invitation d'un passionné (`inviter_id`) à un autre (`invitee_id`) pour un événement, avec un mot facultatif
 * (140 caractères). Une seule par auteur, par invité et par événement (un doublon est ignoré) ; plusieurs personnes
 * peuvent inviter la même : leurs invitations se regroupent dans une seule notification. 30 par auteur et par 24 h
 * (comptées sur `created_at`).
 */
export const eventPeerInvitations = pgTable(
  "event_peer_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    inviterId: text("inviter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    inviteeId: text("invitee_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    note: text("note"),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("event_peer_invitations_key").on(t.eventId, t.inviteeId, t.inviterId),
    index("event_peer_invitations_invitee_idx").on(t.inviteeId, t.eventId),
    index("event_peer_invitations_inviter_created_idx").on(t.inviterId, t.createdAt),
    check("event_peer_invitations_not_self_check", sql`${t.inviterId} <> ${t.inviteeId}`),
    check("event_peer_invitations_note_check", sql`${t.note} is null or char_length(${t.note}) <= 140`),
  ],
);

/**
 * « Ne plus recevoir d'invitations de Kenji_66 » : `user_id` a coupé les invitations de `muted_user_id` (à un événement,
 * et dans un crew par un membre). Celui qui est coupé n'en sait rien : ses invitations reçoivent la même réponse.
 */
export const invitationMutes = pgTable(
  "invitation_mutes",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    mutedUserId: text("muted_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: "invitation_mutes_pkey", columns: [t.userId, t.mutedUserId] }),
    index("invitation_mutes_muted_idx").on(t.mutedUserId),
    check("invitation_mutes_not_self_check", sql`${t.userId} <> ${t.mutedUserId}`),
  ],
);
