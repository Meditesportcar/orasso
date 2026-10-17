// Accueil complet (lot 30, ARCHITECTURE-SUITE § 13.3) : cache des sources externes (lavage, carburant) et emplacements
// sponsorisés. L'API n'appelle jamais une source externe pour répondre à un utilisateur sans passer par ce cache.
import { placementStatuses } from "@orasso/shared";
import { sql } from "drizzle-orm";
import { boolean, date, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";

import { timestamps, tstz } from "./common";
import { proProfiles } from "./pros";

/** Cache d'une source externe : clé `wash:<département>` (7 jours) ou `fuel:<département>` (1 heure). */
export const externalCache = pgTable("external_cache", {
  key: text("key").primaryKey(),
  fetchedAt: tstz("fetched_at").notNull(),
  data: jsonb("data").$type<unknown>().notNull(),
});

export const placementStatusEnum = pgEnum("placement_status", placementStatuses);

/**
 * Emplacement sponsorisé de l'accueil, vendu à un pro de la plateforme et créé par l'administration. Ciblage simple :
 * départements et centres d'intérêt (vide = tous). `price_cents` est informatif (constante `SPONSORED_PRICE_CENTS`).
 */
export const sponsoredPlacements = pgTable(
  "sponsored_placements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    proProfileId: uuid("pro_profile_id")
      .notNull()
      .references(() => proProfiles.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    imageKey: text("image_key"),
    linkUrl: text("link_url").notNull(),
    departments: text("departments").array().notNull().default(sql`'{}'::text[]`),
    categoryIds: uuid("category_ids").array().notNull().default(sql`'{}'::uuid[]`),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    dailyCap: integer("daily_cap"),
    priceCents: integer("price_cents").notNull().default(0),
    status: placementStatusEnum("status").notNull().default("draft"),
    impressions: integer("impressions").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("sponsored_placements_status_idx").on(t.status, t.startsOn, t.endsOn)],
);

/** Affichages et clics par jour de Paris (plafond quotidien) : aucun lien avec une personne. */
export const sponsoredDailyStats = pgTable(
  "sponsored_daily_stats",
  {
    placementId: uuid("placement_id")
      .notNull()
      .references(() => sponsoredPlacements.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    impressions: integer("impressions").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
  },
  (t) => [primaryKey({ name: "sponsored_daily_stats_pkey", columns: [t.placementId, t.day] })],
);

/**
 * Un affichage et un clic au plus par (emplacement, personne, jour) : l'identifiant de la personne y est un HMAC non
 * réversible sans le secret du serveur, jamais l'identifiant du compte. Purgé à J+2 (tâche `home.purge`).
 */
export const sponsoredDailySeen = pgTable(
  "sponsored_daily_seen",
  {
    placementId: uuid("placement_id")
      .notNull()
      .references(() => sponsoredPlacements.id, { onDelete: "cascade" }),
    userHash: text("user_hash").notNull(),
    day: date("day").notNull(),
    clicked: boolean("clicked").notNull().default(false),
  },
  (t) => [
    primaryKey({ name: "sponsored_daily_seen_pkey", columns: [t.placementId, t.userHash, t.day] }),
    index("sponsored_daily_seen_day_idx").on(t.day),
  ],
);
