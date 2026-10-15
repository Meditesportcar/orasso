// Profils, centres d'intérêt, catégories, appareils (ARCHITECTURE.md § 1.1).
import {
  defaultNotificationPrefs,
  devicePlatforms,
  grades,
  type NotificationPrefs,
  platformRoles,
  profileVisibilities,
} from "@orasso/shared";
import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { bytea, timestamps, tstz } from "./common";

export const platformRoleEnum = pgEnum("platform_role", platformRoles);
export const profileVisibilityEnum = pgEnum("profile_visibility", profileVisibilities);
export const gradeEnum = pgEnum("grade", grades);
export const devicePlatformEnum = pgEnum("device_platform", devicePlatforms);

/** Tout ce qui est métier sur un compte (1 pour 1 avec `user`, table de Better Auth). */
export const profiles = pgTable(
  "profiles",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    pseudo: text("pseudo").notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    phone: text("phone"),
    avatarKey: text("avatar_key"),
    bio: text("bio"),
    visibility: profileVisibilityEnum("visibility").notNull().default("public"),
    departments: text("departments").array().notNull().default(sql`'{}'::text[]`),
    radiusKm: smallint("radius_km").notNull().default(50),
    platformRole: platformRoleEnum("platform_role").notNull().default("user"),
    newsletterOptIn: boolean("newsletter_opt_in").notNull().default(false),
    notificationPrefs: jsonb("notification_prefs")
      .$type<NotificationPrefs>()
      .notNull()
      .default(defaultNotificationPrefs),
    pointsSeason: integer("points_season").notNull().default(0),
    grade: gradeEnum("grade").notNull().default("rodage"),
    accountQrSecret: bytea("account_qr_secret").notNull(),
    inviteToken: text("invite_token").notNull(),
    invitedByUserId: text("invited_by_user_id").references(() => user.id, { onDelete: "set null" }),
    suspendedUntil: tstz("suspended_until"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("profiles_pseudo_lower_key").on(sql`lower(${t.pseudo})`),
    uniqueIndex("profiles_invite_token_key").on(t.inviteToken),
    index("profiles_departments_idx").using("gin", t.departments),
  ],
);

/** Une seule liste pour les catégories de véhicules, d'événements et les centres d'intérêt (choix C17). */
export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique("categories_slug_key"),
  label: text("label").notNull(),
  position: smallint("position").notNull().default(0),
  minVehicleAge: smallint("min_vehicle_age"),
  active: boolean("active").notNull().default(true),
  ...timestamps,
});

export const profileInterests = pgTable(
  "profile_interests",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ name: "profile_interests_pkey", columns: [t.userId, t.categoryId] })],
);

/** Un appareil = un jeton push et un identifiant de scanner. */
export const devices = pgTable(
  "devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    platform: devicePlatformEnum("platform").notNull(),
    expoPushToken: text("expo_push_token").unique("devices_expo_push_token_key"),
    name: text("name"),
    appVersion: text("app_version"),
    lastSeenAt: tstz("last_seen_at"),
    revokedAt: tstz("revoked_at"),
    ...timestamps,
  },
  (t) => [index("devices_user_id_idx").on(t.userId)],
);
