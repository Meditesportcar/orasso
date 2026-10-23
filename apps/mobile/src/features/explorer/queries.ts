// Réglages de l'Explorer → paramètres de l'API, en fonctions pures (testées). Les filtres et le tri sont appliqués par
// l'API ; l'appli ne fait que les traduire. Explorer v2 (lot 44, `s-explore`) : par défaut tout, du plus proche au plus
// loin (`sort=distance` : position de l'appareil si elle est activée, sinon le département favori du profil) ;
// filtres Format, Quand, Selon mes goûts (« Mes affinités » = tri par affinités, « Structures suivies » = filtre).
import { addDays, type EventFormat, fromWallTime, type LatLng, wallTime } from "@orasso/shared";

import type { ExploreEventsQuery, ExploreProsQuery } from "@/lib/api/explorer";

export const RADII = [10, 25, 50, 100, 200] as const;

export type When = "all" | "weekend" | "month";

export type EventFilters = {
  format: EventFormat | "";
  when: When;
  /** « Mes affinités » : l'ordre par affinités (S34) au lieu de la distance. */
  affinity: boolean;
  /** « Structures suivies » : seulement leurs événements. */
  followed: boolean;
};

export const emptyEventFilters: EventFilters = { format: "", when: "all", affinity: false, followed: false };

export type ProFilters = { activity: string; department: string; radiusKm: number | null };
export const emptyProFilters: ProFilters = { activity: "", department: "", radiusKm: null };

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

/** Lot M4 (maquette 3.2) : le tri choisi dans « Trier : … ▾ » (gardé pour les prochaines visites). */
export const EVENT_SORTS = ["distance", "date", "recent", "seats"] as const;
export type EventSort = (typeof EVENT_SORTS)[number];
export const SORT_KEY = "explorer.sort";

/**
 * Lot M4, tour 2 (décision de Damien du 23/10) : « Autour de… », le point de départ de l'Explorer. « Mon coin » : les
 * départements du compte (plus tard « Tes préférences », lot M6) ; « Autour de moi » : la position de l'appareil,
 * demandée sur ce geste seulement ; « Ailleurs… » : un autre département (pas de géocodage de ville). Temporaire : jamais
 * enregistré (ni profil, ni préférences, ni appareil) ; la position reste en mémoire de l'écran.
 */
export type Around = { kind: "mine" } | { kind: "me" } | { kind: "dept"; code: string };
/** Où chercher : le point de départ et la distance propre à l'Explorer (`null` = partout en France). */
export type ExplorerPlace = { around: Around; radiusKm: number | null };

/** Ce que l'Explorer utilise vraiment : un choix fait, sinon la position si elle est activée, sinon « Mon coin ». */
export function effectiveAround(chosen: Around | null, positionOn: boolean): Around {
  if (chosen?.kind === "me" && !positionOn) return { kind: "mine" };
  return chosen ?? (positionOn ? { kind: "me" } : { kind: "mine" });
}

/** Clé du cache de la liste : jamais pour « Autour de moi » (distances calculées depuis la position). */
export function placeKey(place: ExplorerPlace): string | null {
  const where = place.around.kind === "mine" ? "coin" : place.around.kind === "dept" ? `d${place.around.code}` : null;
  return where === null ? null : `${where}.${place.radiusKm ?? "partout"}`;
}

export function eventQuery(
  q: string,
  filters: EventFilters,
  position: LatLng | null,
  mode: "list" | "map",
  now: Date,
  cursor?: string,
  sort: EventSort = "distance",
  /** Lot M4, tour 2 : « Autour de… » ; absent, la position de l'appareil sert si elle est là (comme avant). */
  place?: ExplorerPlace,
): ExploreEventsQuery {
  const around = place?.around ?? null;
  const usePosition = around === null || around.kind === "me";
  return {
    q: q.trim() || undefined,
    format: filters.format || undefined,
    ...whenRange(filters.when, now),
    // « Mes affinités » (filtres) l'emporte sur le tri choisi.
    sort: filters.affinity ? "affinity" : sort,
    followed: filters.followed ? "1" : undefined,
    lat: usePosition ? position?.lat : undefined,
    lng: usePosition ? position?.lng : undefined,
    around: around?.kind === "dept" ? around.code : undefined,
    radiusKm: place?.radiusKm ?? undefined,
    everywhere: place && place.radiusKm === null ? "1" : undefined,
    limit: mode === "map" ? 100 : 20,
    cursor,
  };
}

export function proQuery(
  q: string,
  filters: ProFilters,
  sort: "name" | "distance",
  position: LatLng | null,
  mode: "list" | "map",
  cursor?: string,
): ExploreProsQuery {
  return {
    q: q.trim() || undefined,
    activity: filters.activity || undefined,
    department: filters.department || undefined,
    sort,
    radiusKm: filters.radiusKm ?? undefined,
    lat: position?.lat,
    lng: position?.lng,
    limit: mode === "map" ? 100 : 20,
    cursor,
  };
}

/** Nombre de filtres actifs (pastille du bouton « Filtres »). */
export function activeFilters(filters: EventFilters | ProFilters): number {
  if ("when" in filters) {
    return (
      (filters.format ? 1 : 0) +
      (filters.when !== "all" ? 1 : 0) +
      (filters.affinity ? 1 : 0) +
      (filters.followed ? 1 : 0)
    );
  }
  return Object.values(filters).filter((v) => v !== "" && v !== null).length;
}

/** « Plus tard » (position) : on ne propose à nouveau la carte qu'après ce nombre de jours. */
export const ASK_AGAIN_DAYS = 7;

/** La carte « Activer / Plus tard » se montre-t-elle encore, vu la date du dernier « Plus tard » ? */
export function shouldAsk(laterAtMs: number | null, now: number): boolean {
  return laterAtMs === null || now - laterAtMs >= ASK_AGAIN_DAYS * 86_400_000;
}
