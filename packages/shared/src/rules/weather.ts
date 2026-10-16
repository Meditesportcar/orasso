// Règles pures de la météo (lot 28, ARCHITECTURE-SUITE § 12 et S33).
import { BUSINESS_TIMEZONE } from "../enums";
import {
  type DailyForecast,
  type HourlyForecast,
  type StoredForecast,
  type WeatherCode,
  type WeatherSummary,
  weatherCodes,
} from "../weather";
import { wallTime } from "./time";

/** S33 : mauvaise météo = pluie ≥ 60 % ou ≥ 5 mm, ou vent ≥ 60 km/h. Constantes, pas de réglage. */
export const BAD_WEATHER = { precipitationProbability: 60, precipitationMm: 5, windKmh: 60 } as const;
/** La météo ne s'affiche et ne se récupère que dans les 7 jours avant l'événement. */
export const WEATHER_HORIZON_DAYS = 7;
/** Suggestion « passer en Incertain » : à 72 h du début au plus, au plus une fois par 24 h. */
export const WEATHER_SUGGEST_WITHIN_HOURS = 72;
export const WEATHER_SUGGEST_EVERY_HOURS = 24;

const HOUR = 3_600_000;

type Wet = Pick<DailyForecast, "precipitationProbability" | "precipitationMm" | "windMaxKmh">;

export function isBadWeather(day: Wet): boolean {
  return (
    (day.precipitationProbability ?? 0) >= BAD_WEATHER.precipitationProbability ||
    day.precipitationMm >= BAD_WEATHER.precipitationMm ||
    day.windMaxKmh >= BAD_WEATHER.windKmh
  );
}

/** Gravité croissante des conditions : sert à garder la pire d'une journée ou d'un événement. */
const severity: Record<WeatherCode, number> = {
  clear: 0,
  partly_cloudy: 1,
  cloudy: 2,
  fog: 3,
  drizzle: 4,
  wind: 5,
  rain: 6,
  snow: 7,
  heavy_rain: 8,
  thunderstorm: 9,
};

export function worstWeatherCode(codes: readonly WeatherCode[]): WeatherCode {
  let worst: WeatherCode = "clear";
  for (const c of codes) if (severity[c] > severity[worst]) worst = c;
  return worst;
}

export const isWeatherCode = (v: unknown): v is WeatherCode => (weatherCodes as readonly unknown[]).includes(v);

type EventWindow = { startsAt: Date; endsAt: Date; timezone?: string };

const ymd = (year: number, month: number, day: number) =>
  `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

/** Jours calendaires (AAAA-MM-JJ, dans le fuseau) de `startsAt` à `endsAt`. */
export function eventDates(event: EventWindow): string[] {
  const tz = event.timezone ?? BUSINESS_TIMEZONE;
  const a = wallTime(event.startsAt, tz);
  const b = wallTime(event.endsAt, tz);
  const last = Date.UTC(b.year, b.month - 1, b.day);
  const out: string[] = [];
  for (let t = Date.UTC(a.year, a.month - 1, a.day); t <= last && out.length < 31; t += 86_400_000) {
    const d = new Date(t);
    out.push(ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()));
  }
  return out;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function probabilityMax(values: (number | null)[]): number | null {
  const known = values.filter((p): p is number => p !== null);
  return known.length ? Math.max(...known) : null;
}

function fromHours(hours: HourlyForecast[], date: string): WeatherSummary {
  return {
    date,
    tempMin: Math.min(...hours.map((h) => h.temp)),
    tempMax: Math.max(...hours.map((h) => h.temp)),
    precipitationProbability: probabilityMax(hours.map((h) => h.precipitationProbability)),
    precipitationMm: round1(hours.reduce((s, h) => s + h.precipitationMm, 0)),
    windMaxKmh: Math.max(...hours.map((h) => h.windKmh)),
    code: worstWeatherCode(hours.map((h) => h.code)),
  };
}

function fromDays(days: DailyForecast[]): WeatherSummary {
  return {
    date: (days[0] as DailyForecast).date,
    tempMin: Math.min(...days.map((d) => d.tempMin)),
    tempMax: Math.max(...days.map((d) => d.tempMax)),
    precipitationProbability: probabilityMax(days.map((d) => d.precipitationProbability)),
    precipitationMm: round1(days.reduce((s, d) => s + d.precipitationMm, 0)),
    windMaxKmh: Math.max(...days.map((d) => d.windMaxKmh)),
    code: worstWeatherCode(days.map((d) => d.code)),
  };
}

/**
 * Météo de l'événement : les heures comprises entre son début et sa fin quand on les a, sinon les jours qu'il couvre
 * (la pire condition, le pire vent, la pluie cumulée). `null` si la prévision ne couvre pas l'événement.
 */
export function forecastForEvent(forecast: StoredForecast, event: EventWindow): WeatherSummary | null {
  const tz = event.timezone ?? BUSINESS_TIMEZONE;
  const from = event.startsAt.getTime();
  const to = event.endsAt.getTime();
  const hours = forecast.hours.filter((h) => {
    const t = Date.parse(h.time);
    return t + HOUR > from && t < to;
  });
  if (hours.length) {
    const w = wallTime(event.startsAt, tz);
    return fromHours(hours, ymd(w.year, w.month, w.day));
  }
  const dates = eventDates(event);
  const days = forecast.days.filter((d) => dates.includes(d.date));
  return days.length ? fromDays(days) : null;
}

const precipitationPhrases: Partial<Record<WeatherCode, string>> = {
  drizzle: "bruine",
  rain: "averses",
  heavy_rain: "fortes pluies",
  snow: "neige",
  thunderstorm: "orages",
};

const plainPhrases: Record<WeatherCode, string> = {
  clear: "ciel dégagé",
  partly_cloudy: "éclaircies",
  cloudy: "ciel couvert",
  fog: "brouillard",
  drizzle: "bruine",
  rain: "averses",
  heavy_rain: "fortes pluies",
  snow: "neige",
  thunderstorm: "orages",
  wind: "vent fort",
};

/** « 14–21 °C, averses probables (70 %) » : une phrase pour le rappel de la veille et les cartes. */
export function describeWeather(day: WeatherSummary): string {
  const lo = Math.round(day.tempMin);
  const hi = Math.round(day.tempMax);
  const temps = lo === hi ? `${hi} °C` : `${lo}–${hi} °C`;
  let sky: string = plainPhrases[day.code];
  const wet = precipitationPhrases[day.code];
  if (wet) {
    if (day.precipitationProbability !== null && day.precipitationProbability >= 30) {
      sky = `${wet} probables (${Math.round(day.precipitationProbability)} %)`;
    } else if (day.precipitationMm >= 0.5) {
      sky = `${wet} (${String(round1(day.precipitationMm)).replace(".", ",")} mm)`;
    }
  }
  const wind = day.windMaxKmh >= 40 && day.code !== "wind" ? `, vent jusqu'à ${Math.round(day.windMaxKmh)} km/h` : "";
  return `${temps}, ${sky}${wind}`;
}

/** La suggestion « passer en Incertain » est-elle due ? Pure : l'appelant fournit l'instant et l'état. */
export function shouldSuggestUncertain(input: {
  summary: WeatherSummary | null;
  outlook: "maintained" | "uncertain";
  startsAt: Date;
  lastSuggestedAt: Date | null;
  now: Date;
}): boolean {
  if (!input.summary || !isBadWeather(input.summary) || input.outlook !== "maintained") return false;
  const untilStart = input.startsAt.getTime() - input.now.getTime();
  if (untilStart <= 0 || untilStart > WEATHER_SUGGEST_WITHIN_HOURS * HOUR) return false;
  const last = input.lastSuggestedAt?.getTime();
  return last === undefined || input.now.getTime() - last >= WEATHER_SUGGEST_EVERY_HOURS * HOUR;
}

/** La météo n'est affichée que dans les 7 jours avant le début, et jusqu'à la fin de l'événement. */
export function weatherVisible(event: { startsAt: Date; endsAt: Date }, now: Date): boolean {
  return (
    event.endsAt.getTime() > now.getTime() &&
    event.startsAt.getTime() - now.getTime() <= WEATHER_HORIZON_DAYS * 24 * HOUR
  );
}
