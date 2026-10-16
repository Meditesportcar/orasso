// Événements récurrents et duplication (docs/01 « Organisateurs : créer un événement » : « duplication d'un événement
// passé en un clic ; événements récurrents (exemple : chaque premier dimanche du mois) créés une seule fois »).
// Fonctions pures : les heures sont calculées en heure murale de Paris, donc le changement d'heure ne décale pas
// l'horaire affiché (un rassemblement de 18 h reste à 18 h été comme hiver).
import { BUSINESS_TIMEZONE } from "../enums";
import { addDays, DAY, fromWallTime, wallTime } from "./time";

/** Nombre maximal d'occurrences créées d'un coup (au-delà, on recrée une série l'année suivante). */
export const RECURRENCE_MAX_COUNT = 12;

/**
 * Règle de récurrence, posée sur l'événement d'origine :
 * - `weekly` : toutes les `interval` semaines, même jour de la semaine et même heure ;
 * - `monthly_nth_weekday` : chaque mois, le `nth` jour `weekday` (`nth` 1 à 4, ou -1 pour le dernier ;
 *   `weekday` 0 = dimanche … 6 = samedi), même heure que l'origine.
 * `count` = nombre d'occurrences à créer **après** l'événement d'origine.
 */
export type RecurrenceRule =
  | { kind: "weekly"; interval: number; count: number }
  | { kind: "monthly_nth_weekday"; nth: number; weekday: number; count: number };

export type Occurrence = { startsAt: Date; endsAt: Date };

export const weekdayNames = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"] as const;
const nthNames: Record<number, string> = {
  1: "premier",
  2: "deuxième",
  3: "troisième",
  4: "quatrième",
  [-1]: "dernier",
};

/** Libellé lisible de la règle (« Chaque premier dimanche du mois, 5 fois »). */
export function describeRecurrence(rule: RecurrenceRule): string {
  const times = `${rule.count} fois après l'événement d'origine`;
  if (rule.kind === "weekly") {
    return `${rule.interval === 1 ? "Chaque semaine" : `Toutes les ${rule.interval} semaines`}, ${times}`;
  }
  return `Chaque ${nthNames[rule.nth] ?? rule.nth} ${weekdayNames[rule.weekday]} du mois, ${times}`;
}

/** Jour du mois (1 à 31) du `nth` `weekday` d'un mois ; `nth` = -1 pour le dernier. `null` s'il n'existe pas. */
export function nthWeekdayOfMonth(year: number, month: number, nth: number, weekday: number): number | null {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (nth === -1) {
    const lastWeekday = new Date(Date.UTC(year, month - 1, daysInMonth)).getUTCDay();
    return daysInMonth - ((lastWeekday - weekday + 7) % 7);
  }
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const day = 1 + ((weekday - firstWeekday + 7) % 7) + (nth - 1) * 7;
  return day <= daysInMonth ? day : null;
}

/** Décale un début / une fin (heure murale conservée) de `days` jours calendaires. */
function shifted(startsAt: Date, endsAt: Date, days: number): Occurrence {
  const start = addDays(wallTime(startsAt, BUSINESS_TIMEZONE), days);
  const end = addDays(wallTime(endsAt, BUSINESS_TIMEZONE), days);
  return { startsAt: fromWallTime(start, BUSINESS_TIMEZONE), endsAt: fromWallTime(end, BUSINESS_TIMEZONE) };
}

const dayNumber = (w: { year: number; month: number; day: number }) =>
  Math.round(Date.UTC(w.year, w.month - 1, w.day) / DAY);

/** Occurrences suivant l'événement d'origine (sans l'origine elle-même), dans l'ordre. */
export function recurrenceOccurrences(startsAt: Date, endsAt: Date, rule: RecurrenceRule): Occurrence[] {
  const count = Math.min(Math.max(0, Math.floor(rule.count)), RECURRENCE_MAX_COUNT);
  const origin = wallTime(startsAt, BUSINESS_TIMEZONE);
  const out: Occurrence[] = [];
  if (rule.kind === "weekly") {
    const step = Math.max(1, Math.floor(rule.interval)) * 7;
    for (let i = 1; i <= count; i++) out.push(shifted(startsAt, endsAt, step * i));
    return out;
  }
  let year = origin.year;
  let month = origin.month;
  // Au plus 36 mois de recherche : un `nth` absent de certains mois (le 5e vendredi) saute simplement ces mois.
  for (let guard = 0; guard < 36 && out.length < count; guard++) {
    const day = nthWeekdayOfMonth(year, month, rule.nth, rule.weekday);
    if (day !== null) {
      const delta = dayNumber({ year, month, day }) - dayNumber(origin);
      if (delta > 0) out.push(shifted(startsAt, endsAt, delta));
    }
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return out;
}

/**
 * Dates proposées à la duplication d'un événement : même jour de la semaine et même heure, 52 semaines plus tard
 * (autant de fois qu'il faut pour être dans le futur). Les dates se modifient ensuite dans l'assistant.
 */
export function duplicateDates(startsAt: Date, endsAt: Date, now: Date): Occurrence & { shiftDays: number } {
  let shiftDays = 364;
  let next = shifted(startsAt, endsAt, shiftDays);
  while (next.startsAt.getTime() <= now.getTime() + DAY) {
    shiftDays += 364;
    next = shifted(startsAt, endsAt, shiftDays);
  }
  return { ...next, shiftDays };
}
