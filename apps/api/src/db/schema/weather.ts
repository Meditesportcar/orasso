// Météo (lot 28, ARCHITECTURE-SUITE § 12) : cache des prévisions en base. L'API n'appelle jamais un fournisseur pour
// répondre à un utilisateur ; la tâche `weather.refresh` remplit ces tables.
import type { StoredForecast, WeatherProviderName } from "@orasso/shared";
import { sql } from "drizzle-orm";
import { boolean, check, doublePrecision, jsonb, pgTable, primaryKey, smallint, text, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { tstz } from "./common";
import { events } from "./events";

/** Prévision d'un événement : jours couvrant `starts_at`→`ends_at` et heures de l'événement. */
export const eventWeather = pgTable("event_weather", {
  eventId: uuid("event_id")
    .primaryKey()
    .references(() => events.id, { onDelete: "cascade" }),
  provider: text("provider").$type<WeatherProviderName>().notNull(),
  /** Position utilisée pour la prévision : si celle de l'événement change, la ligne n'est plus valable. */
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  fetchedAt: tstz("fetched_at").notNull(),
  forecast: jsonb("forecast").$type<StoredForecast>().notNull(),
  badWeather: boolean("bad_weather").notNull().default(false),
  /** Dernière suggestion « passer en Incertain » aux organisateurs (une par 24 h au plus). */
  suggestedUncertainAt: tstz("suggested_uncertain_at"),
});

/** Prévision du centre d'un département (widget de l'Accueil, `GET /me/weather`) : un cache partagé, 3 h. */
export const weatherDepartments = pgTable("weather_departments", {
  department: text("department").primaryKey(),
  provider: text("provider").$type<WeatherProviderName>().notNull(),
  fetchedAt: tstz("fetched_at").notNull(),
  forecast: jsonb("forecast").$type<StoredForecast>().notNull(),
});

/**
 * Lot R8m : les villes choisies pour « Ma météo » (deux au plus : `slot` 0 ou 1). Des villes, jamais la position d'une
 * personne : le libellé est celui de la commune choisie, les coordonnées sont arrondies à 0,01°.
 */
export const profileWeatherPlaces = pgTable(
  "profile_weather_places",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    slot: smallint("slot").notNull(),
    label: text("label").notNull(),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    updatedAt: tstz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: "profile_weather_places_pkey", columns: [t.userId, t.slot] }),
    check("profile_weather_places_slot_check", sql`${t.slot} in (0, 1)`),
    check("profile_weather_places_label_check", sql`char_length(${t.label}) between 1 and 80`),
  ],
);

/**
 * Lot R8m : prévision d'une case de 0,1° (environ 11 km), 3 h, partagée par tous les comptes. `cell` = la position arrondie
 * (« 42.7,2.9 ») : c'est tout ce qui part vers le fournisseur ; aucune colonne ne porte un compte ni une position plus fine.
 */
export const weatherPlacesCache = pgTable("weather_places_cache", {
  cell: text("cell").primaryKey(),
  provider: text("provider").$type<WeatherProviderName>().notNull(),
  fetchedAt: tstz("fetched_at").notNull(),
  forecast: jsonb("forecast").$type<StoredForecast>().notNull(),
});
