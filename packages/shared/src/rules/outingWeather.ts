// Lot R8e1 (maquette R8.8 « a-meteo ») : la météo d'une sortie est une ligne de sa carte dans « Prochaine sortie ». Les mots
// viennent de `labels/home.fr.ts` ; cette règle pure, commune à l'appli et au site, en fait les trois morceaux de la ligne.
import { outingWeatherLabels } from "../labels/home.fr";
import { weatherCodeLabels } from "../labels/weather.fr";
import type { OutingWeather } from "../weather";
import { wallTime } from "./time";

const DAY = 86_400_000;
const ymd = (d: { year: number; month: number; day: number }) =>
  `${String(d.year).padStart(4, "0")}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;

/** Jours calendaires (Europe/Paris) entre aujourd'hui et `day` (AAAA-MM-JJ) : 0 le jour même, négatif une fois passé. */
export function daysUntilDay(day: string, now: Date): number {
  const today = ymd(wallTime(now));
  return Math.round((Date.parse(`${day}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / DAY);
}

/** Le jour de la semaine de `day` (« Samedi » : majuscule), ou en minuscules pour une phrase. */
export function weekdayOfDay(day: string, capital = true): string {
  const w = new Intl.DateTimeFormat("fr-FR", { weekday: "long", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));
  return capital ? w.charAt(0).toUpperCase() + w.slice(1) : w;
}

export type OutingWeatherLine = {
  /** « Samedi : » */
  lead: string;
  /** « 17° » (chiffres étroits à l'écran) */
  temp: string;
  /** «, vent 25 km/h » */
  tail: string;
  /** « Ciel dégagé · Open-Meteo », ou « Prévision peu sûre à 4 jours » (événement « Incertain », avant le jour même). */
  sub: string;
  /** Libellé accessible de la ligne. */
  aria: string;
  /** Le bandeau sous la ligne : seulement pour un événement « Incertain ». */
  banner: string | null;
};

/** Les mots de la ligne météo d'une carte de sortie ; `now` est passé explicitement. */
export function outingWeatherLine(w: OutingWeather, now: Date): OutingWeatherLine {
  const temp = Math.round(w.summary.tempMax);
  const wind = Math.round(w.summary.windMaxKmh);
  const sky = weatherCodeLabels[w.summary.code];
  const days = daysUntilDay(w.day, now);
  const provider = w.attribution.replace(/^Météo : /, "");
  const head = outingWeatherLabels.headline(weekdayOfDay(w.day), temp, wind);
  return {
    ...head,
    sub: w.uncertain && days >= 1 ? outingWeatherLabels.uncertainIn(days) : `${sky} · ${provider}`,
    aria: outingWeatherLabels.aria(weekdayOfDay(w.day, false), sky.charAt(0).toLowerCase() + sky.slice(1), temp, wind),
    banner: w.uncertain ? outingWeatherLabels.uncertainBanner : null,
  };
}
