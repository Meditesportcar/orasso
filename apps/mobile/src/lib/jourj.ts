// Mode jour J participant (docs/02) : s'ouvre depuis Accès à partir de la veille (00 h, heure de l'événement),
// se ferme après le scan ou à J+1 (00 h du lendemain de la fin).
import { addDays, BUSINESS_TIMEZONE, fromWallTime, wallTime } from "@orasso/shared";

type Span = { startsAt: string | Date; endsAt: string | Date };

/** Début de la veille, à 00 h dans le fuseau de l'événement. */
export function jourJOpensAt(event: Span, timeZone = BUSINESS_TIMEZONE): Date {
  const day = addDays(wallTime(new Date(event.startsAt), timeZone), -1);
  return fromWallTime({ ...day, hour: 0, minute: 0 }, timeZone);
}

/** J+1 à 00 h : le mode se ferme et l'appli retire le QR de ce téléphone. */
export function jourJClosesAt(event: Span, timeZone = BUSINESS_TIMEZONE): Date {
  const day = addDays(wallTime(new Date(event.endsAt), timeZone), 1);
  return fromWallTime({ ...day, hour: 0, minute: 0 }, timeZone);
}

export type JourJState = "early" | "open" | "closed";

export function jourJState(event: Span, now: Date, checkedIn: boolean, timeZone = BUSINESS_TIMEZONE): JourJState {
  if (now < jourJOpensAt(event, timeZone)) return "early";
  if (checkedIn || now >= jourJClosesAt(event, timeZone)) return "closed";
  return "open";
}
