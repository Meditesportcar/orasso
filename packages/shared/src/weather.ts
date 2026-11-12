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
  /**
   * Lot R8m : ressenti (°C), rafales (km/h) et direction du vent (degrés d'où il vient). Facultatifs : l'autre fournisseur
   * ne les donne pas, l'écran ne les montre alors pas.
   */
  feelsLike?: number;
  gustKmh?: number;
  windDirection?: number;
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

/** Délai d'attente maximal d'une requête au fournisseur météo (l'API s'y tient ; les clients attendent plus longtemps avant de relire). */
export const WEATHER_PROVIDER_TIMEOUT_MS = 8000;

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

/**
 * Lot R8e1 : la météo d'une sortie, une ligne de sa carte dans « Prochaine sortie » (`GET /me/home`, `outingsWeather`).
 * `day` : le jour de début, AAAA-MM-JJ à Paris ; `uncertain` : l'organisateur a passé l'événement en « Incertain ».
 */
export type OutingWeather = {
  day: string;
  summary: WeatherSummary;
  provider: WeatherProviderName;
  attribution: string;
  uncertain: boolean;
};

/**
 * Lot R8m : la météo d'un lieu de « Ma météo » (`GET /me/weather/places`, `POST /weather/at`) : la journée d'aujourd'hui
 * (Paris), l'heure en cours et les six suivantes.
 */
export type PlaceWeather = {
  today: DailyForecast;
  now: HourlyForecast;
  hours: HourlyForecast[];
  provider: WeatherProviderName;
  attribution: string;
  fetchedAt: string;
};

/** Un lieu de « Ma météo » : `saved` = une ville choisie (ligne `slot`), `default` = la préfecture du département (T10). */
export type MyWeatherPlace = {
  slot: number;
  label: string;
  /** Coordonnées de la ville (0,01°) : nécessaires pour réenregistrer l'autre lieu ; jamais la position d'une personne. */
  lat: number;
  lng: number;
  source: "saved" | "default";
  weather: PlaceWeather | null;
};

/** Réponse de `GET /me/weather/places` et champ `myWeather` de `GET /me/home`. */
export type MyWeatherPlaces = {
  places: MyWeatherPlace[];
  max: number;
  /** Lot R8r/R8m : un lieu sans météo en stock dont le rafraîchissement vient de partir (« Météo en cours de chargement », une relecture). */
  pending: boolean;
};

/** Réponse de `POST /weather/at` (« Utiliser ma position ») : jamais rattachée au compte. */
export type WeatherAt = { label: string; weather: PlaceWeather | null };

/** Une commune proposée par `GET /geo/cities`, par exemple « Argelès-sur-Mer (66) ». */
export type CitySuggestion = { label: string; lat: number; lng: number };
