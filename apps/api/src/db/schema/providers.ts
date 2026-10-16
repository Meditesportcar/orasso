// Prestataires : profil et photos (ARCHITECTURE-SUITE § 6.1, lot 21). Les colonnes `provider_profile_id` et
// `accredited_media` des candidatures sont dans `applications.ts` (table commune).
import { sql } from "drizzle-orm";
import { check, index, pgTable, smallint, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { timestamps, tstz } from "./common";
import { proProfiles } from "./pros";

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
    deletedAt: tstz("deleted_at"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("provider_profiles_user_key").on(t.userId).where(sql`${t.deletedAt} is null`),
    index("provider_profiles_pro_idx").on(t.proProfileId),
    check("provider_profiles_custom_type_check", sql`${t.customType} is null or char_length(${t.customType}) <= 40`),
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
