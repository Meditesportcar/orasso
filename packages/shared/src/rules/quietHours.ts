import { BUSINESS_TIMEZONE } from "../enums";
import type { QuietOverride } from "../notifications/r7";
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
 * Lot R7c1 : le sujet de la notification (un événement, un rendez-vous) commence dans `windowMs` ou a déjà commencé :
 * elle part malgré les heures calmes. L'appelant ne passe que des sujets pas encore terminés.
 */
export function urgentWithin(startsAt: Date | null | undefined, now: Date, windowMs: number): boolean {
  if (!startsAt) return false;
  return startsAt.getTime() - now.getTime() <= windowMs;
}

/** Lot R7c1 : le sujet commence aujourd'hui ou dans `days` jours calendaires (Paris) au plus, ou a déjà commencé. */
export function urgentWithinDays(
  startsAt: Date | null | undefined,
  now: Date,
  days: number,
  timeZone = BUSINESS_TIMEZONE,
) {
  if (!startsAt) return false;
  return calendarDaysBetween(now, startsAt, timeZone) <= days;
}

/** Une notification de ce type, pour ce sujet, passe-t-elle les heures calmes ? (voir `r7QuietOverride`). */
export function isUrgent(
  override: QuietOverride | undefined,
  startsAt: Date | null | undefined,
  now: Date,
  timeZone = BUSINESS_TIMEZONE,
): boolean {
  if (!override) return false;
  return "within" in override
    ? urgentWithin(startsAt, now, override.within)
    : urgentWithinDays(startsAt, now, override.days, timeZone);
}

/**
 * Heure d'envoi d'une notification : tout de suite, sauf la nuit hors jour J (08:00 suivant).
 * Sans événement, la notification est soumise aux heures calmes. Lot R7c1 : `urgent` lève les heures calmes pour les types
 * dont le sujet est proche (changement d'horaire aujourd'hui ou demain, rendez-vous dans les 2 heures).
 */
export function deliverAfter(
  now: Date,
  eventStartsAt?: Date | null,
  timeZone = BUSINESS_TIMEZONE,
  urgent?: QuietOverride,
): Date {
  if (!isQuietHour(now, timeZone)) return now;
  // Un type qui a sa propre exception (`urgent`) n'obéit qu'à elle : la règle « jour J » ne s'y ajoute pas.
  if (urgent) return isUrgent(urgent, eventStartsAt, now, timeZone) ? now : endOfQuietHours(now, timeZone);
  if (eventStartsAt && isEventDay(eventStartsAt, now, timeZone)) return now;
  return endOfQuietHours(now, timeZone);
}
