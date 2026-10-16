// Météo (lot 28, ARCHITECTURE-SUITE § 12) : cache des prévisions en base. L'API n'appelle jamais un fournisseur pour
// répondre à un utilisateur ; la tâche `weather.refresh` remplit ces tables.
import type { StoredForecast, WeatherProviderName } from "@orasso/shared";
import { boolean, doublePrecision, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";

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
