// Phase de la Lune (lot 49) : le tampon rare « nuit de pleine lune » du passeport. Calcul moyen (mois synodique depuis
// une nouvelle lune de référence) : erreur de quelques heures au plus, d'où la tolérance d'un jour autour de la pleine
// lune. Pur, sans dépendance.
import { DAY } from "./time";

/** Mois synodique moyen, en jours. */
export const SYNODIC_MONTH_DAYS = 29.530588853;
/** Nouvelle lune de référence : 6 janvier 2000, 18:14 UTC. */
const REFERENCE_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);
/** Une pleine lune « compte » un jour avant et un jour après l'instant exact. */
export const FULL_MOON_TOLERANCE_MS = DAY;

/** Phase entre 0 et 1 : 0 = nouvelle lune, 0,5 = pleine lune. */
export function moonPhase(date: Date): number {
  const days = (date.getTime() - REFERENCE_NEW_MOON) / DAY;
  const phase = (days / SYNODIC_MONTH_DAYS) % 1;
  return phase < 0 ? phase + 1 : phase;
}

/** Instant (moyen) de la pleine lune la plus proche de la date. */
export function nearestFullMoon(date: Date): Date {
  const offsetDays = (moonPhase(date) - 0.5) * SYNODIC_MONTH_DAYS;
  return new Date(date.getTime() - offsetDays * DAY);
}

/** Vrai à ± 1 jour d'une pleine lune. */
export function isFullMoon(date: Date): boolean {
  return Math.abs(date.getTime() - nearestFullMoon(date).getTime()) <= FULL_MOON_TOLERANCE_MS;
}
