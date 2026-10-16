// Lot 28 : prévisions factices pour la démonstration (aucun appel réseau) : « Nocturne de Canet » aura une mauvaise
// météo (la suggestion « passer en Incertain » apparaît au prochain passage de la tâche si l'événement est maintenu),
// « Expo Rivesaltes » et « Salon Argelès » (aujourd'hui) une bonne. Insérées en jsonb ; une vraie prévision (tâche `weather.refresh`) les remplace.
// Idempotent : une ligne déjà présente n'est pas touchée.
import {
  type DailyForecast,
  eventDates,
  forecastForEvent,
  type HourlyForecast,
  isBadWeather,
  type StoredForecast,
  type WeatherCode,
} from "@orasso/shared";
import { eq } from "drizzle-orm";
import { db } from "../../src/db/client";
import * as t from "../../src/db/schema";
import { HOUR, now } from "./helpers";

type Profile = {
  code: WeatherCode;
  tempMin: number;
  tempMax: number;
  probability: number;
  mm: number;
  wind: number;
};

function forecastFor(e: typeof t.events.$inferSelect, p: Profile): StoredForecast {
  const days: DailyForecast[] = eventDates(e).map((date) => ({
    date,
    tempMin: p.tempMin,
    tempMax: p.tempMax,
    precipitationProbability: p.probability,
    precipitationMm: p.mm,
    windMaxKmh: p.wind,
    code: p.code,
  }));
  const hours: HourlyForecast[] = [];
  const first = Math.floor(e.startsAt.getTime() / HOUR) * HOUR;
  const count = Math.ceil((e.endsAt.getTime() - first) / HOUR);
  for (let i = 0; i < count; i++) {
    hours.push({
      time: new Date(first + i * HOUR).toISOString(),
      temp: Math.round(p.tempMax - ((p.tempMax - p.tempMin) * i) / Math.max(1, count - 1)),
      precipitationProbability: p.probability,
      precipitationMm: Math.round((p.mm / Math.max(1, count)) * 10) / 10,
      windKmh: p.wind,
      code: p.code,
    });
  }
  return { days, hours };
}

const demo: Record<string, Profile> = {
  "nocturne-de-canet-2026": { code: "rain", tempMin: 14, tempMax: 18, probability: 75, mm: 6.5, wind: 38 },
  "expo-rivesaltes-2026": { code: "partly_cloudy", tempMin: 13, tempMax: 22, probability: 10, mm: 0, wind: 18 },
  // Jour J : le Salon Argelès a lieu aujourd'hui (affichage sur la carte d'accès et dans le mode jour J).
  "salon-argeles": { code: "partly_cloudy", tempMin: 16, tempMax: 24, probability: 5, mm: 0, wind: 14 },
};

export async function seedWeather() {
  let added = 0;
  for (const [slug, profile] of Object.entries(demo)) {
    const e = await db.query.events.findFirst({ where: eq(t.events.slug, slug) });
    if (!e || e.lat === null || e.lng === null) continue;
    const forecast = forecastFor(e, profile);
    const summary = forecastForEvent(forecast, e);
    const inserted = await db
      .insert(t.eventWeather)
      .values({
        eventId: e.id,
        provider: "open-meteo",
        lat: e.lat,
        lng: e.lng,
        fetchedAt: now,
        forecast,
        badWeather: summary ? isBadWeather(summary) : false,
      })
      .onConflictDoNothing()
      .returning({ eventId: t.eventWeather.eventId });
    added += inserted.length;
  }
  console.log(
    `Météo : prévisions factices ${added ? "ajoutées" : "déjà présentes"} (Nocturne de Canet mauvaise, Expo Rivesaltes et Salon Argelès bonnes).`,
  );
}
