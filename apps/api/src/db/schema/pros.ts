// Professionnels : fiche, photos, remises par grade, partenaires, publications, abonnés, statistiques
// (ARCHITECTURE.md § 1.10, lot 14).
import type { ProHours, RegistryCheck } from "@orasso/shared";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { timestamps, tstz } from "./common";
import { gradeEnum } from "./profiles";
import type { Socials } from "./structures";
import { structures } from "./structures";

/**
 * Fiche pro (une par compte). Publiée = visible dans l'annuaire. `verified_at` posé par le contrôle SIRET
 * automatique (badge « pro vérifié »), sans validation manuelle.
 */
export const proProfiles = pgTable(
  "pro_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique("pro_profiles_slug_key"),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    logoKey: text("logo_key"),
    description: text("description"),
    /** Valeurs de `proActivities`. */
    activities: text("activities").array().notNull().default(sql`'{}'::text[]`),
    addressLine: text("address_line"),
    postalCode: text("postal_code"),
    city: text("city"),
    department: text("department"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    /** Zone d'intervention (pros sans local ou à domicile). */
    interventionDepartments: text("intervention_departments").array().notNull().default(sql`'{}'::text[]`),
    phone: text("phone"),
    email: text("email"),
    website: text("website"),
    socials: jsonb("socials").$type<Socials>().notNull().default({}),
    hours: jsonb("hours").$type<ProHours>().notNull().default({}),
    siret: text("siret"),
    registryCheck: jsonb("registry_check").$type<RegistryCheck>(),
    verifiedAt: tstz("verified_at"),
    publishedAt: tstz("published_at"),
    deletedAt: tstz("deleted_at"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("pro_profiles_owner_key").on(t.ownerUserId).where(sql`${t.deletedAt} is null`),
    index("pro_profiles_department_idx").on(t.department),
    // Un établissement (SIRET) = une fiche non supprimée.
    uniqueIndex("pro_profiles_siret_key").on(t.siret).where(sql`${t.deletedAt} is null and ${t.siret} is not null`),
    index("pro_profiles_published_idx").on(t.publishedAt),
    // Lot 29 : rayon (rectangle englobant) et recherche par morceau de nom ou de ville.
    index("pro_profiles_lat_lng_idx").on(t.lat, t.lng),
    index("pro_profiles_name_trgm_idx").using("gin", t.name.op("gin_trgm_ops")),
    index("pro_profiles_city_trgm_idx").using("gin", t.city.op("gin_trgm_ops")),
  ],
);

export const proPhotos = pgTable(
  "pro_photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    proId: uuid("pro_id")
      .notNull()
      .references(() => proProfiles.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull(),
    position: smallint("position").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("pro_photos_pro_idx").on(t.proId, t.position)],
);

/** Remise du pro pour un grade, en pourcentage entier (financée par le pro). */
export const proDiscounts = pgTable(
  "pro_discounts",
  {
    proId: uuid("pro_id")
      .notNull()
      .references(() => proProfiles.id, { onDelete: "cascade" }),
    grade: gradeEnum("grade").notNull(),
    percent: smallint("percent").notNull(),
    ...timestamps,
  },
  (t) => [
    primaryKey({ name: "pro_discounts_pkey", columns: [t.proId, t.grade] }),
    check("pro_discounts_percent_check", sql`${t.percent} between 1 and 100`),
  ],
);

/** Organisateurs dont le pro est partenaire : le pro propose, l'organisateur accepte. */
export const proPartnerLinks = pgTable(
  "pro_partner_links",
  {
    proId: uuid("pro_id")
      .notNull()
      .references(() => proProfiles.id, { onDelete: "cascade" }),
    structureId: uuid("structure_id")
      .notNull()
      .references(() => structures.id, { onDelete: "cascade" }),
    acceptedAt: tstz("accepted_at"),
    ...timestamps,
  },
  (t) => [
    primaryKey({ name: "pro_partner_links_pkey", columns: [t.proId, t.structureId] }),
    index("pro_partner_links_structure_idx").on(t.structureId),
  ],
);

/** Publications (offres, actualités), visibles par les abonnés ; limite mensuelle dans `PRO_POSTS_PER_MONTH`. */
export const proPosts = pgTable(
  "pro_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    proId: uuid("pro_id")
      .notNull()
      .references(() => proProfiles.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    ...timestamps,
  },
  (t) => [index("pro_posts_pro_idx").on(t.proId, t.createdAt)],
);

export const proFollows = pgTable(
  "pro_follows",
  {
    proId: uuid("pro_id")
      .notNull()
      .references(() => proProfiles.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Garage favori de l'Accueil (lot 30) : au plus un par personne (index unique partiel). */
    favorite: boolean("favorite").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    primaryKey({ name: "pro_follows_pkey", columns: [t.proId, t.userId] }),
    index("pro_follows_user_idx").on(t.userId),
    uniqueIndex("pro_follows_favorite_key").on(t.userId).where(sql`${t.favorite}`),
  ],
);

/** Compteurs par jour (heure de Paris) : vues de la fiche, clics « appeler » et « itinéraire ». */
export const proDailyStats = pgTable(
  "pro_daily_stats",
  {
    proId: uuid("pro_id")
      .notNull()
      .references(() => proProfiles.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    views: integer("views").notNull().default(0),
    calls: integer("calls").notNull().default(0),
    routes: integer("routes").notNull().default(0),
  },
  (t) => [primaryKey({ name: "pro_daily_stats_pkey", columns: [t.proId, t.day] })],
);

/** Remises utilisées : un scan du QR de compte validé par ce pro (le client n'est pas gardé : statistiques seulement). */
export const proDiscountUses = pgTable(
  "pro_discount_uses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    proId: uuid("pro_id")
      .notNull()
      .references(() => proProfiles.id, { onDelete: "cascade" }),
    grade: gradeEnum("grade").notNull(),
    percent: smallint("percent").notNull(),
    usedAt: tstz("used_at").notNull(),
  },
  (t) => [index("pro_discount_uses_pro_idx").on(t.proId, t.usedAt)],
);
