// Filtre « phrase à trous » de `/evenements` (lot 56) : villes proposées pour « autour de », rayons et fenêtres de dates.
// Pur (sans accès au serveur) : le chargeur de la page et ses tests l'utilisent.
import { fromWallTime, wallTime } from "@orasso/shared";

/** Villes proposées pour « autour de » : le centre sert de position, le département de repère. */
export const filterCities = [
  { id: "perpignan", name: "Perpignan", lat: 42.6887, lng: 2.8948 },
  { id: "narbonne", name: "Narbonne", lat: 43.1839, lng: 3.0035 },
  { id: "carcassonne", name: "Carcassonne", lat: 43.213, lng: 2.3491 },
  { id: "beziers", name: "Béziers", lat: 43.3442, lng: 3.2158 },
  { id: "montpellier", name: "Montpellier", lat: 43.6108, lng: 3.8767 },
  { id: "nimes", name: "Nîmes", lat: 43.8367, lng: 4.3601 },
  { id: "toulouse", name: "Toulouse", lat: 43.6047, lng: 1.4442 },
  { id: "foix", name: "Foix", lat: 42.9654, lng: 1.6054 },
  { id: "marseille", name: "Marseille", lat: 43.2965, lng: 5.3698 },
  { id: "lyon", name: "Lyon", lat: 45.764, lng: 4.8357 },
  { id: "bordeaux", name: "Bordeaux", lat: 44.8378, lng: -0.5792 },
  { id: "paris", name: "Paris", lat: 48.8566, lng: 2.3522 },
] as const;
export type FilterCity = (typeof filterCities)[number];

export const filterRadii = [20, 40, 60, 100, 200] as const;
export const DEFAULT_RADIUS = 60;

export const filterWhens = ["weekend", "month", "next"] as const;
export type FilterWhen = (typeof filterWhens)[number];

export const cityById = (id: string): FilterCity | undefined => filterCities.find((c) => c.id === id);

/**
 * Fenêtre de dates (heure de Paris) : « ce week-end » (samedi 0 h → dimanche 23 h 59, ou aujourd'hui → dimanche si on
 * y est), « ce mois-ci » (maintenant → fin du mois), « le mois prochain ».
 */
export function whenRange(when: FilterWhen, nowMs: number): { from: string; to: string } {
  const now = wallTime(new Date(nowMs));
  const at = (year: number, month: number, day: number, hour: number, minute: number) =>
    fromWallTime({ year, month, day, hour, minute }).toISOString();
  if (when === "weekend") {
    const weekday = new Date(Date.UTC(now.year, now.month - 1, now.day)).getUTCDay();
    const toSaturday = weekday === 0 ? -1 : weekday === 6 ? 0 : 6 - weekday;
    const saturday = new Date(Date.UTC(now.year, now.month - 1, now.day + toSaturday));
    const sunday = new Date(Date.UTC(now.year, now.month - 1, now.day + toSaturday + 1));
    return {
      from: at(saturday.getUTCFullYear(), saturday.getUTCMonth() + 1, saturday.getUTCDate(), 0, 0),
      to: at(sunday.getUTCFullYear(), sunday.getUTCMonth() + 1, sunday.getUTCDate(), 23, 59),
    };
  }
  const monthShift = when === "next" ? 1 : 0;
  const first = new Date(Date.UTC(now.year, now.month - 1 + monthShift, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
  return {
    from:
      when === "next" ? at(first.getUTCFullYear(), first.getUTCMonth() + 1, 1, 0, 0) : new Date(nowMs).toISOString(),
    to: at(last.getUTCFullYear(), last.getUTCMonth() + 1, last.getUTCDate(), 23, 59),
  };
}
