// Stations de lavage (lot 30, S35) : Overpass / OpenStreetMap (`amenity=car_wash`), données © contributeurs OSM (ODbL,
// attribution affichée dans le widget). Un appel par département et par semaine au plus : l'instance publique est un service
// bénévole à usage raisonnable (AS2). Sans réseau ou désactivé : aucun résultat.
// Petit lot de fin D : la même requête ramène aussi les stations-service d'OpenStreetMap (`amenity=fuel`), que le jeu public des prix
// ne connaît pas toujours ; une station marquée `car_wash=yes` est aussi un lavage. Cache `osm:<département>` (la forme a changé : l'ancienne
// clé `wash:<département>`, lavages seulement, n'est lue qu'en secours, en lecture seule, par le service de « Pratique »).
import { type CachedPlace, departmentCentroids, distanceKm, homeLabels } from "@orasso/shared";

import { env } from "../../env";
import { cachedSourceState, externalRequest, readBoundedJson, type SourceState } from "./cache";
import { groupOsmStations, isOsmFuel, type OsmEntry, washPlaces } from "./places";

export const WASH_TTL_MS = 7 * 24 * 3_600_000;
export const WASH_MAX_STALE_MS = 30 * 24 * 3_600_000;
/**
 * Overpass met parfois près de 40 s à répondre à une requête de département (mesuré le 13/11) : le délai de 20 s des autres sources
 * abandonnait avant la fin, le cache ne se remplissait jamais. Le chargement de fond attend jusqu'à 60 s ; la personne, elle, n'attend
 * jamais plus que son budget (`withinBudget`) : elle reçoit le cache ou une réponse partielle.
 */
export const OVERPASS_TIMEOUT_MS = 60_000;
/** Recul après des échecs de suite (instance saturée) : 10 minutes, puis 30 minutes, puis 1 heure. */
export const OVERPASS_RETRY_AFTER_MS = [10 * 60_000, 30 * 60_000, 60 * 60_000] as const;

type OverpassElement = {
  type?: string;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
};

/** Une entrée du cache `osm:<département>` (voir `places.ts`). */
export type CachedOsmPlace = OsmEntry;

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
 * (`amenity=fuel`, avec `ref:FR:prix-carburants` quand OpenStreetMap la donne). Aucun rapprochement ici : il se fait sur les listes
 * de tous les départements réunis (`places.ts`).
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
      const ref = clean(tags["ref:FR:prix-carburants"], 40);
      places.push({
        name: clean(tags.name) || clean(tags.brand) || homeLabels.fuelUnnamed,
        ...base,
        as,
        ...(ref ? { ref } : {}),
      });
    }
  }
  return places
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

/** Tests : une file bloquée par un appel qui ne répond jamais est vidée (en production, le délai de 60 s la libère). */
export function resetOverpassQueue(): void {
  overpassQueue = Promise.resolve();
}

/** Réponse en 200 qui annonce une erreur d'exécution (délai dépassé, mémoire) : la liste est incomplète, donc un échec. */
const isRuntimeError = (json: unknown) => {
  const remark = (json as { remark?: unknown } | null)?.remark;
  return typeof remark === "string" && /runtime error/i.test(remark);
};

/**
 * Lavages et stations-service d'OpenStreetMap pour tout un département (cache 7 jours, clé `osm:<département>`), avec la fraîcheur.
 * `data` nul : rien de servable (source muette). Une panne d'Overpass (502 « at capacity », 429, 504…) est un échec transitoire : l'ancien
 * cache est servi (`fresh` faux), aucune relance avant 10 minutes, puis 30, puis 1 heure si les échecs se répètent.
 */
export async function osmState(department: string): Promise<SourceState<CachedOsmPlace[]>> {
  const centre = departmentCentroids[department];
  if (!centre) return { data: [], fresh: true };
  return cachedSourceState<CachedOsmPlace[]>({
    key: `osm:${department}`,
    ttlMs: WASH_TTL_MS,
    enabled: env.OVERPASS_URL !== "off",
    maxStaleMs: WASH_MAX_STALE_MS,
    retryAfterMs: OVERPASS_RETRY_AFTER_MS,
    load: () =>
      oneAtATime(async () => {
        const res = await externalRequest(
          env.OVERPASS_URL,
          {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ data: overpassQuery(department) }),
          },
          OVERPASS_TIMEOUT_MS,
        );
        const json = await readBoundedJson(res);
        // Réponse sans liste (service en surcharge, message d'erreur en 200) : un échec, pas une liste vide mise en cache.
        if (!Array.isArray((json as { elements?: unknown })?.elements) || isRuntimeError(json)) return null;
        return parseOverpass(json, centre);
      }),
  });
}

/** Lavages et stations d'OpenStreetMap d'un département, `[]` si la source ne répond pas. */
export async function osmNear(department: string): Promise<CachedOsmPlace[]> {
  return (await osmState(department)).data ?? [];
}

/** Stations de lavage de tout un département (cache 7 jours), `[]` si la source ne répond pas. Sert l'Accueil (blocs éteints). */
export async function washNear(department: string): Promise<CachedPlace[]> {
  const list = await osmNear(department);
  return washPlaces(list, groupOsmStations(list.filter(isOsmFuel)));
}
