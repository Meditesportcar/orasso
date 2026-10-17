// Invitations nominatives à un événement (ARCHITECTURE.md § 1.4, table préparée au lot 05 ; complétée au lot 25,
// ARCHITECTURE-SUITE § 9.1). Une invitation vise une personne (`user_id`), un véhicule (`vehicle_id` + son
// propriétaire dans `user_id`) ou une adresse e-mail sans compte (`email`, rattachée au compte par `claim`).
import { invitationStatuses } from "@orasso/shared";
import { sql } from "drizzle-orm";
import { index, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { applications } from "./applications";
import { user } from "./auth";
import { timestamps, tstz } from "./common";
import { events } from "./events";
import { vehicles } from "./vehicles";

export const invitationStatusEnum = pgEnum("invitation_status", invitationStatuses);

export const eventInvitations = pgTable(
  "event_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    vehicleId: uuid("vehicle_id").references(() => vehicles.id, { onDelete: "set null" }),
    email: text("email"),
    /** Jeton du lien `/invitation-evenement/:token` (24 octets aléatoires). */
    token: text("token").notNull().unique("event_invitations_token_key"),
    status: invitationStatusEnum("status").notNull().default("pending"),
    /** Trace : le verrouillage des inscriptions à la création (S24) ; la règle vit dans `isLocked(event)`. */
    expiresAt: tstz("expires_at"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    /** Message de l'organisateur (lot 25). */
    message: text("message"),
    /** « Inviter les retenus de l'édition … » : l'édition précédente d'où vient l'invitation. */
    sourceEventId: uuid("source_event_id").references(() => events.id, { onDelete: "set null" }),
    /** Candidature créée à l'acceptation (consommation unique). */
    acceptedApplicationId: uuid("accepted_application_id").references(() => applications.id, {
      onDelete: "set null",
    }),
    declinedAt: tstz("declined_at"),
    /** Notification ou e-mail envoyé. */
    sentAt: tstz("sent_at"),
    ...timestamps,
  },
  (t) => [
    index("event_invitations_event_idx").on(t.eventId),
    index("event_invitations_user_idx").on(t.userId),
    // Une invitation par personne et par événement : en attente, acceptée, ou refusée (un refus ne se relance pas).
    uniqueIndex("event_invitations_event_user_key")
      .on(t.eventId, t.userId)
      .where(sql`${t.userId} is not null and ${t.status} in ('pending', 'accepted', 'declined')`),
    // Une invitation en attente par adresse e-mail (sans compte) et par événement.
    uniqueIndex("event_invitations_event_email_key")
      .on(t.eventId, sql`lower(${t.email})`)
      .where(sql`${t.email} is not null and ${t.userId} is null and ${t.status} = 'pending'`),
    uniqueIndex("event_invitations_application_key").on(t.acceptedApplicationId),
  ],
);
