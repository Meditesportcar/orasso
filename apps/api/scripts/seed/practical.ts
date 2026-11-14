// Lot R8q : « Pratique ». Le cache des deux sources de lieux (lavage : Overpass ; stations-service : jeu public des prix des
// carburants) rempli de lieux plausibles autour de Perpignan, de Canet-en-Roussillon et du Barcarès : aucun appel réel, ni en
// seed ni en recette. Rejouable : les deux entrées sont remplacées à chaque passage (après `seedHome`, qui pose les siennes
// la première fois). Les stations n'ont pas de nom dans le jeu public : l'adresse seule, comme la vraie source.
// Le compte sans département de la recette est celui de `seedMyWeather` (« Pilote_026 »).
import { sql } from "drizzle-orm";
import { db } from "../../src/db/client";
import * as t from "../../src/db/schema";
import { env } from "../../src/env";
import { now } from "./helpers";
import { homeSeedFuel, homeSeedWash } from "./home";
import { dropSeedRows, type SourceUrls, seedableSources } from "./practical-cache";

type Wash = { name: string; address: string | null; lat: number; lng: number };
type Station = Wash & {
  prices: { sp95: number | null; sp98: number | null; gazole: number | null; e85: number | null };
  updatedAt: string | null;
};

export const practicalSeedWash: Wash[] = [
  { name: "Lavage Tech'Auto", address: "Avenue du Languedoc, 66000 Perpignan", lat: 42.7092, lng: 2.8827 },
  { name: "Wash 66", address: "Route de Thuir, 66000 Perpignan", lat: 42.7228, lng: 2.9264 },
  { name: "Lavage du Moulin", address: "Chemin du Moulin à Vent, 66000 Perpignan", lat: 42.6871, lng: 2.8739 },
  { name: "Lavage du Port", address: "Quai Nord, 66140 Canet-en-Roussillon", lat: 42.6956, lng: 3.0368 },
  { name: "Canet Clean", address: "Avenue de la Méditerranée, 66140 Canet-en-Roussillon", lat: 42.7103, lng: 3.0229 },
  {
    name: "Station de lavage du Barcarès",
    address: "Avenue Gérard Philipe, 66420 Le Barcarès",
    lat: 42.7791,
    lng: 3.0316,
  },
  { name: "Lavage Argelès Express", address: "Route de Collioure, 66700 Argelès-sur-Mer", lat: 42.5463, lng: 3.0252 },
];

// `name` : le nom générique de la source ; l'adresse est tout ce qui identifie une station.
const station = (address: string, lat: number, lng: number): Station => ({
  name: "Station-service",
  address,
  lat,
  lng,
  prices: { sp95: 1.859, sp98: 1.949, gazole: 1.789, e85: 0.799 },
  updatedAt: now.toISOString(),
});
export const practicalSeedFuel: Station[] = [
  station("Rue du Vernet, 66000 Perpignan", 42.7132, 2.8791),
  station("Avenue du Général Leclerc, 66000 Perpignan", 42.6963, 2.9049),
  station("Route de Canet, 66000 Perpignan", 42.7059, 2.9313),
  station("Avenue de Prades, 66000 Perpignan", 42.6996, 2.8872),
  station("Rue du Moulin à Vent, 66000 Perpignan", 42.6824, 2.8695),
  station("Avenue de la Plage, 66140 Canet-en-Roussillon", 42.6931, 3.0334),
  station("Rue du Port, 66140 Canet-en-Roussillon", 42.6982, 3.0391),
  station("Route de Perpignan, 66140 Canet-en-Roussillon", 42.7116, 3.0147),
  station("Avenue des Voiles, 66420 Le Barcarès", 42.7822, 3.0381),
  station("Route de Saint-Laurent, 66420 Le Barcarès", 42.7767, 3.0204),
  station("Rue de Saint-Estève, 66240 Saint-Estève", 42.7143, 2.8372),
];

/**
 * Pose les deux listes de lieux inventés, SEULEMENT pour une source remplacée par un faux service ou coupée (recettes, démonstration
 * sans réseau). Avec les vraies sources, elle n'écrit rien et retire les lignes qu'elle a elle-même posées autrefois, pourvu que leur
 * contenu soit exactement le sien : sinon Orasso ne lirait jamais les vraies sources (la date fraîche du seed gardait le faux cache).
 * Rejouable : les entrées sont remplacées à chaque passage.
 */
export async function seedPractical(sources: SourceUrls = env) {
  const seedable = seedableSources(sources);
  const caches: Record<string, unknown> = {};
  if (seedable.osm) caches["osm:66"] = practicalSeedWash;
  if (seedable.fuel) caches["fuel2:66"] = practicalSeedFuel;
  for (const [key, data] of Object.entries(caches)) {
    await db
      .insert(t.externalCache)
      .values({ key, fetchedAt: now, data })
      .onConflictDoUpdate({ target: t.externalCache.key, set: { fetchedAt: now, data: sql`excluded.data` } });
  }
  const dropped = [
    ...(seedable.osm ? [] : await dropSeedRows(["osm:66", "wash:66"], [practicalSeedWash, homeSeedWash])),
    ...(seedable.fuel ? [] : await dropSeedRows(["fuel2:66", "fuel:66"], [practicalSeedFuel, homeSeedFuel])),
  ];
  console.log(
    `Pratique : ${Object.keys(caches).length ? `${practicalSeedWash.length} lavages et ${practicalSeedFuel.length} stations-service factices posés pour les sources remplacées ou coupées` : "sources réelles : aucun lieu inventé posé"}${dropped.length ? `, lignes de cache inventées retirées : ${dropped.join(", ")}` : ""}.`,
  );
}
