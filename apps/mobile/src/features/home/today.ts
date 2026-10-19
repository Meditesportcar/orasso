// La ligne de salutation d'un accueil (lot 43) : « Dimanche 18 octobre · Atelier Têt Detailing ». Le jour est celui de
// l'horloge de l'appareil (ou simulée), dans le fuseau de l'activité (Europe/Paris).
import { BUSINESS_TIMEZONE, wallTime } from "@orasso/shared";

const WEEKDAYS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const MONTHS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

/** « Dimanche 18 octobre », éventuellement suivi de « · <lieu> ». */
export function todayLine(now: Date, place?: string | null, timeZone = BUSINESS_TIMEZONE): string {
  const w = wallTime(now, timeZone);
  const weekday = WEEKDAYS[new Date(Date.UTC(w.year, w.month - 1, w.day)).getUTCDay()];
  const day = `${weekday} ${w.day} ${MONTHS[w.month - 1]}`;
  return place ? `${day} · ${place}` : day;
}
