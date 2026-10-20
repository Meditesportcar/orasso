// Marqueurs de la carte (lot 44, prototype `s-map`) : un événement est une étiquette inclinée avec sa date
// (« SAM 24 »), un groupe de points proches une pastille avec le nombre, un pro une plaque, toi un point. Ici, la partie
// pure commune au site et à l'appli : la date de l'étiquette et le regroupement des points à un niveau de zoom.
import { wallTime } from "@orasso/shared";

const DAYS = ["DIM", "LUN", "MAR", "MER", "JEU", "VEN", "SAM"] as const;

/** Date d'une étiquette d'événement, heure de Paris : « SAM 24 ». */
export function pinDateLabel(iso: string | Date, timeZone?: string): string {
  const w = wallTime(typeof iso === "string" ? new Date(iso) : iso, timeZone);
  const weekday = new Date(Date.UTC(w.year, w.month - 1, w.day)).getUTCDay();
  return `${DAYS[weekday]} ${w.day}`;
}

export type MapPoint = { id: string; lat: number; lng: number };
export type PinGroup<T extends MapPoint> = { id: string; lat: number; lng: number; items: T[] };

/** Rayon de regroupement, en pixels d'écran. */
export const CLUSTER_RADIUS_PX = 44;

/** Zoom au-delà duquel toucher une pastille n'a plus de sens : elle ouvre la liste de ses lieux. */
export const GROUP_MAX_ZOOM = 16;
/** Écart (en degrés, environ 50 m) sous lequel des points sont confondus (un circuit, plusieurs dates). */
export const STACKED_DEGREES = 0.0005;

/**
 * La pastille regroupe-t-elle des points confondus (même lieu), ou est-on déjà au zoom maximal ? Alors la toucher
 * ouvre la liste de ses lieux au lieu de zoomer (sinon ils resteraient injoignables).
 */
export function isStacked(group: { items: readonly MapPoint[] }, zoom: number, maxZoom = GROUP_MAX_ZOOM): boolean {
  if (group.items.length < 2) return false;
  if (zoom >= maxZoom) return true;
  const lats = group.items.map((p) => p.lat);
  const lngs = group.items.map((p) => p.lng);
  return (
    Math.max(...lats) - Math.min(...lats) < STACKED_DEGREES && Math.max(...lngs) - Math.min(...lngs) < STACKED_DEGREES
  );
}

/** Position en pixels du monde (Web Mercator, tuiles de 512 comme MapLibre) à un zoom donné. */
function worldPx(lat: number, lng: number, zoom: number): [number, number] {
  const size = 512 * 2 ** zoom;
  const s = Math.min(Math.max(Math.sin((lat * Math.PI) / 180), -0.9999), 0.9999);
  return [((lng + 180) / 360) * size, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * size];
}

/**
 * Regroupe les points à moins de `radiusPx` les uns des autres au zoom donné (glouton, dans l'ordre reçu : le premier
 * d'un groupe en est le centre). Un groupe d'un seul point se dessine comme le point lui-même.
 */
export function clusterPins<T extends MapPoint>(
  points: readonly T[],
  zoom: number,
  radiusPx = CLUSTER_RADIUS_PX,
): PinGroup<T>[] {
  const groups: Array<PinGroup<T> & { px: [number, number] }> = [];
  for (const p of points) {
    const px = worldPx(p.lat, p.lng, zoom);
    const near = groups.find((g) => Math.hypot(g.px[0] - px[0], g.px[1] - px[1]) < radiusPx);
    if (near) {
      near.items.push(p);
      const n = near.items.length;
      near.lat += (p.lat - near.lat) / n;
      near.lng += (p.lng - near.lng) / n;
    } else groups.push({ id: p.id, lat: p.lat, lng: p.lng, items: [p], px });
  }
  // Deux groupes dont les centres se touchent (le centre a bougé) n'en font qu'un : pas de pastilles superposées.
  for (let merged = true; merged; ) {
    merged = false;
    for (let i = 0; i < groups.length && !merged; i++) {
      for (let j = i + 1; j < groups.length && !merged; j++) {
        const a = groups[i] as (typeof groups)[number];
        const b = groups[j] as (typeof groups)[number];
        a.px = worldPx(a.lat, a.lng, zoom);
        b.px = worldPx(b.lat, b.lng, zoom);
        if (Math.hypot(a.px[0] - b.px[0], a.px[1] - b.px[1]) >= radiusPx) continue;
        const n = a.items.length + b.items.length;
        a.lat = (a.lat * a.items.length + b.lat * b.items.length) / n;
        a.lng = (a.lng * a.items.length + b.lng * b.items.length) / n;
        a.items.push(...b.items);
        groups.splice(j, 1);
        merged = true;
      }
    }
  }
  return groups.map(({ px: _px, ...g }) => ({ ...g, id: g.items.length > 1 ? `group:${g.items[0]?.id}` : g.id }));
}
