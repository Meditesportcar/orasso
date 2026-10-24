// Structures (organisateurs), membres, abonnés, bannis (ARCHITECTURE.md § 1.2).
import {
  type BadgeReminders,
  followSources,
  memberStatuses,
  type RegistryCheck,
  structureKinds,
  structureRoles,
  structureSuspensionReasons,
  structureVerifications,
  verificationDocumentKinds,
} from "@orasso/shared";
import { sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
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
export const structureSuspensionEnum = pgEnum("structure_suspension", structureSuspensionReasons);
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
    /** Résultat du dernier contrôle automatique SIRET / RNA (registre public, lot 13). */
    registryCheck: jsonb("registry_check").$type<RegistryCheck>(),
    verification: structureVerificationEnum("verification").notNull().default("unverified"),
    verifiedAt: tstz("verified_at"),
    badgeExpiresAt: tstz("badge_expires_at"),
    /** Lot 27 : pourquoi la structure est suspendue (badge échu, ou décision de l'équipe) et depuis quand. */
    suspendedReason: structureSuspensionEnum("suspended_reason"),
    suspendedAt: tstz("suspended_at"),
    /** Lot 27 : rappels d'échéance déjà envoyés (`{"30": "<ISO>", "7": …, "1": …}`), un par palier. */
    badgeRemindedAt: jsonb("badge_reminded_at").$type<BadgeReminders>().notNull().default({}),
    inviteToken: text("invite_token").notNull().unique("structures_invite_token_key"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    deletedAt: tstz("deleted_at"),
    /** [préparé] Stripe Connect (lot 14). */
    stripeAccountId: text("stripe_account_id"),
    /** [préparé] Limite d'envoi aux abonnés (lot 13). */
    followerMessageQuota: smallint("follower_message_quota"),
    ...timestamps,
  },
  (t) => [
    index("structures_department_idx").on(t.department),
    // Lot R1, tour 2 : l'Explorer cherche aussi par nom de l'organisateur, sans accents ni casse (migration 0056).
    index("structures_name_fold_trgm_idx").using("gin", sql`orasso_fold(${t.name}) gin_trgm_ops`),
  ],
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

export const verificationDocumentKindEnum = pgEnum("verification_document_kind", verificationDocumentKinds);

/**
 * Justificatifs de la vérification (statuts, récépissé, Kbis, pièce d'identité d'un responsable, lot 13). Fichiers
 * privés (jamais servis par `/api/files`), lus par l'équipe Orasso seulement. La pièce d'identité est supprimée dès
 * la validation (docs/01).
 */
export const structureVerificationDocuments = pgTable(
  "structure_verification_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    structureId: uuid("structure_id")
      .notNull()
      .references(() => structures.id, { onDelete: "cascade" }),
    kind: verificationDocumentKindEnum("kind").notNull(),
    storageKey: text("storage_key").notNull(),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    uploadedBy: text("uploaded_by").references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("structure_verification_documents_structure_idx").on(t.structureId)],
);
