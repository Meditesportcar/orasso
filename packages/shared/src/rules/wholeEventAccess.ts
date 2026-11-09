// Accès « tout l'événement » (lot R7-0, tour 2) : une seule règle pour l'appli (fiche, Jour J, sorties) et le site. Un
// accès sans jour choisi, sur un événement de plusieurs jours (en jours calendaires, `eventDayCount`), se pointe une
// seule fois et vaut jusqu'à la fin de l'accès (J+1 à 0 h, fuseau de l'événement) ; un accès « par jour » (ou un
// événement d'un seul jour) se pointe pour ce jour-là seulement. Le QR reste disponible en second pour un contrôle.
import { BUSINESS_TIMEZONE } from "../enums";
import { eventDayCount } from "./eventProgress";
import { addDays, fromWallTime, wallTime } from "./time";

type Span = { startsAt: string | Date; endsAt: string | Date };
type Access = { day?: unknown | null; checkedInAt?: string | Date | null };

/** J+1 à 0 h (fuseau de l'événement) après la fin : l'accès se ferme et le QR quitte le téléphone. */
export function accessClosesAt(event: Span, timeZone = BUSINESS_TIMEZONE): Date {
  const day = addDays(wallTime(new Date(event.endsAt), timeZone), 1);
  return fromWallTime({ ...day, hour: 0, minute: 0 }, timeZone);
}

/** Accès « tout l'événement » : pas de jour choisi, événement de plusieurs jours calendaires. */
export function isWholeEventAccess(access: Pick<Access, "day">, event: Span, timeZone = BUSINESS_TIMEZONE): boolean {
  return !access.day && eventDayCount(event, timeZone) > 1;
}

/**
 * L'entrée enregistrée sert-elle encore ? Accès « tout l'événement » : tant que l'accès n'est pas fermé, tous les
 * jours (personne ne repointe chaque matin). Accès par jour ou événement d'un jour : dès l'entrée.
 */
export function entryHolds(access: Access, event: Span, now: Date, timeZone = BUSINESS_TIMEZONE): boolean {
  if (!access.checkedInAt) return false;
  if (!isWholeEventAccess(access, event, timeZone)) return true;
  return now < accessClosesAt(event, timeZone);
}

/** Entré avec un accès « tout l'événement » encore ouvert : « Entrée … · accès jusqu'au … », QR en second. */
export function wholeEventEntryHolds(access: Access, event: Span, now: Date, timeZone = BUSINESS_TIMEZONE): boolean {
  return isWholeEventAccess(access, event, timeZone) && entryHolds(access, event, now, timeZone);
}
