// Météo (lot 28, ARCHITECTURE-SUITE § 12) : types partagés entre l'API, le site et l'appli, sans dépendance.

/** Liste courte des conditions, commune aux deux fournisseurs (les libellés sont dans `labels/weather.fr.ts`). */
export const weatherCodes = [
  "clear",
  "partly_cloudy",
  "cloudy",
  "fog",
  "drizzle",
  "rain",
  "heavy_rain",
  "snow",
  "thunderstorm",
  "wind",
] as const;
export type WeatherCode = (typeof weatherCodes)[number];

/** Fournisseurs de prévisions (variable `WEATHER_PROVIDER` de l'API). */
export const weatherProviders = ["open-meteo", "met-norway"] as const;
export type WeatherProviderName = (typeof weatherProviders)[number];

/** Attribution à afficher près de toute météo (licence CC BY 4.0 des deux fournisseurs). */
export const weatherAttributions: Record<WeatherProviderName, string> = {
  "open-meteo": "Météo : Open-Meteo",
  "met-norway": "Météo : MET Norway",
};

/** Prévision d'une heure (`time` : instant ISO UTC du début de l'heure). */
export type HourlyForecast = {
  time: string;
  temp: number;
  /** Probabilité de précipitations en %, `null` si le fournisseur ne la donne pas. */
  precipitationProbability: number | null;
  precipitationMm: number;
  windKmh: number;
  code: WeatherCode;
};

/** Prévision d'un jour calendaire du fuseau de l'événement (`date` : AAAA-MM-JJ). */
export type DailyForecast = {
  date: string;
  tempMin: number;
  tempMax: number;
  precipitationProbability: number | null;
  precipitationMm: number;
  windMaxKmh: number;
  code: WeatherCode;
};

/** Résumé de la météo d'un événement (ses heures, à défaut ses jours) : même forme qu'un jour. */
export type WeatherSummary = DailyForecast;

/** Ce que stocke `event_weather.forecast` : les jours couvrant l'événement et ses heures. */
export type StoredForecast = { days: DailyForecast[]; hours: HourlyForecast[] };

/** Réponse de `GET /events/by-slug/:slug/weather` (ou `null` : pas de météo à afficher). */
export type EventWeather = {
  provider: WeatherProviderName;
  attribution: string;
  fetchedAt: string;
  summary: WeatherSummary;
  days: DailyForecast[];
};

/** Valeur de `data.action` de la notification de suggestion : les clients proposent « Passer en Incertain ». */
export const SET_OUTLOOK_UNCERTAIN_ACTION = "set_outlook_uncertain";

/** Réponse de `GET /me/weather` : la météo du prochain événement (≤ 7 jours), sinon celle du département. */
export type MyWeather =
  | {
      kind: "event";
      event: { id: string; slug: string; title: string; startsAt: string };
      provider: WeatherProviderName;
      attribution: string;
      summary: WeatherSummary;
    }
  | {
      kind: "place";
      /** Département du profil (code), jamais une position plus précise. */
      department: string;
      provider: WeatherProviderName;
      attribution: string;
      summary: WeatherSummary;
    };
