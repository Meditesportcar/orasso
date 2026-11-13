// Petit lot de fin, partie D2 : le cache de « Pratique » (et de l'Accueil) ne reçoit des lieux inventés que pour une source
// remplacée par un faux service ou coupée. Règles pures (testées) et retrait des lignes que le seed a posées autrefois.
import { eq } from "drizzle-orm";
import { db } from "../../src/db/client";
import * as t from "../../src/db/schema";
import { DEFAULT_FUEL_API_URL, DEFAULT_OVERPASS_URL } from "../../src/env";

export type SourceUrls = { OVERPASS_URL: string; FUEL_API_URL: string };

/** Une source est « vraie » si son adresse est celle par défaut (ni remplacée, ni coupée par `off`). */
export const isRealSource = (url: string, real: string) => url.trim() === real;

/**
 * Quelles listes inventées le seed peut poser : `osm` (lavages et stations d'OpenStreetMap, source Overpass) et `fuel` (jeu public des
 * prix), chacune seulement si sa source est un faux service ou coupée. Avec les deux vraies : rien.
 */
export function seedableSources(env: SourceUrls): { osm: boolean; fuel: boolean } {
  return {
    osm: !isRealSource(env.OVERPASS_URL, DEFAULT_OVERPASS_URL),
    fuel: !isRealSource(env.FUEL_API_URL, DEFAULT_FUEL_API_URL),
  };
}

type PlaceLike = { name?: unknown; address?: unknown; lat?: unknown; lng?: unknown };
const signature = (list: readonly PlaceLike[]) =>
  JSON.stringify(
    list
      .map((p) => [p.name ?? null, p.address ?? null, p.lat ?? null, p.lng ?? null])
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  );

/**
 * Le contenu d'une ligne de cache est-il EXACTEMENT l'une des listes inventées du seed ? (comparaison des lieux : nom, adresse, position ;
 * prix et dates ne comptent pas). Une ligne remplie par une vraie source, même proche, n'est jamais reconnue.
 */
export function isSeedContent(data: unknown, seedLists: readonly (readonly PlaceLike[])[]): boolean {
  if (!Array.isArray(data)) return false;
  const mine = signature(data as PlaceLike[]);
  return seedLists.some((list) => signature(list) === mine);
}

/** Retire les lignes de `keys` dont le contenu est exactement une liste du seed ; renvoie les clés retirées. */
export async function dropSeedRows(
  keys: readonly string[],
  seedLists: readonly (readonly PlaceLike[])[],
): Promise<string[]> {
  const dropped: string[] = [];
  for (const key of keys) {
    const row = await db.query.externalCache.findFirst({ where: eq(t.externalCache.key, key) });
    if (row && isSeedContent(row.data, seedLists)) {
      await db.delete(t.externalCache).where(eq(t.externalCache.key, key));
      dropped.push(key);
    }
  }
  return dropped;
}
