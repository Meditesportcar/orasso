// Stations de lavage (lot 30, S35) : Overpass / OpenStreetMap (`amenity=car_wash`), données © contributeurs OSM (ODbL,
// attribution affichée dans le widget). Un appel par département et par semaine au plus (cache `wash:<département>`) :
// l'instance publique est un service bénévole à usage raisonnable (AS2). Sans réseau ou désactivé : aucun résultat.
// Petit lot de fin D : la même requête (donc le même appel et le même cache) ramène aussi les stations-service d'OpenStreetMap
// (`amenity=fuel`), que le jeu public des prix ne connaît pas toujours ; une station marquée `car_wash=yes` est aussi un lavage.
import {
  type CachedPlace,
  departmentCentroids,
  distanceKm,
  homeLabels,
  PRACTICAL_SAME_PLACE_M,
  withoutTwins,
} from "@orasso/shared";

import { env } from "../../env";
import { cachedSource, externalRequest, readBoundedJson } from "./cache";

export const WASH_TTL_MS = 7 * 24 * 3_600_000;
const WASH_MAX_STALE_MS = 30 * 24 * 3_600_000;

type OverpassElement = {
  type?: string;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
};

/**
 * Une entrée du cache `wash:<département>`. Sans `as` : un lavage (`amenity=car_wash`), la forme des anciennes lignes du cache.
 * `as: "fuel"` : une station-service sans lavage ; `as: "both"` : une station-service avec lavage (`car_wash=yes`).
 */
export type CachedOsmPlace = CachedPlace & { as?: "fuel" | "both" };

/** Lieux gardés par département (stations et lavages ensemble) : un département dense a plus de 800 stations et lavages. */
export const OSM_CACHE_LIMIT = 1500;

const clean = (s: string | undefined, max = 80) => (s ? s.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Adresse lisible à partir des étiquettes `addr:*` d'OpenStreetMap, ou `null`. */
function addressOf(tags: Record<string, string>): string | null {
  const street = [clean(tags["addr:housenumber"], 10), clean(tags["addr:street"])].filter(Boolean).join(" ");
  const city = [clean(tags["addr:postcode"], 10), clean(tags["addr:city"])].filter(Boolean).join(" ");
  const full = [street, city].filter(Boolean).join(", ");
  return full || null;
}

/**
 * Lit la réponse d'Overpass : retire les lieux désaffectés, privés ou sans position, trie par distance au centre du département
 * (`from`) et garde au plus `OSM_CACHE_LIMIT` lieux (exporté pour les tests). Lavages (`amenity=car_wash`) et stations-service
 * (`amenity=fuel`) ; une station avec `car_wash=yes` à moins de `PRACTICAL_SAME_PLACE_M` d'un lavage déjà cartographié n'est pas un
 * second lavage (`as: "fuel"`).
 */
export function parseOverpass(json: unknown, from: { lat: number; lng: number }): CachedOsmPlace[] {
  const elements = (json as { elements?: OverpassElement[] } | null)?.elements;
  if (!Array.isArray(elements)) return [];
  const places: (CachedOsmPlace & { km: number })[] = [];
  for (const e of elements) {
    const tags = e.tags ?? {};
    if (tags.amenity !== "car_wash" && tags.amenity !== "fuel") continue;
    if (tags.disused || tags.abandoned || tags.access === "private" || tags.access === "no") continue;
    const lat = e.lat ?? e.center?.lat;
    const lng = e.lon ?? e.center?.lon;
    if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const base = {
      address: addressOf(tags),
      lat: Math.round(lat * 1e5) / 1e5,
      lng: Math.round(lng * 1e5) / 1e5,
      km: distanceKm(from, { lat, lng }),
    };
    if (tags.amenity === "car_wash") {
      places.push({
        name: clean(tags.name) || clean(tags.brand) || clean(tags.operator) || homeLabels.washUnnamed,
        ...base,
      });
    } else {
      // Nom de la station : `name`, sinon la marque, sinon le libellé des stations sans nom.
      const as = tags.car_wash === "yes" ? "both" : "fuel";
      places.push({ name: clean(tags.name) || clean(tags.brand) || homeLabels.fuelUnnamed, ...base, as });
    }
  }
  const washes = places.filter((p) => p.as === undefined);
  const kept = places.map((p) => {
    if (p.as !== "both") return p;
    const twin = withoutTwins(washes, [p], PRACTICAL_SAME_PLACE_M).length === 0;
    return twin ? { ...p, as: "fuel" as const } : p;
  });
  return kept
    .sort((a, b) => a.km - b.km)
    .slice(0, OSM_CACHE_LIMIT)
    .map(({ km: _km, ...place }) => place);
}

/**
 * Requête Overpass QL : tout le département (zone ISO 3166-2), points et bâtiments `amenity=car_wash` et `amenity=fuel`, centre
 * inclus. Une seule requête pour les deux besoins : l'instance publique est déjà saturée.
 */
export function overpassQuery(department: string): string {
  const kinds = ["car_wash", "fuel"];
  const parts = kinds.flatMap((k) => [`node["amenity"="${k}"](area.a);`, `way["amenity"="${k}"](area.a);`]);
  return `[out:json][timeout:18];area["ISO3166-2"="FR-${department}"]->.a;(${parts.join("")});out center tags ${OSM_CACHE_LIMIT};`;
}

/**
 * Lot R8q : l'instance publique d'Overpass n'admet qu'un appel à la fois (sinon 429, puis blocage de l'adresse) : tous les appels de
 * l'API passent par cette file, quels que soient le département et l'appelant. Un appel qui échoue ne bloque pas les suivants.
 */
let overpassQueue: Promise<unknown> = Promise.resolve();
function oneAtATime<T>(task: () => Promise<T>): Promise<T> {
  const run = overpassQueue.then(task, task);
  overpassQueue = run.catch(() => undefined);
  return run;
}

/** Tests : une file bloquée par un appel qui ne répond jamais est vidée (en production, le délai de 20 s la libère). */
export function resetOverpassQueue(): void {
  overpassQueue = Promise.resolve();
}

/** Réponse en 200 qui annonce une erreur d'exécution (délai dépassé, mémoire) : la liste est incomplète, donc un échec. */
const isRuntimeError = (json: unknown) => {
  const remark = (json as { remark?: unknown } | null)?.remark;
  return typeof remark === "string" && /runtime error/i.test(remark);
};

/**
 * Lavages et stations-service d'OpenStreetMap pour tout un département (cache 7 jours, clé `wash:<département>`), `[]` si la
 * source ne répond pas. Une panne d'Overpass (502 « at capacity », 429, 504…) est un échec transitoire de `cachedSource` : l'ancien
 * cache est servi, aucune relance avant 10 minutes.
 */
export async function osmNear(department: string): Promise<CachedOsmPlace[]> {
  const centre = departmentCentroids[department];
  if (!centre) return [];
  const data = await cachedSource<CachedOsmPlace[]>({
    key: `wash:${department}`,
    ttlMs: WASH_TTL_MS,
    enabled: env.OVERPASS_URL !== "off",
    maxStaleMs: WASH_MAX_STALE_MS,
    load: () =>
      oneAtATime(async () => {
        const res = await externalRequest(env.OVERPASS_URL, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ data: overpassQuery(department) }),
        });
        const json = await readBoundedJson(res);
        // Réponse sans liste (service en surcharge, message d'erreur en 200) : un échec, pas une liste vide mise en cache.
        if (!Array.isArray((json as { elements?: unknown })?.elements) || isRuntimeError(json)) return null;
        return parseOverpass(json, centre);
      }),
  });
  return data ?? [];
}

/** Ces entrées du cache sont-elles un lavage ? (lavage seul, ou station avec lavage) */
export const isWash = (p: CachedOsmPlace) => p.as !== "fuel";
/** … ou une station-service ? */
export const isFuel = (p: CachedOsmPlace) => p.as === "fuel" || p.as === "both";

/** Stations de lavage de tout un département (cache 7 jours), `[]` si la source ne répond pas. */
export async function washNear(department: string): Promise<CachedPlace[]> {
  const list = await osmNear(department);
  return list.filter(isWash).map(({ as, name, ...place }) => ({
    ...place,
    name: as === "both" && name === homeLabels.fuelUnnamed ? homeLabels.washUnnamed : name,
  }));
}
