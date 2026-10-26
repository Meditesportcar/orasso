// Lot R5c2 : le jour et l'heure du formulaire « Proposer une sortie » (heure de Paris, comme l'assistant d'événement).
import { fromWallTime } from "@orasso/shared";

/** « AAAA-MM-JJ » et « HH:MM » (heure de Paris) → instant ; `null` si l'un manque ou ne se lit pas. */
export function outingInstant(day: string, time: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day.trim());
  const h = /^(\d{1,2})[:h ]?(\d{2})$/.exec(time.trim());
  if (!d || !h) return null;
  const [year, month, dayOfMonth, hour, minute] = [d[1], d[2], d[3], h[1], h[2]].map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  if (month < 1 || month > 12 || dayOfMonth < 1 || dayOfMonth > 31 || hour > 23 || minute > 59) return null;
  return fromWallTime({ year, month, day: dayOfMonth, hour, minute });
}

/** Le jour est écrit en entier (« AAAA-MM-JJ »). */
export const outingDayReady = (day: string) => /^\d{4}-\d{2}-\d{2}$/.test(day.trim());
