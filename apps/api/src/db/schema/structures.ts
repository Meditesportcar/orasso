// Structures (organisateurs), membres, abonnés, bannis (ARCHITECTURE.md § 1.2).
import { followSources, memberStatuses, structureKinds, structureRoles, structureVerifications } from "@orasso/shared";
import { sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { timestamps, tstz } from "./common";

export const structureKindEnum = pgEnum("structure_kind", structureKinds);
export const structureVerificationEnum = pgEnum("structure_verification", structureVerifications);
export const structureRoleEnum = pgEnum("structure_role", structureRoles);
export const memberStatusEnum = pgEnum("member_status", memberStatuses);
export const followSourceEnum = pgEnum("follow_source", followSources);

export type Socials = {
  instagram?: string | null;
  facebook?: string | null;
  tiktok?: string | null;
  youtube?: string | null;
};

export const structures = pgTable(
  "structures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique("structures_slug_key"),
    kind: structureKindEnum("kind").notNull(),
    name: text("name").notNull(),
    logoKey: text("logo_key"),
    description: text("description"),
    addressLine: text("address_line"),
    postalCode: text("postal_code"),
    city: text("city"),
    department: text("department"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    departments: text("departments").array().notNull().default(sql`'{}'::text[]`),
    website: text("website"),
    socials: jsonb("socials").$type<Socials>().notNull().default({}),
    siret: text("siret"),
    rna: text("rna"),
    verification: structureVerificationEnum("verification").notNull().default("unverified"),
    verifiedAt: tstz("verified_at"),
    badgeExpiresAt: tstz("badge_expires_at"),
    inviteToken: text("invite_token").notNull().unique("structures_invite_token_key"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    deletedAt: tstz("deleted_at"),
    /** [préparé] Stripe Connect (lot 14). */
    stripeAccountId: text("stripe_account_id"),
    /** [préparé] Limite d'envoi aux abonnés (lot 13). */
    followerMessageQuota: smallint("follower_message_quota"),
    ...timestamps,
  },
  (t) => [index("structures_department_idx").on(t.department)],
);

export const structureMembers = pgTable(
  "structure_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    structureId: uuid("structure_id")
      .notNull()
      .references(() => structures.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: structureRoleEnum("role").notNull(),
    staffRoles: text("staff_roles").array().notNull().default(sql`'{}'::text[]`),
    canDecide: boolean("can_decide").notNull().default(false),
    status: memberStatusEnum("status").notNull(),
    invitedBy: text("invited_by").references(() => user.id, { onDelete: "set null" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    unique("structure_members_structure_user_key").on(t.structureId, t.userId),
    index("structure_members_user_id_idx").on(t.userId),
    // Exactement un propriétaire actif par structure.
    uniqueIndex("structure_members_one_active_owner")
      .on(t.structureId)
      .where(sql`${t.role} = 'owner' and ${t.status} = 'active'`),
  ],
);

/** Un utilisateur qui ne suit pas une structure n'y est pas visible. */
export const structureFollows = pgTable(
  "structure_follows",
  {
    structureId: uuid("structure_id")
      .notNull()
      .references(() => structures.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    source: followSourceEnum("source").notNull(),
    ...timestamps,
  },
  (t) => [
    primaryKey({ name: "structure_follows_pkey", columns: [t.structureId, t.userId] }),
    index("structure_follows_user_id_idx").on(t.userId),
  ],
);

export const structureBans = pgTable(
  "structure_bans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    structureId: uuid("structure_id")
      .notNull()
      .references(() => structures.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    reason: text("reason"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [unique("structure_bans_structure_user_key").on(t.structureId, t.userId)],
);
