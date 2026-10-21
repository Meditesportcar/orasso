// Accès flottant du site (lot C5, artefact DA v2 `.near`) : comme dans l'appli (`features/sorties/NextAccessBar`), une carte
// crème posée au-dessus de la barre d'onglets pour la place retenue la plus proche, de J-7 (dès 0 h, heure de Paris) au
// lendemain de la fin ; masquée sur l'Accueil et sur Sorties, qui l'affichent déjà.
import { calendarDaysBetween, type MyApplication } from "@orasso/shared";

export const NEAR_BEFORE_DAYS = 7;
export const NEAR_AFTER_DAYS = 1;

export type NearAccess = {
  /** Jour du mois et mois abrégé, en deux blocs (« 24 », « OCT. »). */
  day: string;
  month: string;
  title: string;
  /** « J-6 », « Demain », « Aujourd'hui », « J+1 ». */
  countdown: string;
};

const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const TZ = "Europe/Paris";

const parts = (d: Date) => {
  const f = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, day: "numeric", month: "numeric" }).formatToParts(d);
  return {
    day: Number(f.find((p) => p.type === "day")?.value),
    month: Number(f.find((p) => p.type === "month")?.value),
  };
};

export function countdownOf(startsAt: Date, now: Date): string {
  const days = calendarDaysBetween(now, startsAt);
  if (days === 0) return "Aujourd'hui";
  if (days === 1) return "Demain";
  return days > 0 ? `J-${days}` : `J+${-days}`;
}

/** Vrai si l'accès est dans la fenêtre : de J-7 à J+1 après la fin (un événement de plusieurs jours reste tant qu'il dure). */
export function inNearWindow(startsAt: Date, endsAt: Date, now: Date): boolean {
  return calendarDaysBetween(now, startsAt) <= NEAR_BEFORE_DAYS && calendarDaysBetween(endsAt, now) <= NEAR_AFTER_DAYS;
}

/** La place retenue la plus proche dans la fenêtre (le plus tôt d'abord), ou `null`. */
export function nearAccessOf(apps: readonly MyApplication[] | null | undefined, now: Date): NearAccess | null {
  const live = (apps ?? [])
    .filter((a) => a.status === "accepted" && !a.checkedInAt && a.event.status === "published")
    .filter((a) => inNearWindow(new Date(a.event.startsAt), new Date(a.event.endsAt), now))
    .sort((a, b) => new Date(a.event.startsAt).getTime() - new Date(b.event.startsAt).getTime());
  const next = live[0];
  if (!next) return null;
  const start = new Date(next.event.startsAt);
  const p = parts(start);
  return {
    day: String(p.day),
    month: MONTHS[p.month - 1] ?? "",
    title: next.event.title,
    countdown: countdownOf(start, now),
  };
}
