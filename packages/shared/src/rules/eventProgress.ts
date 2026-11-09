// Repère de temps d'un événement (lot R7-0, B3 de Damien : « J+1 » pour un événement en cours depuis la veille) : la
// règle commune à l'appli et au site. Avant le début « J-6 », « Demain », « Aujourd'hui » ; pendant l'événement
// « En cours · jour 2 sur 4 » (« En cours » pour un événement d'un seul jour) ; après la fin, « J+1 » compté depuis le
// jour de la fin. Dates calendaires dans le fuseau de l'événement (Europe/Paris par défaut).
import { BUSINESS_TIMEZONE } from "../enums";
import { addDays, calendarDaysBetween, fromWallTime, wallTime } from "./time";

/** Une fin avant 6 h du matin (minuit compris) clôt le jour précédent : une soirée qui finit à 2 h reste « un jour ». */
export const LATE_END_HOUR = 6;

type Span = { startsAt: string | Date; endsAt: string | Date };

/** Dernier jour calendaire de l'événement, sous forme d'instant (la fin, ou la veille à midi si elle tombe avant 6 h). */
export function eventLastDayInstant(startsAt: Date, endsAt: Date, timeZone = BUSINESS_TIMEZONE): Date {
  return lastDayInstant(startsAt, endsAt, timeZone);
}

function lastDayInstant(startsAt: Date, endsAt: Date, timeZone: string): Date {
  const w = wallTime(endsAt, timeZone);
  const startsEarlierDay = calendarDaysBetween(startsAt, endsAt, timeZone) > 0;
  if (!startsEarlierDay || w.hour >= LATE_END_HOUR) return endsAt;
  // Une fin entre 0 h et 6 h clôt la veille. Calcul calendaire (la veille à midi, heure murale du fuseau), jamais en
  // millisecondes : une nuit de 25 h (retour à l'heure d'hiver) ou de 23 h (heure d'été) donnerait le mauvais jour.
  return fromWallTime({ ...addDays(w, -1), hour: 12, minute: 0 }, timeZone);
}

/** Nombre de jours calendaires de l'événement (au moins 1) : de la date de début à celle de la fin. */
export function eventDayCount(span: Span, timeZone = BUSINESS_TIMEZONE): number {
  const start = new Date(span.startsAt);
  const last = lastDayInstant(start, new Date(span.endsAt), timeZone);
  return Math.max(1, calendarDaysBetween(start, last, timeZone) + 1);
}

export type EventPhase =
  | { phase: "before"; days: number }
  | { phase: "ongoing"; day: number; of: number }
  | { phase: "ended"; days: number };

/** Où en est l'événement : pas commencé (jours restants, 0 = aujourd'hui), en cours (jour N sur M), fini (jours écoulés depuis la fin). */
export function eventPhase(span: Span, now: Date, timeZone = BUSINESS_TIMEZONE): EventPhase {
  const start = new Date(span.startsAt);
  const end = new Date(span.endsAt);
  if (now < start) return { phase: "before", days: calendarDaysBetween(now, start, timeZone) };
  if (now < end) {
    const of = eventDayCount(span, timeZone);
    return { phase: "ongoing", day: Math.min(of, calendarDaysBetween(start, now, timeZone) + 1), of };
  }
  return { phase: "ended", days: calendarDaysBetween(end, now, timeZone) };
}

/** « En cours · jour 2 sur 4 », ou « En cours » pour un événement d'un seul jour. */
export const ongoingLabel = (day: number, of: number): string =>
  of > 1 ? `En cours · jour ${day} sur ${of}` : "En cours";

/**
 * « J-6 », « Demain », « Aujourd'hui », « En cours · jour 2 sur 4 », « J+1 » (jamais « J+1 » pour un événement en cours) ;
 * un événement de plusieurs jours fini aujourd'hui : « Terminé » (« Aujourd'hui » dirait qu'il a lieu).
 */
export function eventCountdown(span: Span, now: Date, timeZone = BUSINESS_TIMEZONE): string {
  const p = eventPhase(span, now, timeZone);
  if (p.phase === "ongoing") return ongoingLabel(p.day, p.of);
  if (p.days === 0) return p.phase === "ended" && eventDayCount(span, timeZone) > 1 ? "Terminé" : "Aujourd'hui";
  if (p.phase === "before") return p.days === 1 ? "Demain" : `J-${p.days}`;
  return `J+${p.days}`;
}

/**
 * Le même repère, découpé pour les pavés étroits : `lead` (grand : « J-6 », « En cours »), `detail` (petit : « Jour 2 sur 4 »,
 * `null` si rien à ajouter) et la version `tight` des pavés de quelques signes (« 2/4 » sur « jour », « Auj. » sur « en
 * cours »), dont `small` est `null` quand l'appelant garde son propre petit libellé (le jour de la semaine).
 */
export type EventCountdownParts = {
  label: string;
  lead: string;
  detail: string | null;
  tight: { big: string; small: string | null };
};

export function eventCountdownParts(span: Span, now: Date, timeZone = BUSINESS_TIMEZONE): EventCountdownParts {
  const label = eventCountdown(span, now, timeZone);
  const p = eventPhase(span, now, timeZone);
  if (p.phase === "ongoing") {
    return p.of > 1
      ? {
          label,
          lead: "En cours",
          detail: `Jour ${p.day} sur ${p.of}`,
          tight: { big: `${p.day}/${p.of}`, small: "jour" },
        }
      : { label, lead: "En cours", detail: null, tight: { big: "Auj.", small: "en cours" } };
  }
  return {
    label,
    lead: label,
    detail: null,
    tight: { big: label.replace("Aujourd'hui", "Auj.").replace("Terminé", "Fini"), small: null },
  };
}
