// Réglages de l'Explorer → paramètres de l'API, en fonctions pures (testées). Les filtres et le tri sont appliqués par
// l'API ; l'appli ne fait que les traduire. Explorer v2 (lot 44, `s-explore`) : par défaut tout, du plus proche au plus
// loin (`sort=distance` : position de l'appareil si elle est activée, sinon le département favori du profil) ;
// filtres Format, Quand, Selon mes goûts (« Mes affinités » = tri par affinités, « Structures suivies » = filtre).
// Lot R2 : le lieu de « Où chercher ? » (`ExplorerWhere`, règles communes de `@orasso/shared`), le nombre en tout sur la
// première page (`withTotal`), le métier des pros.
import {
  addDays,
  type EventFormat,
  type ExplorerWhere,
  eventFormats,
  fromWallTime,
  type LatLng,
  type ProActivity,
  wallTime,
  whereQuery,
} from "@orasso/shared";

import type { ExploreEventsQuery, ExploreProsQuery } from "@/lib/api/explorer";

export type When = "all" | "weekend" | "month";

export type EventFilters = {
  format: EventFormat | "";
  /** Lot M4, tour 2 : les types de « Tes préférences » (lot M6), tant qu'aucun format n'est choisi dans les filtres. */
  formats?: EventFormat[];
  when: When;
  /** « Mes affinités » : l'ordre par affinités (S34) au lieu de la distance. */
  affinity: boolean;
  /** « Structures suivies » : seulement leurs événements. */
  followed: boolean;
};

export const emptyEventFilters: EventFilters = { format: "", when: "all", affinity: false, followed: false };

/** « 2026-10-17 » → minuit (début) ou 23 h 59 (fin) à Paris, en instant ISO ; `undefined` si la date est illisible. */
export function dayBound(value: string, end: boolean): string | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return undefined;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  return fromWallTime({ year, month, day, hour: end ? 23 : 0, minute: end ? 59 : 0 }).toISOString();
}

/**
 * Période du filtre « Quand », heure de Paris : ce week-end (samedi 0 h → dimanche 23 h 59, celui en cours le
 * samedi et le dimanche), ce mois-ci (maintenant → dernier jour du mois, 23 h 59). `{}` : toutes dates.
 */
export function whenRange(when: When, now: Date): { from?: string; to?: string } {
  if (when === "all") return {};
  const today = { ...wallTime(now), hour: 0, minute: 0 };
  if (when === "month") {
    const firstNext =
      today.month === 12
        ? { ...today, year: today.year + 1, month: 1, day: 1 }
        : { ...today, month: today.month + 1, day: 1 };
    const last = addDays(firstNext, -1);
    return { from: now.toISOString(), to: fromWallTime({ ...last, hour: 23, minute: 59 }).toISOString() };
  }
  const weekday = new Date(Date.UTC(today.year, today.month - 1, today.day)).getUTCDay();
  // Samedi 6, dimanche 0 : le week-end en cours ; sinon le prochain samedi.
  const saturday = weekday === 6 ? today : weekday === 0 ? addDays(today, -1) : addDays(today, 6 - weekday);
  const sunday = addDays(saturday, 1);
  return {
    from: fromWallTime(saturday).toISOString(),
    to: fromWallTime({ ...sunday, hour: 23, minute: 59 }).toISOString(),
  };
}

/** Lot M4 (maquette 3.2) : le tri des événements (gardé avec le choix de l'Explorer, lot R1 ; par date, lot R2). */
export const EVENT_SORTS = ["date", "distance", "recent", "seats"] as const;
export type EventSort = (typeof EVENT_SORTS)[number];
/** Lot M4 : clé d'avant le lot R1 (tri seul, sans compte) ; lue une fois puis effacée (`explorerChoice.ts`). */
export const SORT_KEY = "explorer.sort";

/** Où chercher (lot R2) : le lieu et mes départements (Mon coin). */
export type ExplorerPlace = { where: ExplorerWhere; coin: readonly string[] };

/**
 * Clé du cache de la liste : par lieu, jamais pour « Autour de moi » (les distances partent de la position, rien d'elle
 * ne s'écrit sur l'appareil).
 */
export function placeKey(place: ExplorerPlace): string | null {
  const w = place.where;
  if (w.kind === "me") return null;
  return w.kind === "mine" ? `coin.${place.coin.join("+")}` : w.kind === "dept" ? `d${w.code}` : "partout";
}

/**
 * Les types de « Tes préférences » qui filtrent vraiment : ni vides ni tous cochés (`preferenceFilterCount` les compte
 * de la même façon).
 */
export function preferredFormats(formats: readonly EventFormat[] | null | undefined): EventFormat[] {
  return formats && formats.length > 0 && formats.length < eventFormats.length ? [...formats] : [];
}

export function eventQuery(
  q: string,
  filters: EventFilters,
  position: LatLng | null,
  mode: "list" | "map",
  now: Date,
  cursor?: string,
  sort: EventSort = "date",
  place?: ExplorerPlace,
): ExploreEventsQuery {
  const where = place
    ? whereQuery(place.where, position, place.coin)
    : position
      ? { lat: position.lat, lng: position.lng }
      : {};
  return {
    q: q.trim() || undefined,
    format: filters.format || undefined,
    formats: !filters.format && filters.formats?.length ? filters.formats.join(",") : undefined,
    ...whenRange(filters.when, now),
    // « Mes affinités » (filtres) l'emporte sur le tri choisi.
    sort: filters.affinity ? "affinity" : sort,
    followed: filters.followed ? "1" : undefined,
    ...where,
    limit: mode === "map" ? 100 : 20,
    // Lot R2 : le nombre en tout, sur la première page de la liste (« 12 événements à venir »).
    withTotal: mode === "list" && !cursor ? "1" : undefined,
    cursor,
  };
}

export type ProSortValue = "name" | "distance";

export function proQuery(
  q: string,
  job: ProActivity | "",
  sort: ProSortValue,
  position: LatLng | null,
  mode: "list" | "map",
  cursor?: string,
  place?: ExplorerPlace,
): ExploreProsQuery {
  const where = place
    ? whereQuery(place.where, position, place.coin)
    : position
      ? { lat: position.lat, lng: position.lng }
      : {};
  const {
    everywhere: _all,
    around: _around,
    ...rest
  } = where as typeof where & { everywhere?: string; around?: string };
  return {
    q: q.trim() || undefined,
    activity: job || undefined,
    sort,
    ...rest,
    limit: mode === "map" ? 100 : 20,
    withTotal: mode === "list" && !cursor ? "1" : undefined,
    cursor,
  };
}

/** Nombre de filtres actifs (pastille du bouton « Filtres »). */
export function activeFilters(filters: EventFilters): number {
  return (
    (filters.format ? 1 : 0) +
    (filters.when !== "all" ? 1 : 0) +
    (filters.affinity ? 1 : 0) +
    (filters.followed ? 1 : 0)
  );
}

/** « Plus tard » (position) : on ne propose à nouveau la carte qu'après ce nombre de jours. */
export const ASK_AGAIN_DAYS = 7;

/** La carte « Activer / Plus tard » se montre-t-elle encore, vu la date du dernier « Plus tard » ? */
export function shouldAsk(laterAtMs: number | null, now: number): boolean {
  return laterAtMs === null || now - laterAtMs >= ASK_AGAIN_DAYS * 86_400_000;
}
