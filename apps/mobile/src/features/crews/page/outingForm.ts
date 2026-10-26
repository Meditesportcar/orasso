// Lot R5c2 : le jour et l'heure du formulaire « Proposer une sortie » (heure de Paris, comme l'assistant d'événement).
// Tour 2 : lus strictement par la règle commune (`crewOutingWallInstant`) : un jour ou une heure qui n'existe pas est
// refusé avec une ligne qui le dit.
import { crewOutingWallInstant } from "@orasso/shared";

/** « AAAA-MM-JJ » et « HH:MM » (heure de Paris) → instant ; `null` si l'un manque, ne se lit pas ou n'existe pas. */
export function outingInstant(day: string, time: string): Date | null {
  return crewOutingWallInstant(day, time).at;
}

/** Ce qui ne va pas dans le jour et l'heure tapés (`null` : rien). */
export const outingWhenIssue = (day: string, time: string) => crewOutingWallInstant(day, time).issue;

/** Le jour est écrit en entier (« AAAA-MM-JJ »). */
export const outingDayReady = (day: string) => /^\d{4}-\d{2}-\d{2}$/.test(day.trim());
