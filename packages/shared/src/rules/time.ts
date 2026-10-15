import { BUSINESS_TIMEZONE } from "../enums";

/** Heure murale dans un fuseau (par défaut Europe/Paris). Mois de 1 à 12. */
export type WallTime = { year: number; month: number; day: number; hour: number; minute: number };

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

export function wallTime(date: Date, timeZone = BUSINESS_TIMEZONE): WallTime {
  const parts: Record<string, number> = {};
  for (const p of formatter(timeZone).formatToParts(date)) if (p.type !== "literal") parts[p.type] = Number(p.value);
  return {
    year: parts.year ?? 0,
    month: parts.month ?? 0,
    day: parts.day ?? 0,
    hour: parts.hour ?? 0,
    minute: parts.minute ?? 0,
  };
}

function offsetMs(date: Date, timeZone: string): number {
  const w = wallTime(date, timeZone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute);
  return asUtc - Math.floor(date.getTime() / MINUTE) * MINUTE;
}

/** Instant correspondant à une heure murale du fuseau (changements d'heure gérés). */
export function fromWallTime(w: WallTime, timeZone = BUSINESS_TIMEZONE): Date {
  const guess = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute);
  let result = guess - offsetMs(new Date(guess), timeZone);
  result = guess - offsetMs(new Date(result), timeZone);
  return new Date(result);
}

/** Jours calendaires (dans le fuseau) de `a` à `b` : 0 le même jour, 1 si `b` est le lendemain de `a`. */
export function calendarDaysBetween(a: Date, b: Date, timeZone = BUSINESS_TIMEZONE): number {
  const wa = wallTime(a, timeZone);
  const wb = wallTime(b, timeZone);
  return Math.round((Date.UTC(wb.year, wb.month - 1, wb.day) - Date.UTC(wa.year, wa.month - 1, wa.day)) / DAY);
}

/** Ajoute des jours calendaires à une heure murale (fins de mois et d'année comprises). */
export function addDays(w: WallTime, days: number): WallTime {
  const d = new Date(Date.UTC(w.year, w.month - 1, w.day + days));
  return { ...w, year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
