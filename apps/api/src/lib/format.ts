import { BUSINESS_TIMEZONE, yearToShow } from "@orasso/shared";

const options = {
  timeZone: BUSINESS_TIMEZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
} as const;
const dateTime = new Intl.DateTimeFormat("fr-FR", options);
const dateTimeYear = new Intl.DateTimeFormat("fr-FR", { ...options, year: "numeric" });

/**
 * « samedi 17 octobre à 19:00 » (heure de Paris), pour les textes de notifications et d'e-mails ; lot R3b : « samedi
 * 17 octobre 2027 à 19:00 » hors de l'année en cours (horloge de l'API).
 */
export function formatDateTime(date: Date): string {
  return (yearToShow(date) === null ? dateTime : dateTimeYear).format(date);
}
