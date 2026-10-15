// Dates et durées en français, dans le fuseau de l'événement (Europe/Paris par défaut), comme dans les maquettes :
// « Sam 17 oct », « 19 h », « 19 h 30 », « J-2 », « dans 1 h 42 ».
import { BUSINESS_TIMEZONE, calendarDaysBetween, wallTime } from "@orasso/shared";

const WEEKDAYS = ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"];
const MONTHS = ["janv", "févr", "mars", "avr", "mai", "juin", "juil", "août", "sept", "oct", "nov", "déc"];

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Jour de la semaine (0 = dimanche) d'une date du calendrier. */
const weekdayOf = (w: { year: number; month: number; day: number }) => new Date(Date.UTC(w.year, w.month - 1, w.day)).getUTCDay();

/** « Sam 17 oct » */
export function formatDay(iso: string | Date, timeZone = BUSINESS_TIMEZONE): string {
  const w = wallTime(new Date(iso), timeZone);
  return `${capitalize(WEEKDAYS[weekdayOf(w)] ?? "")} ${w.day} ${MONTHS[w.month - 1]}`;
}

/** « 17 oct » */
export function formatShortDate(iso: string | Date, timeZone = BUSINESS_TIMEZONE): string {
  const w = wallTime(new Date(iso), timeZone);
  return `${w.day} ${MONTHS[w.month - 1]}`;
}

/** « 19 h » ou « 19 h 30 » */
export function formatHour(iso: string | Date, timeZone = BUSINESS_TIMEZONE): string {
  const w = wallTime(new Date(iso), timeZone);
  return w.minute === 0 ? `${w.hour} h` : `${w.hour} h ${String(w.minute).padStart(2, "0")}`;
}

/** « Sam 17 oct · 19 h » */
export function formatDayHour(iso: string | Date, timeZone = BUSINESS_TIMEZONE): string {
  return `${formatDay(iso, timeZone)} · ${formatHour(iso, timeZone)}`;
}

/** « 17 oct à 14 h 05 », pour un horodatage de cache. */
export function formatStamp(iso: string | Date, timeZone = BUSINESS_TIMEZONE): string {
  return `${formatShortDate(iso, timeZone)} à ${formatHour(iso, timeZone)}`;
}

/** « 1 h 42 », « 12 min », « 45 s » : durée jusqu'à une échéance (au moins 1 s). */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  if (total >= 24 * 3600) {
    const d = Math.floor(total / 86400);
    const rest = Math.floor((total % 86400) / 3600);
    return rest > 0 ? `${d} j ${rest} h` : `${d} j`;
  }
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) return m > 0 ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
  if (m > 0) return `${m} min`;
  return `${total} s`;
}

/** Titre d'affiche sur deux lignes, coupé au plus près du milieu : « Nocturne / de Canet ». */
export function breakTitle(title: string): string {
  if (title.length <= 14 || !title.includes(" ")) return title;
  let best = -1;
  for (let i = 0; i < title.length; i++) {
    if (title[i] === " " && (best < 0 || Math.abs(i - title.length / 2) < Math.abs(best - title.length / 2))) best = i;
  }
  return best < 0 ? title : `${title.slice(0, best)}\n${title.slice(best + 1)}`;
}

/** « J-2 », « Aujourd'hui », « Demain », « J+1 » */
export function dayCountdown(startsAt: string | Date, now: Date, timeZone = BUSINESS_TIMEZONE): string {
  const days = calendarDaysBetween(now, new Date(startsAt), timeZone);
  if (days === 0) return "Aujourd'hui";
  if (days === 1) return "Demain";
  return days > 0 ? `J-${days}` : `J+${-days}`;
}

/** « dans 2 jours », « ce soir », « demain », « aujourd'hui » : l'étiquette « Prochain accès · … » de l'Accueil. */
export function relativeDay(startsAt: string | Date, now: Date, timeZone = BUSINESS_TIMEZONE): string {
  const days = calendarDaysBetween(now, new Date(startsAt), timeZone);
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return "demain";
  return `dans ${days} jours`;
}
