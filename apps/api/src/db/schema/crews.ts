// Crews (lot 19, ARCHITECTURE-SUITE § 4.1) : groupes privés de passionnés, avec un chef (le créateur), des membres,
// des demandes et des invitations, et une discussion de groupe (conversation `crew`, `conversations.crew_id`).
import { crewMemberStatuses, crewOutingRsvps, crewRoles } from "@orasso/shared";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { timestamps, tstz } from "./common";

export const crewRoleEnum = pgEnum("crew_role", crewRoles);
export const crewMemberStatusEnum = pgEnum("crew_member_status", crewMemberStatuses);
export const crewOutingRsvpEnum = pgEnum("crew_outing_rsvp", crewOutingRsvps);

/**
 * Un crew. Jamais supprimé : `deleted_at` le dissout (chef qui le dissout, ou chef qui supprime son compte, S15) ; sa
 * discussion reste lisible par ses membres, plus personne ne le rejoint. Nom unique sans casse.
 */
export const crews = pgTable(
  "crews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique("crews_slug_key"),
    name: text("name").notNull(),
    logoKey: text("logo_key"),
    description: text("description"),
    /** Code du département (docs/01 : « une localisation par département »). */
    department: text("department").notNull(),
    /** Le chef (créateur). Pas de transfert en V1 (S15). */
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    /** Membres actifs, chef compris (recalculé en transaction à chaque arrivée et départ). */
    membersCount: integer("members_count").notNull().default(1),
    /**
     * Lot R5c2 : bannière posée par le chef. Elle se voit hors du crew (vitrine) seulement si sa plaque est passée par la
     * même chaîne que les photos de véhicule : masquée à l'envoi, ou « aucune plaque visible » confirmé
     * (`banner_plate_cleared`). Sinon seuls les membres la voient.
     */
    bannerKey: text("banner_key"),
    bannerPlateCleared: boolean("banner_plate_cleared").notNull().default(false),
    /** Lot R5c2 : pseudo Instagram du crew, sans « @ » (règle `crewInstagramHandle`). */
    instagram: text("instagram"),
    /** Lot R5c2 (Damien, 26/10) : « Les membres peuvent proposer une sortie » ; le chef peut toujours. */
    membersCanProposeOutings: boolean("members_can_propose_outings").notNull().default(true),
    deletedAt: tstz("deleted_at"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("crews_name_lower_key").on(sql`lower(${t.name})`),
    index("crews_department_idx").on(t.department).where(sql`${t.deletedAt} is null`),
    check("crews_name_check", sql`char_length(${t.name}) between 3 and 40`),
    check("crews_description_check", sql`${t.description} is null or char_length(${t.description}) <= 500`),
    check("crews_instagram_check", sql`${t.instagram} is null or ${t.instagram} ~ '^[A-Za-z0-9_.]{1,30}$'`),
  ],
);

/**
 * Lot R5c2 (maquette R5.9) : une sortie du crew, réservée à ses membres actifs. Ni candidature, ni QR, ni points, ni
 * tampon : chacun dit s'il vient. Jamais supprimée par son auteur : `cancelled_at` l'annule (ceux qui venaient sont
 * prévenus). Le compte de l'auteur supprimé : ses sorties disparaissent (anonymisation).
 */
export const crewOutings = pgTable(
  "crew_outings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    crewId: uuid("crew_id")
      .notNull()
      .references(() => crews.id, { onDelete: "cascade" }),
    authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    startsAt: tstz("starts_at").notNull(),
    /** Lieu du rendez-vous, tel que tapé (obligatoire) ; le point sur la carte est facultatif. */
    place: text("place").notNull(),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    program: text("program"),
    cancelledAt: tstz("cancelled_at"),
    ...timestamps,
  },
  (t) => [
    index("crew_outings_crew_starts_idx").on(t.crewId, t.startsAt).where(sql`${t.cancelledAt} is null`),
    index("crew_outings_author_idx").on(t.authorId),
    check("crew_outings_title_check", sql`char_length(${t.title}) between 3 and 40`),
    check("crew_outings_place_check", sql`char_length(${t.place}) between 3 and 120`),
    check("crew_outings_program_check", sql`${t.program} is null or char_length(${t.program}) <= 500`),
    check("crew_outings_point_check", sql`(${t.lat} is null) = (${t.lng} is null)`),
  ],
);

/** Lot R5c2 : la réponse d'un membre à une sortie du crew (une par personne, la dernière compte). */
export const crewOutingReplies = pgTable(
  "crew_outing_rsvps",
  {
    outingId: uuid("outing_id")
      .notNull()
      .references(() => crewOutings.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    answer: crewOutingRsvpEnum("answer").notNull(),
    answeredAt: tstz("answered_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.outingId, t.userId], name: "crew_outing_rsvps_pkey" }),
    index("crew_outing_rsvps_user_idx").on(t.userId),
  ],
);

/** Une ligne par paire crew-personne, pour toujours : son état suit demandes, invitations, arrivée et départ. */
export const crewMembers = pgTable(
  "crew_members",
  {
    crewId: uuid("crew_id")
      .notNull()
      .references(() => crews.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: crewRoleEnum("role").notNull().default("member"),
    status: crewMemberStatusEnum("status").notNull(),
    /** Mot de la demande pour rejoindre (≤ 300). */
    message: text("message"),
    invitedBy: text("invited_by").references(() => user.id, { onDelete: "set null" }),
    respondedAt: tstz("responded_at"),
    joinedAt: tstz("joined_at"),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.crewId, t.userId], name: "crew_members_pkey" }),
    // Un seul chef actif par crew.
    uniqueIndex("crew_members_one_leader_key").on(t.crewId).where(sql`${t.role} = 'leader' and ${t.status} = 'active'`),
    index("crew_members_user_status_idx").on(t.userId, t.status),
    index("crew_members_crew_status_idx").on(t.crewId, t.status),
    check("crew_members_message_check", sql`${t.message} is null or char_length(${t.message}) <= 300`),
  ],
);
