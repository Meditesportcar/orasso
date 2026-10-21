// QR d'accès du participant (D34, 21/10/2026) : consultable dès la validation de la candidature (Retenue), plus à partir
// de la veille ; il se ferme après le scan ou à J+1 (00 h du lendemain de la fin). Le QR tournant OR2 (code de 20 s) et
// le blocage des captures rendent sûre cette consultation anticipée. Le jour J, c'est l'écran qui s'affiche d'office.
import { addDays, BUSINESS_TIMEZONE, fromWallTime, wallTime } from "@orasso/shared";

type Span = { startsAt: string | Date; endsAt: string | Date };

/** J+1 à 00 h : le mode se ferme et l'appli retire le QR de ce téléphone. */
export function jourJClosesAt(event: Span, timeZone = BUSINESS_TIMEZONE): Date {
  const day = addDays(wallTime(new Date(event.endsAt), timeZone), 1);
  return fromWallTime({ ...day, hour: 0, minute: 0 }, timeZone);
}

export type JourJState = "open" | "closed";

/** Ouvert dès que la place est retenue ; fermé après l'entrée enregistrée ou à J+1 00 h. */
export function jourJState(event: Span, now: Date, checkedIn: boolean, timeZone = BUSINESS_TIMEZONE): JourJState {
  if (checkedIn || now >= jourJClosesAt(event, timeZone)) return "closed";
  return "open";
}
