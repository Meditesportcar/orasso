// « Ta place » sur un événement de plusieurs jours, ou avec plusieurs véhicules (lot M4, tour 2 : relecture Codex) :
// l'accès montré d'abord est celui qui sert maintenant (retenu, pas encore pointé, jour en cours ou le plus proche),
// puis les autres candidatures en cours, puis les accès déjà utilisés ou passés. Les autres restent au choix.
import { BUSINESS_TIMEZONE, localDate, type MyApplication } from "@orasso/shared";

const OPEN = ["pending", "accepted", "waitlisted", "offered", "awaiting_member"];
/** Ordre des candidatures en cours qui ne sont pas (encore) un accès. */
const PENDING_ORDER = ["offered", "pending", "waitlisted", "awaiting_member"];

const startOf = (a: MyApplication) => new Date(a.day?.startsAt ?? a.event.startsAt).getTime();
const endOf = (a: MyApplication) => new Date(a.day?.endsAt ?? a.event.endsAt).getTime();

/**
 * L'accès a-t-il déjà servi ? Un jour choisi, ou un événement d'un jour : dès l'entrée. Tout l'événement sur plusieurs
 * jours : seulement aujourd'hui (le pass resservira le lendemain, comme sur l'écran du QR).
 */
export function usedNow(a: MyApplication, now: Date, multiDay: boolean): boolean {
  if (!a.checkedInAt) return false;
  if (!multiDay || a.day) return true;
  return localDate(new Date(a.checkedInAt), BUSINESS_TIMEZONE) === localDate(now, BUSINESS_TIMEZONE);
}

/** Les places de la personne pour cet événement, la plus utile d'abord. */
export function orderPlaces(apps: readonly MyApplication[], eventId: string, now: Date, multiDay: boolean) {
  const t = now.getTime();
  const group = (a: MyApplication) => {
    if (usedNow(a, now, multiDay) || endOf(a) <= t) return 2;
    return a.status === "accepted" ? 0 : 1;
  };
  return apps
    .filter((a) => a.event.id === eventId && OPEN.includes(a.status))
    .sort(
      (a, b) =>
        group(a) - group(b) ||
        (group(a) === 1 ? PENDING_ORDER.indexOf(a.status) - PENDING_ORDER.indexOf(b.status) : 0) ||
        (group(a) === 2 ? startOf(b) - startOf(a) : startOf(a) - startOf(b)),
    );
}
