// Ouverture d'office du QR le jour J (D34, lot C2a) : logique pure, testée. Le jour J est jugé en date de Paris : le jour
// de la candidature quand elle porte sur un jour d'un événement de plusieurs jours, sinon toute la plage de l'événement.
// La clé (une ouverture par place et par jour) est la même date de Paris : pas de seconde ouverture à minuit UTC.
import { BUSINESS_TIMEZONE, localDate } from "@orasso/shared";

type Span = { startsAt: string; endsAt: string };

/** Vrai si `now` (date de Paris) tombe le jour choisi, ou entre le premier et le dernier jour de l'événement. */
export function isDayJ(event: Span, day: { date: string } | null | undefined, now: Date, timeZone = BUSINESS_TIMEZONE) {
  const today = localDate(now, timeZone);
  if (day) return day.date === today;
  return localDate(new Date(event.startsAt), timeZone) <= today && today <= localDate(new Date(event.endsAt), timeZone);
}

/** Clé de l'ouverture d'office : une par place et par date de Paris. */
export const autoOpenKey = (placeId: string, now: Date, timeZone = BUSINESS_TIMEZONE) =>
  `jourj-auto:${placeId}:${localDate(now, timeZone)}`;
