// Stations de lavage (lot 30, S35) : Overpass / OpenStreetMap (`amenity=car_wash`), données © contributeurs OSM (ODbL,
// attribution affichée dans le widget). Un appel par département et par semaine au plus (cache `wash:<département>`) :
// l'instance publique est un service bénévole à usage raisonnable (AS2). Sans réseau ou désactivé : aucun résultat.
import {
  type CachedPlace,
  departmentCentroids,
  distanceKm,
  homeLabels,
  PLACES_CACHE_LIMIT,
  WASH_SEARCH_KM,
} from "@orasso/shared";

import { env } from "../../env";
import { cachedSource, externalRequest } from "./cache";

export const WASH_TTL_MS = 7 * 24 * 3_600_000;
const WASH_MAX_STALE_MS = 30 * 24 * 3_600_000;

type OverpassElement = {
  type?: string;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
};

const clean = (s: string | undefined, max = 80) => (s ? s.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Adresse lisible à partir des étiquettes `addr:*` d'OpenStreetMap, ou `null`. */
function addressOf(tags: Record<string, string>): string | null {
  const street = [clean(tags["addr:housenumber"], 10), clean(tags["addr:street"])].filter(Boolean).join(" ");
  const city = [clean(tags["addr:postcode"], 10), clean(tags["addr:city"])].filter(Boolean).join(" ");
  const full = [street, city].filter(Boolean).join(", ");
  return full || null;
}

/**
 * Lit la réponse d'Overpass : retire les lieux désaffectés, privés ou sans position, garde le plus proche du centre
 * (`from`) en premier et au plus `PLACES_CACHE_LIMIT` (exporté pour les tests).
 */
export function parseOverpass(json: unknown, from: { lat: number; lng: number }): CachedPlace[] {
  const elements = (json as { elements?: OverpassElement[] } | null)?.elements;
  if (!Array.isArray(elements)) return [];
  const places: (CachedPlace & { km: number })[] = [];
  for (const e of elements) {
    const tags = e.tags ?? {};
    if (tags.amenity !== "car_wash") continue;
    if (tags.disused || tags.abandoned || tags.access === "private" || tags.access === "no") continue;
    const lat = e.lat ?? e.center?.lat;
    const lng = e.lon ?? e.center?.lon;
    if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const name = clean(tags.name) || clean(tags.brand) || clean(tags.operator) || homeLabels.washUnnamed;
    places.push({
      name,
      address: addressOf(tags),
      lat: Math.round(lat * 1e5) / 1e5,
      lng: Math.round(lng * 1e5) / 1e5,
      km: distanceKm(from, { lat, lng }),
    });
  }
  return places
    .sort((a, b) => a.km - b.km)
    .slice(0, PLACES_CACHE_LIMIT)
    .map(({ km: _km, ...place }) => place);
}

/** Requête Overpass QL : points et bâtiments `amenity=car_wash` autour du centre, centre des bâtiments inclus. */
export function overpassQuery(lat: number, lng: number): string {
  const around = `around:${WASH_SEARCH_KM * 1000},${lat},${lng}`;
  return `[out:json][timeout:20];(node["amenity"="car_wash"](${around});way["amenity"="car_wash"](${around}););out center tags 60;`;
}

/** Stations de lavage autour du centre d'un département (cache 7 jours), `[]` si la source ne répond pas. */
export async function washNear(department: string): Promise<CachedPlace[]> {
  const centre = departmentCentroids[department];
  if (!centre) return [];
  const data = await cachedSource<CachedPlace[]>({
    key: `wash:${department}`,
    ttlMs: WASH_TTL_MS,
    enabled: env.OVERPASS_URL !== "off",
    maxStaleMs: WASH_MAX_STALE_MS,
    load: async () => {
      const res = await externalRequest(env.OVERPASS_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ data: overpassQuery(centre.lat, centre.lng) }),
      });
      const json = await res.json();
      // Réponse sans liste (service en surcharge, message d'erreur en 200) : un échec, pas une liste vide mise en cache.
      if (!Array.isArray((json as { elements?: unknown })?.elements)) return null;
      return parseOverpass(json, centre);
    },
  });
  return data ?? [];
}
