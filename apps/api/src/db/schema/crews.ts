// Crews (lot 19, ARCHITECTURE-SUITE § 4.1) : groupes privés de passionnés, avec un chef (le créateur), des membres,
// des demandes et des invitations, et une discussion de groupe (conversation `crew`, `conversations.crew_id`).
import { crewMemberStatuses, crewRoles } from "@orasso/shared";
import { sql } from "drizzle-orm";
import { check, index, integer, pgEnum, pgTable, primaryKey, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { timestamps, tstz } from "./common";

export const crewRoleEnum = pgEnum("crew_role", crewRoles);
export const crewMemberStatusEnum = pgEnum("crew_member_status", crewMemberStatuses);

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
    deletedAt: tstz("deleted_at"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("crews_name_lower_key").on(sql`lower(${t.name})`),
    index("crews_department_idx").on(t.department).where(sql`${t.deletedAt} is null`),
    check("crews_name_check", sql`char_length(${t.name}) between 3 and 40`),
    check("crews_description_check", sql`${t.description} is null or char_length(${t.description}) <= 500`),
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
