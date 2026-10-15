import { BUSINESS_TIMEZONE } from "../enums";
import { addDays, calendarDaysBetween, fromWallTime, wallTime } from "./time";

/** Heures calmes : 22:00–08:00 heure de Paris (choix C15). */
export const QUIET_START_HOUR = 22;
export const QUIET_END_HOUR = 8;

export function isQuietHour(now: Date, timeZone = BUSINESS_TIMEZONE): boolean {
  const { hour } = wallTime(now, timeZone);
  return hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR;
}

/** Jour J : `now` est le même jour calendaire (Paris) que le début de l'événement. */
export function isEventDay(startsAt: Date, now: Date, timeZone = BUSINESS_TIMEZONE): boolean {
  return calendarDaysBetween(now, startsAt, timeZone) === 0;
}

/** Prochain 08:00 (Paris) à partir d'un instant situé dans les heures calmes. */
export function endOfQuietHours(now: Date, timeZone = BUSINESS_TIMEZONE): Date {
  const w = wallTime(now, timeZone);
  const day = w.hour >= QUIET_START_HOUR ? addDays(w, 1) : w;
  return fromWallTime({ ...day, hour: QUIET_END_HOUR, minute: 0 }, timeZone);
}

/**
 * Heure d'envoi d'une notification : tout de suite, sauf la nuit hors jour J (08:00 suivant).
 * Sans événement, la notification est soumise aux heures calmes.
 */
export function deliverAfter(now: Date, eventStartsAt?: Date | null, timeZone = BUSINESS_TIMEZONE): Date {
  if (!isQuietHour(now, timeZone)) return now;
  if (eventStartsAt && isEventDay(eventStartsAt, now, timeZone)) return now;
  return endOfQuietHours(now, timeZone);
}
