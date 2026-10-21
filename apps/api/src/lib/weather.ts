// Prévisions météo (lot 28, ARCHITECTURE-SUITE § 12). Un fournisseur derrière une interface, choisi par la variable
// `WEATHER_PROVIDER` (aucun changement de code pour basculer, AS1) :
//   - `open-meteo` (défaut) : sans clé, CC BY 4.0, gratuit pour l'usage NON COMMERCIAL seulement (à changer avant le
//     21/06/2027) ;
//   - `met-norway` (api.met.no) : sans clé, CC BY 4.0, usage commercial permis, `User-Agent` identifiant obligatoire,
//     `Expires` / `If-Modified-Since` respectés.
// Jamais bloquant : un fournisseur injoignable ou une réponse illisible renvoie `null`. Jamais d'appel par requête
// d'un utilisateur : les prévisions viennent de la tâche `weather.refresh` et du cache en base.
import {
  type DailyForecast,
  fromWallTime,
  type HourlyForecast,
  type WeatherCode,
  type WeatherProviderName,
  wallTime,
  worstWeatherCode,
} from "@orasso/shared";

import { env } from "../env";

type FetchLike = typeof fetch;
let fetchImpl: FetchLike | null = null;

/** Tests : remplace l'appel réseau (`null` pour revenir au vrai service). */
export function setWeatherFetch(f: FetchLike | null) {
  fetchImpl = f;
  metCache.clear();
}

export type ProviderForecast = { daily: DailyForecast[]; hourly: HourlyForecast[] };

export interface WeatherProvider {
  readonly name: WeatherProviderName;
  /** Prévisions des 8 jours à venir (aujourd'hui compris) ; lève une erreur si le service ne répond pas. */
  forecast(lat: number, lng: number): Promise<ProviderForecast>;
}

const TIMEOUT_MS = 8000;
const TZ = "Europe/Paris";
const KMH_PER_MS = 3.6;

/** Les tests n'appellent jamais le réseau : sans `setWeatherFetch`, la météo y est désactivée. */
export function weatherEnabled(): boolean {
  return env.WEATHER_PROVIDER !== "off" && (env.NODE_ENV !== "test" || fetchImpl !== null);
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const coord = (n: number) => n.toFixed(4);

/** Le vent fort prend le pas sur un ciel sans précipitation (les codes WMO n'en ont pas). */
function withWind(code: WeatherCode, windKmh: number): WeatherCode {
  return windKmh >= 60 && (code === "clear" || code === "partly_cloudy" || code === "cloudy") ? "wind" : code;
}

// --- Open-Meteo -----------------------------------------------------------------------------------------------

/** Codes WMO d'Open-Meteo vers la liste courte. */
export function wmoToCode(wmo: number | null | undefined): WeatherCode {
  if (wmo === null || wmo === undefined) return "cloudy";
  if (wmo <= 1) return "clear";
  if (wmo === 2) return "partly_cloudy";
  if (wmo === 3) return "cloudy";
  if (wmo === 45 || wmo === 48) return "fog";
  if (wmo >= 51 && wmo <= 57) return "drizzle";
  if (wmo === 65 || wmo === 67 || wmo === 82) return "heavy_rain";
  if ((wmo >= 61 && wmo <= 66) || wmo === 80 || wmo === 81) return "rain";
  if ((wmo >= 71 && wmo <= 77) || wmo === 85 || wmo === 86) return "snow";
  if (wmo >= 95) return "thunderstorm";
  return "cloudy";
}

type OpenMeteoResponse = {
  daily?: {
    time?: string[];
    weather_code?: (number | null)[];
    temperature_2m_max?: (number | null)[];
    temperature_2m_min?: (number | null)[];
    precipitation_probability_max?: (number | null)[];
    precipitation_sum?: (number | null)[];
    wind_speed_10m_max?: (number | null)[];
  };
  hourly?: {
    time?: string[];
    weather_code?: (number | null)[];
    temperature_2m?: (number | null)[];
    precipitation_probability?: (number | null)[];
    precipitation?: (number | null)[];
    wind_speed_10m?: (number | null)[];
  };
};

/** Lit une réponse `/v1/forecast` (exporté pour les tests). */
export function parseOpenMeteo(json: OpenMeteoResponse): ProviderForecast {
  const d = json.daily;
  const h = json.hourly;
  if (!d?.time || !h?.time) throw new Error("Réponse Open-Meteo illisible");
  const daily: DailyForecast[] = [];
  d.time.forEach((date, i) => {
    const tempMax = d.temperature_2m_max?.[i];
    const tempMin = d.temperature_2m_min?.[i];
    if (typeof tempMax !== "number" || typeof tempMin !== "number") return;
    const wind = d.wind_speed_10m_max?.[i] ?? 0;
    daily.push({
      date,
      tempMin: r1(tempMin),
      tempMax: r1(tempMax),
      precipitationProbability: d.precipitation_probability_max?.[i] ?? null,
      precipitationMm: r1(d.precipitation_sum?.[i] ?? 0),
      windMaxKmh: r1(wind),
      code: withWind(wmoToCode(d.weather_code?.[i]), wind),
    });
  });
  const hourly: HourlyForecast[] = [];
  h.time.forEach((local, i) => {
    const temp = h.temperature_2m?.[i];
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
    if (typeof temp !== "number" || !m) return;
    const wind = h.wind_speed_10m?.[i] ?? 0;
    hourly.push({
      time: fromWallTime(
        { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]), hour: Number(m[4]), minute: Number(m[5]) },
        TZ,
      ).toISOString(),
      temp: r1(temp),
      precipitationProbability: h.precipitation_probability?.[i] ?? null,
      precipitationMm: r1(h.precipitation?.[i] ?? 0),
      windKmh: r1(wind),
      code: withWind(wmoToCode(h.weather_code?.[i]), wind),
    });
  });
  if (!daily.length) throw new Error("Open-Meteo : aucune journée");
  return { daily, hourly };
}

function openMeteo(): WeatherProvider {
  return {
    name: "open-meteo",
    async forecast(lat, lng) {
      const params = new URLSearchParams({
        latitude: coord(lat),
        longitude: coord(lng),
        daily:
          "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max",
        hourly: "weather_code,temperature_2m,precipitation_probability,precipitation,wind_speed_10m",
        timezone: TZ,
        forecast_days: "8",
        wind_speed_unit: "kmh",
      });
      // Double garde : même si la configuration est modifiée après le démarrage, aucun stub en production.
      const endpoint =
        env.NODE_ENV !== "production" && env.METEO_URL ? env.METEO_URL : "https://api.open-meteo.com/v1/forecast";
      const url = new URL(endpoint);
      for (const [key, value] of params) url.searchParams.set(key, value);
      const res = await (fetchImpl ?? fetch)(url.toString(), {
        headers: { accept: "application/json", "user-agent": env.WEATHER_USER_AGENT },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`Open-Meteo : HTTP ${res.status}`);
      return parseOpenMeteo((await res.json()) as OpenMeteoResponse);
    },
  };
}

// --- MET Norway -----------------------------------------------------------------------------------------------

/** Symboles de MET Norway (« lightrainshowers_day »…) vers la liste courte. */
export function metSymbolToCode(symbol: string | null | undefined): WeatherCode {
  const s = (symbol ?? "").replace(/_(day|night|polartwilight)$/, "");
  if (s.includes("thunder")) return "thunderstorm";
  if (s.includes("snow") || s.includes("sleet")) return "snow";
  if (s.startsWith("heavyrain")) return "heavy_rain";
  if (s === "lightrain") return "drizzle";
  if (s.includes("rain")) return "rain";
  if (s === "fog") return "fog";
  if (s === "cloudy") return "cloudy";
  if (s === "partlycloudy") return "partly_cloudy";
  if (s === "clearsky" || s === "fair") return "clear";
  return "cloudy";
}

type MetEntry = {
  time: string;
  data: {
    instant?: { details?: { air_temperature?: number; wind_speed?: number } };
    next_1_hours?: { summary?: { symbol_code?: string }; details?: { precipitation_amount?: number } };
    next_6_hours?: { summary?: { symbol_code?: string }; details?: { precipitation_amount?: number } };
    next_12_hours?: { summary?: { symbol_code?: string } };
  };
};
type MetResponse = { properties?: { timeseries?: MetEntry[] } };

/**
 * Agrégation journalière du `compact` de MET Norway (exporté pour les tests) : températures et vent extrêmes de la
 * journée (heure de Paris), pluie cumulée (heures, puis tranches de 6 h au-delà de ~2,5 jours, sans double compte),
 * pire condition entre 7 h et 22 h. Le `compact` ne donne pas de probabilité de pluie : `null`.
 */
export function aggregateMetNorway(json: MetResponse): ProviderForecast {
  const series = json.properties?.timeseries;
  if (!series?.length) throw new Error("Réponse MET Norway illisible");
  type Acc = { temps: number[]; winds: number[]; mm: number; codes: WeatherCode[]; dayCodes: WeatherCode[] };
  const days = new Map<string, Acc>();
  const hourly: HourlyForecast[] = [];
  for (const e of series) {
    const at = new Date(e.time);
    const temp = e.data.instant?.details?.air_temperature;
    if (Number.isNaN(at.getTime()) || typeof temp !== "number") continue;
    const w = wallTime(at, TZ);
    const date = `${String(w.year).padStart(4, "0")}-${String(w.month).padStart(2, "0")}-${String(w.day).padStart(2, "0")}`;
    const wind = r1((e.data.instant?.details?.wind_speed ?? 0) * KMH_PER_MS);
    const step = e.data.next_1_hours ?? e.data.next_6_hours;
    const symbol = step?.summary?.symbol_code ?? e.data.next_12_hours?.summary?.symbol_code;
    const code = withWind(metSymbolToCode(symbol), wind);
    let acc = days.get(date);
    if (!acc) {
      acc = { temps: [], winds: [], mm: 0, codes: [], dayCodes: [] };
      days.set(date, acc);
    }
    acc.temps.push(temp);
    acc.winds.push(wind);
    acc.mm += step?.details?.precipitation_amount ?? 0;
    acc.codes.push(code);
    if (w.hour >= 7 && w.hour <= 22) acc.dayCodes.push(code);
    if (e.data.next_1_hours) {
      hourly.push({
        time: at.toISOString(),
        temp: r1(temp),
        precipitationProbability: null,
        precipitationMm: r1(e.data.next_1_hours.details?.precipitation_amount ?? 0),
        windKmh: wind,
        code,
      });
    }
  }
  const daily: DailyForecast[] = [...days.entries()].map(([date, a]) => ({
    date,
    tempMin: r1(Math.min(...a.temps)),
    tempMax: r1(Math.max(...a.temps)),
    precipitationProbability: null,
    precipitationMm: r1(a.mm),
    windMaxKmh: Math.max(...a.winds),
    code: worstWeatherCode(a.dayCodes.length ? a.dayCodes : a.codes),
  }));
  return { daily, hourly };
}

/** Cache mémoire de MET Norway : `Expires` respecté, `If-Modified-Since` renvoyé (conditions d'utilisation). */
const metCache = new Map<string, { expires: number; lastModified: string | null; forecast: ProviderForecast }>();

function metNorway(): WeatherProvider {
  return {
    name: "met-norway",
    async forecast(lat, lng) {
      const key = `${coord(lat)},${coord(lng)}`;
      const cached = metCache.get(key);
      if (cached && cached.expires > Date.now()) return cached.forecast;
      const headers: Record<string, string> = { accept: "application/json", "user-agent": env.WEATHER_USER_AGENT };
      if (cached?.lastModified) headers["if-modified-since"] = cached.lastModified;
      const res = await (fetchImpl ?? fetch)(
        `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${coord(lat)}&lon=${coord(lng)}`,
        { headers, signal: AbortSignal.timeout(TIMEOUT_MS) },
      );
      const expiresHeader = res.headers.get("expires");
      const expires = expiresHeader ? Date.parse(expiresHeader) : Number.NaN;
      const nextExpiry = Number.isNaN(expires) ? Date.now() + 10 * 60_000 : expires;
      if (res.status === 304 && cached) {
        cached.expires = nextExpiry;
        return cached.forecast;
      }
      if (!res.ok) throw new Error(`MET Norway : HTTP ${res.status}`);
      const forecast = aggregateMetNorway((await res.json()) as MetResponse);
      metCache.set(key, { expires: nextExpiry, lastModified: res.headers.get("last-modified"), forecast });
      return forecast;
    },
  };
}

/** Le fournisseur configuré (`WEATHER_PROVIDER`), ou `null` si la météo est désactivée. */
export function weatherProvider(): WeatherProvider | null {
  if (!weatherEnabled()) return null;
  if (env.WEATHER_PROVIDER === "met-norway") return metNorway();
  return openMeteo();
}

/** Prévisions d'un point, ou `null` (météo désactivée, service injoignable, réponse illisible) : jamais d'erreur. */
export async function fetchForecast(
  lat: number,
  lng: number,
): Promise<{ provider: WeatherProviderName; forecast: ProviderForecast } | null> {
  const provider = weatherProvider();
  if (!provider) return null;
  try {
    const forecast = await provider.forecast(lat, lng);
    return { provider: provider.name, forecast };
  } catch (error) {
    console.warn("Météo indisponible :", error instanceof Error ? error.message : error);
    return null;
  }
}
