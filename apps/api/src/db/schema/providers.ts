// Prestataires : profil et photos (ARCHITECTURE-SUITE § 6.1, lot 21) ; missions (besoins de l'organisateur), vitrine et
// avis des organisateurs (lot 46, ARCHITECTURE-DA-V2 § 5.2). Les colonnes `provider_profile_id`, `accredited_media`,
// `need_id`, `spot_label` et `spot_note` des candidatures sont dans `applications.ts` (table commune).
import { type MenuItem, providerPowers } from "@orasso/shared";
import { sql } from "drizzle-orm";
import { boolean, check, index, jsonb, pgEnum, pgTable, smallint, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { applications } from "./applications";
import { user } from "./auth";
import { timestamps, tstz } from "./common";
import { events } from "./events";
import { proProfiles } from "./pros";
import { structures } from "./structures";

/** Électricité : besoin du prestataire (vitrine) ou fournie par l'organisateur (besoin d'un événement). */
export const providerPowerEnum = pgEnum("provider_power", providerPowers);

/**
 * Profil prestataire (un par compte). `type` = code de `vendorTypeCodes` (`stand` : stand d'un pro, lié par
 * `pro_profile_id`) ; `custom_type` = texte libre (≤ 40) quand le type est « autres ». Pas de SIRET ni de fiche pro
 * exigés : un amateur sans structure peut candidater.
 */
export const providerProfiles = pgTable(
  "provider_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    customType: text("custom_type"),
    name: text("name").notNull(),
    description: text("description"),
    phone: text("phone"),
    email: text("email"),
    website: text("website"),
    instagram: text("instagram"),
    portfolioUrl: text("portfolio_url"),
    /** Zone d'intervention. */
    departments: text("departments").array().notNull().default(sql`'{}'::text[]`),
    /** Stand d'un pro : la fiche pro dont le profil est tiré. */
    proProfileId: uuid("pro_profile_id").references(() => proProfiles.id, { onDelete: "set null" }),
    // Vitrine (lot 46, `s-vitrine`).
    /** Métiers cochés (codes de `vendorTypeCodes`) ; `type` reste le métier principal. */
    trades: text("trades").array().notNull().default(sql`'{}'::text[]`),
    tagline: text("tagline"),
    teamSize: smallint("team_size"),
    /** Menu analysé par `parseMenuLines` : `[{label ≤ 60, priceCents}]`, 40 lignes au plus. */
    menu: jsonb("menu").$type<MenuItem[]>().notNull().default(sql`'[]'::jsonb`),
    powerNeed: providerPowerEnum("power_need"),
    frontageM: smallint("frontage_m"),
    waterNeed: boolean("water_need"),
    /** Rayon d'intervention (km) autour du premier département de la zone. */
    radiusKm: smallint("radius_km").notNull().default(80),
    deletedAt: tstz("deleted_at"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("provider_profiles_user_key").on(t.userId).where(sql`${t.deletedAt} is null`),
    index("provider_profiles_pro_idx").on(t.proProfileId),
    check("provider_profiles_custom_type_check", sql`${t.customType} is null or char_length(${t.customType}) <= 40`),
    check("provider_profiles_tagline_check", sql`${t.tagline} is null or char_length(${t.tagline}) <= 80`),
    check("provider_profiles_team_size_check", sql`${t.teamSize} is null or ${t.teamSize} between 1 and 50`),
    check("provider_profiles_frontage_check", sql`${t.frontageM} is null or ${t.frontageM} between 1 and 30`),
    check("provider_profiles_radius_check", sql`${t.radiusKm} between 5 and 500`),
  ],
);

/** Photos de l'activité (0 à 8, comme `vehicle_photos`). */
export const providerPhotos = pgTable(
  "provider_photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => providerProfiles.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull(),
    position: smallint("position").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("provider_photos_provider_idx").on(t.providerId, t.position)],
);

/**
 * Besoins d'un événement (« missions », lot 46) : l'organisateur cherche `quantity` prestataires d'un métier, avec ce
 * qu'il fournit. Comblé = candidatures `accepted` rattachées (`applications.need_id`). Supprimer un besoin ne touche
 * pas les candidatures (`need_id` → null).
 */
export const eventNeeds = pgTable(
  "event_needs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    /** Code de `vendorTypeCodes`. */
    trade: text("trade").notNull(),
    quantity: smallint("quantity").notNull().default(1),
    power: providerPowerEnum("power").notNull().default("none"),
    water: boolean("water").notNull().default(false),
    frontageM: smallint("frontage_m"),
    /** Arrivée et installation des prestataires retenus pour ce besoin. */
    installAt: tstz("install_at"),
    notes: text("notes"),
    position: smallint("position").notNull().default(0),
    /** Correctif 53c : clé de création de l'assistant (une mission par clé et par événement), `null` sans clé. */
    clientKey: uuid("client_key"),
    ...timestamps,
  },
  (t) => [
    index("event_needs_event_idx").on(t.eventId, t.position),
    uniqueIndex("event_needs_client_key_unique").on(t.eventId, t.clientKey),
    index("event_needs_trade_idx").on(t.trade),
    check("event_needs_quantity_check", sql`${t.quantity} between 1 and 9`),
    check("event_needs_frontage_check", sql`${t.frontageM} is null or ${t.frontageM} between 1 and 30`),
    check("event_needs_notes_check", sql`${t.notes} is null or char_length(${t.notes}) <= 300`),
  ],
);

/**
 * Avis d'un organisateur sur un prestataire (lot 46, V10) : un par candidature retenue, 1 à 5, dans les 30 jours après
 * la fin de l'événement ; public sur la vitrine (moyenne, nombre, 3 derniers). `hidden_at` : retiré par la modération.
 * L'auteur dont le compte est supprimé reste (compte anonymisé) : l'avis est gardé, signé « Compte supprimé ».
 */
export const providerReviews = pgTable(
  "provider_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerProfileId: uuid("provider_profile_id")
      .notNull()
      .references(() => providerProfiles.id, { onDelete: "cascade" }),
    structureId: uuid("structure_id")
      .notNull()
      .references(() => structures.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
    rating: smallint("rating").notNull(),
    comment: text("comment"),
    hiddenAt: tstz("hidden_at"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("provider_reviews_application_key").on(t.applicationId),
    index("provider_reviews_provider_idx").on(t.providerProfileId, t.createdAt),
    check("provider_reviews_rating_check", sql`${t.rating} between 1 and 5`),
    check("provider_reviews_comment_check", sql`${t.comment} is null or char_length(${t.comment}) <= 300`),
  ],
);
