// Lot R8q : « Pratique ». Le cache des deux sources de lieux (lavage : Overpass ; stations-service : jeu public des prix des
// carburants) rempli de lieux plausibles autour de Perpignan, de Canet-en-Roussillon et du Barcarès : aucun appel réel, ni en
// seed ni en recette. Rejouable : les deux entrées sont remplacées à chaque passage (après `seedHome`, qui pose les siennes
// la première fois). Les stations n'ont pas de nom dans le jeu public : l'adresse seule, comme la vraie source.
// Le compte sans département de la recette est celui de `seedMyWeather` (« Pilote_026 »).
import { sql } from "drizzle-orm";
import { db } from "../../src/db/client";
import * as t from "../../src/db/schema";
import { now } from "./helpers";

type Wash = { name: string; address: string | null; lat: number; lng: number };
type Station = Wash & {
  prices: { sp95: number | null; sp98: number | null; gazole: number | null; e85: number | null };
  updatedAt: string | null;
};

const wash: Wash[] = [
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
const fuel: Station[] = [
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

/** Pose les deux listes (remplace celles qui existent : le seed se rejoue sans doublon). */
export async function seedPractical() {
  const caches: Record<string, unknown> = { "osm:66": wash, "fuel:66": fuel };
  for (const [key, data] of Object.entries(caches)) {
    await db
      .insert(t.externalCache)
      .values({ key, fetchedAt: now, data })
      .onConflictDoUpdate({ target: t.externalCache.key, set: { fetchedAt: now, data: sql`excluded.data` } });
  }
  console.log(
    `Pratique : ${wash.length} lavages et ${fuel.length} stations-service factices dans le cache (66), aucun appel réel.`,
  );
}
