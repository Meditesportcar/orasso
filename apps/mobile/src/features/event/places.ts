// « Ta place » sur un événement de plusieurs jours, ou avec plusieurs véhicules (lot M4, tour 2 : relecture Codex) :
// l'accès montré d'abord est celui qui sert maintenant (retenu, pas encore pointé, jour en cours ou le plus proche),
// puis les autres candidatures en cours, puis les accès déjà utilisés ou passés. Les autres restent au choix.
import { entryHolds, type MyApplication } from "@orasso/shared";

const OPEN = ["pending", "accepted", "waitlisted", "offered", "awaiting_member"];
/** Ordre des candidatures en cours qui ne sont pas (encore) un accès. */
const PENDING_ORDER = ["offered", "pending", "waitlisted", "awaiting_member"];

const startOf = (a: MyApplication) => new Date(a.day?.startsAt ?? a.event.startsAt).getTime();
const endOf = (a: MyApplication) => new Date(a.day?.endsAt ?? a.event.endsAt).getTime();

/**
 * L'accès a-t-il déjà servi ? Une seule règle, partagée avec le Jour J et le site (`entryHolds`) : un jour choisi, ou un
 * événement d'un jour, dès l'entrée ; « tout l'événement » sur plusieurs jours : l'entrée vaut jusqu'à la fin de
 * l'accès, tous les jours (le bouton ne redevient pas « Mon QR » chaque matin).
 */
export function usedNow(a: MyApplication, now: Date): boolean {
  return entryHolds(a, a.event, now);
}

/** Les places de la personne pour cet événement, la plus utile d'abord. */
export function orderPlaces(apps: readonly MyApplication[], eventId: string, now: Date) {
  const t = now.getTime();
  const group = (a: MyApplication) => {
    if (usedNow(a, now) || endOf(a) <= t) return 2;
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
