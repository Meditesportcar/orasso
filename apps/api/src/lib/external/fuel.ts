// Prix des carburants (lot 30, S35) : données ouvertes « prix des carburants en France, flux instantané » de
// data.economie.gouv.fr (licence ouverte, sans clé). Un appel par département et par heure au plus (cache
// `fuel:<département>`). Sans réseau ou désactivé : aucun résultat, jamais d'erreur.
// Tout le département est chargé (filtre `code_departement`, pagination de 100) : un filtre géographique autour du
// centre manquerait les stations des villes éloignées du centre (Perpignan est à 33 km de celui du 66). Vérifié le
// 17/10/2026 ; pas de nom de station dans le jeu : adresse et ville seulement.
import {
  type CachedFuelStation,
  departmentCentroids,
  type FuelPrices,
  homeLabels,
  PLACES_CACHE_LIMIT,
} from "@orasso/shared";

import { env } from "../../env";
import { cachedSource, externalRequest, readBoundedJson } from "./cache";

export const FUEL_TTL_MS = 3_600_000;
/** Des prix vieux d'un jour ne sont plus servis. */
const FUEL_MAX_STALE_MS = 24 * 3_600_000;

type FuelRecord = {
  adresse?: string | null;
  ville?: string | null;
  cp?: string | null;
  geom?: { lat?: number; lon?: number } | null;
  sp95_prix?: number | null;
  sp98_prix?: number | null;
  gazole_prix?: number | null;
  e85_prix?: number | null;
  sp95_maj?: string | null;
  sp98_maj?: string | null;
  gazole_maj?: string | null;
  e85_maj?: string | null;
};

/** Un prix plausible en €/L, sinon `null` (valeur absurde ou absente). */
const price = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= 0.3 && v <= 6 ? Math.round(v * 1000) / 1000 : null;

const clean = (s: string | null | undefined, max = 80) => (s ? s.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Lit la réponse du jeu de données (exporté pour les tests) : stations avec position et au moins un prix. */
export function parseFuel(json: unknown): CachedFuelStation[] {
  const results = (json as { results?: FuelRecord[] } | null)?.results;
  if (!Array.isArray(results)) return [];
  const out: CachedFuelStation[] = [];
  for (const r of results) {
    const lat = r.geom?.lat;
    const lng = r.geom?.lon;
    if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const prices: FuelPrices = {
      sp95: price(r.sp95_prix),
      sp98: price(r.sp98_prix),
      gazole: price(r.gazole_prix),
      e85: price(r.e85_prix),
    };
    if (Object.values(prices).every((p) => p === null)) continue;
    const updated = [r.sp95_maj, r.sp98_maj, r.gazole_maj, r.e85_maj]
      .filter((d): d is string => typeof d === "string" && !Number.isNaN(Date.parse(d)))
      .sort()
      .at(-1);
    const city = [clean(r.cp, 10), clean(r.ville)].filter(Boolean).join(" ");
    out.push({
      name: homeLabels.fuelUnnamed,
      address: [clean(r.adresse), city].filter(Boolean).join(", ") || null,
      lat: Math.round(lat * 1e5) / 1e5,
      lng: Math.round(lng * 1e5) / 1e5,
      prices,
      updatedAt: updated ? new Date(updated).toISOString() : null,
    });
  }
  return out.slice(0, PLACES_CACHE_LIMIT);
}

/** Stations par page (maximum de l'API) et nombre de pages au plus : tout un département, jamais une boucle sans fin. */
const PAGE = 100;
const MAX_PAGES = 8;

/** Adresse d'une page du département (exportée pour les tests) : filtre `code_departement`, rien d'autre. */
export function fuelUrl(base: string, department: string, offset = 0): string {
  const params = new URLSearchParams({
    where: `code_departement="${department}"`,
    select: "adresse,ville,cp,geom,sp95_prix,sp98_prix,gazole_prix,e85_prix,sp95_maj,sp98_maj,gazole_maj,e85_maj",
    order_by: "id",
    limit: String(PAGE),
    offset: String(offset),
  });
  return `${base}?${params}`;
}

/** Stations-service de tout un département (cache 1 heure), `[]` si la source ne répond pas. */
export async function fuelNear(department: string): Promise<CachedFuelStation[]> {
  if (!departmentCentroids[department]) return [];
  const data = await cachedSource<CachedFuelStation[]>({
    key: `fuel:${department}`,
    ttlMs: FUEL_TTL_MS,
    enabled: env.FUEL_API_URL !== "off",
    maxStaleMs: FUEL_MAX_STALE_MS,
    load: async () => {
      const all: unknown[] = [];
      for (let page = 0; page < MAX_PAGES; page++) {
        const res = await externalRequest(fuelUrl(env.FUEL_API_URL, department, page * PAGE));
        const json = await readBoundedJson(res);
        const results = (json as { results?: unknown })?.results;
        if (!Array.isArray(results)) return null;
        all.push(...results);
        if (results.length < PAGE) break;
      }
      return parseFuel({ results: all });
    },
  });
  return data ?? [];
}
