import { BUSINESS_TIMEZONE } from "@orasso/shared";

const dateTime = new Intl.DateTimeFormat("fr-FR", {
  timeZone: BUSINESS_TIMEZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

/** « samedi 17 octobre à 19:00 » (heure de Paris), pour les textes de notifications et d'e-mails. */
export function formatDateTime(date: Date): string {
  return dateTime.format(date);
}
