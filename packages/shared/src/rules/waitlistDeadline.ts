import { BUSINESS_TIMEZONE } from "../enums";
import { type LockableEvent, lockAt } from "./lock";
import { endOfQuietHours, isEventDay, isQuietHour } from "./quietHours";
import { calendarDaysBetween, HOUR, MINUTE } from "./time";

/** Délais de réponse à une place libérée (docs/01 ; choix C2). */
export const OFFER_DELAY_DEFAULT = 24 * HOUR;
export const OFFER_DELAY_EVE = 3 * HOUR;
export const OFFER_DELAY_DAY = 2 * HOUR;
/** En dessous, plus personne ne peut répondre et venir : pas d'offre. */
export const OFFER_MIN_WINDOW = 30 * MINUTE;

/**
 * Échéance d'une offre de place faite à `now` (ARCHITECTURE.md § 2.2), ou `null` s'il est trop tard.
 * - la nuit (22:00–08:00) hors jour J, le délai part de 08:00 (la notification part à ce moment-là) ;
 * - 24 h si ce départ est avant la veille, 3 h la veille, 2 h le jour J ;
 * - jamais après le verrouillage ; `null` s'il reste moins de 30 min.
 */
export function computeOfferDeadline(event: LockableEvent & { timezone?: string }, now: Date): Date | null {
  const tz = event.timezone ?? BUSINESS_TIMEZONE;
  const start = isQuietHour(now, tz) && !isEventDay(event.startsAt, now, tz) ? endOfQuietHours(now, tz) : now;
  const daysBefore = calendarDaysBetween(start, event.startsAt, tz);
  const delay = daysBefore >= 2 ? OFFER_DELAY_DEFAULT : daysBefore === 1 ? OFFER_DELAY_EVE : OFFER_DELAY_DAY;
  const deadline = Math.min(start.getTime() + delay, lockAt(event).getTime());
  if (deadline - now.getTime() < OFFER_MIN_WINDOW) return null;
  return new Date(deadline);
}
