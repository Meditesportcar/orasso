// Réglages de l'Explorer → paramètres de l'API, en fonctions pures (testées). Les filtres et le tri sont appliqués par
// l'API ; l'appli ne fait que les traduire.
import { type EventSort, fromWallTime, type LatLng } from "@orasso/shared";

import type { ExploreEventsQuery, ExploreProsQuery } from "@/lib/api/explorer";

export const RADII = [10, 25, 50, 100, 200] as const;

export type EventFilters = {
  format: string;
  categoryId: string;
  department: string;
  /** `AAAA-MM-JJ` ou vide. */
  from: string;
  to: string;
  radiusKm: number | null;
};

export const emptyEventFilters: EventFilters = {
  format: "",
  categoryId: "",
  department: "",
  from: "",
  to: "",
  radiusKm: null,
};

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

export function eventQuery(
  q: string,
  filters: EventFilters,
  sort: EventSort,
  position: LatLng | null,
  mode: "list" | "map",
  cursor?: string,
): ExploreEventsQuery {
  return {
    q: q.trim() || undefined,
    format: filters.format || undefined,
    categoryId: filters.categoryId || undefined,
    department: filters.department || undefined,
    from: dayBound(filters.from, false),
    to: dayBound(filters.to, true),
    sort,
    radiusKm: filters.radiusKm ?? undefined,
    lat: position?.lat,
    lng: position?.lng,
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
export const activeFilters = (filters: EventFilters | ProFilters): number =>
  Object.values(filters).filter((v) => v !== "" && v !== null).length;
