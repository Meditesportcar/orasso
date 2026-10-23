// Accès flottant (lot C5, artefact DA v2 `.near`) : la règle commune à l'appli et au site. Une carte pose l'accès le plus
// proche au-dessus de la barre d'onglets, de J-7 (dès 0 h, heure de Paris) au lendemain de la fin ; l'appli l'adoptera à
// la fusion (`features/sorties/model.ts` porte aujourd'hui sa propre copie).
import { BUSINESS_TIMEZONE } from "../enums";
import { calendarDaysBetween, wallTime } from "./time";

export const NEAR_BEFORE_DAYS = 7;
export const NEAR_AFTER_DAYS = 1;

export type NearKind = "application" | "accreditation" | "mission" | "ticket" | "staff";

/** Ordre à égalité de date : candidature, accréditation, mission, billet, staff. */
const ORDER: NearKind[] = ["application", "accreditation", "mission", "ticket", "staff"];

export type NearItem = { key: string; kind: NearKind; startsAt: string; endsAt: string };

/** Vrai de J-7 (dès 0 h) à J+1 après la fin ; un événement de plusieurs jours reste là tant qu'il dure. */
export function inNearWindow(startsAt: string | Date, endsAt: string | Date, now: Date, timeZone = BUSINESS_TIMEZONE) {
  return (
    calendarDaysBetween(now, new Date(startsAt), timeZone) <= NEAR_BEFORE_DAYS &&
    calendarDaysBetween(new Date(endsAt), now, timeZone) <= NEAR_AFTER_DAYS
  );
}

/** L'accès le plus proche dans la fenêtre (le plus tôt d'abord ; à égalité, selon `ORDER`), ou `null`. */
export function nearestAccess<T extends NearItem>(items: readonly T[], now: Date): T | null {
  const live = items
    .filter((i) => inNearWindow(i.startsAt, i.endsAt, now))
    .sort(
      (a, b) =>
        new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime() ||
        ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind),
    );
  return live[0] ?? null;
}

/** « J-6 », « Demain », « Aujourd'hui », « J+1 ». */
export function nearCountdown(startsAt: string | Date, now: Date, timeZone = BUSINESS_TIMEZONE): string {
  const days = calendarDaysBetween(now, new Date(startsAt), timeZone);
  if (days === 0) return "Aujourd'hui";
  if (days === 1) return "Demain";
  return days > 0 ? `J-${days}` : `J+${-days}`;
}

const WEEKDAYS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];

/** Jour de la semaine abrégé (« sam. »), dans le fuseau de l'événement. */
export function nearWeekday(startsAt: string | Date, timeZone = BUSINESS_TIMEZONE): string {
  const w = wallTime(new Date(startsAt), timeZone);
  return WEEKDAYS[new Date(Date.UTC(w.year, w.month - 1, w.day)).getUTCDay()] ?? "";
}

/** Lot M4 : Maps et Waze n'apparaissent qu'à l'approche, à partir de la veille (J-1, dès 0 h, heure de Paris). */
export const DIRECTIONS_BEFORE_DAYS = 1;

/**
 * Lot M4 (correction de Damien, 23/10) : à J-6, ni Waze ni Maps ; on les propose de la veille jusqu'à la fin de
 * l'événement (« Sur la carte » reste toujours là).
 */
export function directionsOpen(
  startsAt: string | Date,
  endsAt: string | Date,
  now: Date,
  timeZone = BUSINESS_TIMEZONE,
) {
  return calendarDaysBetween(now, new Date(startsAt), timeZone) <= DIRECTIONS_BEFORE_DAYS && now < new Date(endsAt);
}
