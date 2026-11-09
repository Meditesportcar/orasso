// Les souvenirs (lot R7j, ARCHITECTURE-R7 § 2.9) : « il y a un an, tu étais à… ». Règle pure, testée : l'API la applique,
// l'appli et le site affichent le résultat sans le recalculer.
//
// Un souvenir = un tampon `participation` ou `visit` dont le **jour local** (Europe/Paris) tombe le même jour et le même
// mois qu'aujourd'hui, il y a 1, 2, 3… ans. Le jour est celui de la pose du tampon dans le fuseau de Paris : un tampon posé
// la veille à 23 h 50 compte pour son jour local. Un tampon du 29 février revient le 28 février des années non bissextiles.
import { BUSINESS_TIMEZONE } from "../enums";
import { fromWallTime, wallTime } from "./time";

/** Les tampons qui donnent un souvenir : être venu (exposant pointé ou visiteur au billet contrôlé). Pas le staff ni les rares. */
export const memoryStampKinds = ["participation", "visit"] as const;
export type MemoryStampKind = (typeof memoryStampKinds)[number];

/** Heure locale (Paris) à laquelle la notification d'un souvenir est livrée. */
export const MEMORY_NOTIFY_HOUR = 10;

const isLeap = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

/** Le jour et le mois où revient un tampon posé le `month`/`day` : le 29 février devient le 28 février hors année bissextile. */
function anniversary(month: number, day: number, year: number): { month: number; day: number } {
  return month === 2 && day === 29 && !isLeap(year) ? { month: 2, day: 28 } : { month, day };
}

/**
 * Nombre d'années pleines entre le jour local du tampon et le jour local de `now`, si `now` est son anniversaire ; `null`
 * sinon (pas le bon jour, ou moins d'un an : un tampon d'aujourd'hui n'est pas encore un souvenir).
 */
export function memoryYearsAgo(stampedAt: Date, now: Date, timeZone: string = BUSINESS_TIMEZONE): number | null {
  const s = wallTime(stampedAt, timeZone);
  const n = wallTime(now, timeZone);
  const years = n.year - s.year;
  if (years < 1) return null;
  const a = anniversary(s.month, s.day, n.year);
  return a.month === n.month && a.day === n.day ? years : null;
}

/**
 * Années pleines écoulées depuis le jour local du tampon (0 la première année), qu'on soit ou non à son anniversaire :
 * la page d'un souvenir ouverte le lendemain de la notification dit toujours « il y a un an ».
 */
export function memoryYearsSince(stampedAt: Date, now: Date, timeZone: string = BUSINESS_TIMEZONE): number {
  const s = wallTime(stampedAt, timeZone);
  const n = wallTime(now, timeZone);
  const a = anniversary(s.month, s.day, n.year);
  const reached = n.month > a.month || (n.month === a.month && n.day >= a.day);
  return Math.max(0, n.year - s.year - (reached ? 0 : 1));
}

/**
 * Les couples « mois-jour » (`MM-DD`) d'aujourd'hui à chercher dans la base : aujourd'hui, et le 29 février quand on est le
 * 28 février d'une année non bissextile. Sert de préfiltre SQL ; `memoryYearsAgo` tranche.
 */
export function memoryDayKeys(now: Date, timeZone: string = BUSINESS_TIMEZONE): string[] {
  const n = wallTime(now, timeZone);
  const key = (m: number, d: number) => `${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const keys = [key(n.month, n.day)];
  if (n.month === 2 && n.day === 28 && !isLeap(n.year)) keys.push(key(2, 29));
  return keys;
}

/** Le jour local de `now` (`AAAA-MM-JJ`) : la clé de dédoublonnage d'une notification de souvenir (une par événement et par jour). */
export function memoryDayStamp(now: Date, timeZone: string = BUSINESS_TIMEZONE): string {
  const n = wallTime(now, timeZone);
  return `${n.year}-${String(n.month).padStart(2, "0")}-${String(n.day).padStart(2, "0")}`;
}

/** L'instant (Paris, `MEMORY_NOTIFY_HOUR` h) où part la notification du jour de `now`. */
export function memoryDeliverAt(now: Date, timeZone: string = BUSINESS_TIMEZONE): Date {
  const n = wallTime(now, timeZone);
  return fromWallTime({ year: n.year, month: n.month, day: n.day, hour: MEMORY_NOTIFY_HOUR, minute: 0 }, timeZone);
}

/** Minuit local du jour de `now` : la date de la carte du Fil (elle vieillit depuis le début du jour). */
export function memoryDayStart(now: Date, timeZone: string = BUSINESS_TIMEZONE): Date {
  const n = wallTime(now, timeZone);
  return fromWallTime({ year: n.year, month: n.month, day: n.day, hour: 0, minute: 0 }, timeZone);
}

/** Heure locale à partir de laquelle on ne crée plus de souvenir : la livraison passerait au lendemain (heures calmes), qui n'est plus l'anniversaire. */
export const MEMORY_LAST_CREATE_HOUR = 22;

/** Peut-on créer la notification du souvenir de ce jour à cet instant ? Pas à 22 h locales ni après. */
export function memoryCanCreate(now: Date, timeZone: string = BUSINESS_TIMEZONE): boolean {
  return wallTime(now, timeZone).hour < MEMORY_LAST_CREATE_HOUR;
}
