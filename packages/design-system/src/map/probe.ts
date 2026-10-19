// Repli de la carte (lot 44, relecture) : avant de choisir le style, on demande le TileJSON des tuiles vectorielles
// (délai 3 s). Réponse lisible → style Orasso ; échec ou délai dépassé → tuiles raster OpenStreetMap. Le résultat est
// gardé pour la session (une seule demande par adresse). Sur le web, une erreur de la source en cours de route ne fait
// basculer que si elle ne vient pas d'une tuile isolée (`shouldFallBack`). Fonctions pures, testées.
import type { StyleSpecification } from "@maplibre/maplibre-gl-style-spec";

import type { ThemeId } from "../tokens";
import { type MapStyleOptions, mapFallbackRaster, mapStyle, OPENFREEMAP_URL } from "./style";

/** Délai de la demande du TileJSON. */
export const PROBE_TIMEOUT_MS = 3000;
/** Échecs de tuiles d'affilée (sans tuile réussie entre deux) qui font basculer sur le raster. */
export const TILE_FAILURES_FOR_FALLBACK = 5;

type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal },
) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

const results = new Map<string, Promise<boolean>>();

/** Résultat déjà connu pour cette adresse (`undefined` : pas encore demandé ou en cours). */
const known = new Map<string, boolean>();

/** Le TileJSON répond-il, avec des tuiles, en moins de `timeoutMs` ? Gardé pour la session. */
export function probeVectorTiles(
  url: string | null | undefined,
  fetchImpl: FetchLike = globalThis.fetch as unknown as FetchLike,
  timeoutMs = PROBE_TIMEOUT_MS,
): Promise<boolean> {
  const target = url || OPENFREEMAP_URL;
  const cached = results.get(target);
  if (cached) return cached;
  const run = (async () => {
    const controller = typeof AbortController === "undefined" ? null : new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<null>((resolve) => {
        timer = setTimeout(() => {
          controller?.abort();
          resolve(null);
        }, timeoutMs);
      });
      const res = await Promise.race([fetchImpl(target, { signal: controller?.signal }), timeout]);
      if (!res?.ok) return false;
      const body = (await Promise.race([res.json(), timeout])) as { tiles?: unknown } | null;
      return Array.isArray(body?.tiles) && body.tiles.length > 0;
    } catch {
      return false;
    } finally {
      if (timer) clearTimeout(timer);
    }
  })();
  results.set(target, run);
  void run.then((ok) => known.set(target, ok));
  return run;
}

/** Résultat déjà connu (synchrone), pour choisir le style sans attendre au deuxième affichage. */
export const probedVectorTiles = (url: string | null | undefined): boolean | undefined =>
  known.get(url || OPENFREEMAP_URL);

/** Oublie les résultats (tests). */
export function resetMapProbe(): void {
  results.clear();
  known.clear();
}

/** Le style à donner à la carte selon le résultat de la demande du TileJSON. */
export function chooseMapStyle(theme: ThemeId, options: MapStyleOptions, vectorOk: boolean): StyleSpecification {
  return vectorOk ? mapStyle(theme, options) : mapFallbackRaster(theme);
}

/**
 * Faut-il basculer sur le raster après cette erreur de la source vectorielle ? Oui si elle ne vient pas d'une tuile
 * (TileJSON, source), ou après `TILE_FAILURES_FOR_FALLBACK` tuiles en échec d'affilée ; une tuile isolée ne compte pas.
 */
export function shouldFallBack(error: { tile?: unknown }, consecutiveTileFailures: number): boolean {
  if (!error.tile) return true;
  return consecutiveTileFailures >= TILE_FAILURES_FOR_FALLBACK;
}
