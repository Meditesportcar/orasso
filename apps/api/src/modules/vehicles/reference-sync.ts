// Arrivée du référentiel des véhicules dans une base (lot R3c) : ajoute les marques, modèles et générations de
// `vehicleCatalog` qui manquent, et la ligne « Autre » à chaque niveau. Idempotente : relancée, elle n'ajoute rien.
// Ne renomme, ne modifie ni ne supprime rien (les ajouts et corrections de l'équipe dans l'admin restent), sauf le
// marquage « tout-terrain » des modèles listés `offroad` (règle du lot M1, tour 2).
// Lancée au démarrage de l'API (deploy/api-start.sh, `pnpm --filter @orasso/api db:reference`) et par le seed.

import { and, eq, inArray } from "drizzle-orm";

import { db } from "../../db/client";
import { vehicleGenerations, vehicleMakes, vehicleModels } from "../../db/schema";
import { vehicleCatalog } from "../../db/seed/vehicle-catalog";
import type { RefMake } from "../../db/seed/vehicle-reference";
import { slugify } from "../../lib/slug";
import type { Executor } from "../../lib/tx";

const OTHER = "Autre";
const CHUNK = 500;

export type ReferenceSyncResult = { makes: number; models: number; generations: number; offroad: number };

async function insertChunks<T>(rows: T[], insert: (chunk: T[]) => Promise<unknown[]>): Promise<number> {
  let count = 0;
  for (let i = 0; i < rows.length; i += CHUNK) count += (await insert(rows.slice(i, i + CHUNK))).length;
  return count;
}

export async function syncVehicleReference(
  ex: Executor = db,
  catalog: readonly RefMake[] = vehicleCatalog,
): Promise<ReferenceSyncResult> {
  const all: RefMake[] = [...catalog, { name: OTHER, country: "", models: [] }];

  // 1. Marques (par slug, unique).
  const makeRows = await ex.select({ id: vehicleMakes.id, slug: vehicleMakes.slug }).from(vehicleMakes);
  const makeIds = new Map(makeRows.map((m) => [m.slug, m.id]));
  const newMakes = all
    .filter((m) => !makeIds.has(slugify(m.name)))
    .map((m) => ({ name: m.name, slug: slugify(m.name), country: m.country || null, isOther: m.name === OTHER }));
  const makes = await insertChunks(newMakes, (chunk) =>
    ex.insert(vehicleMakes).values(chunk).onConflictDoNothing().returning({ id: vehicleMakes.id }),
  );
  if (makes) {
    for (const m of await ex.select({ id: vehicleMakes.id, slug: vehicleMakes.slug }).from(vehicleMakes)) {
      makeIds.set(m.slug, m.id);
    }
  }

  // 2. Modèles (par marque et slug), « Autre » compris, pour toutes les marques de la base.
  const modelRows = await ex
    .select({ id: vehicleModels.id, makeId: vehicleModels.makeId, slug: vehicleModels.slug })
    .from(vehicleModels);
  const modelKey = (makeId: string, slug: string) => `${makeId}|${slug}`;
  const modelIds = new Map(modelRows.map((m) => [modelKey(m.makeId, m.slug), m.id]));
  const wanted = new Map<string, typeof vehicleModels.$inferInsert>();
  for (const make of all) {
    const makeId = makeIds.get(slugify(make.name));
    if (!makeId) continue;
    for (const model of make.models) {
      const slug = slugify(model.name);
      const key = modelKey(makeId, slug);
      if (modelIds.has(key) || wanted.has(key)) continue;
      wanted.set(key, { makeId, name: model.name, slug, vehicleType: model.type, offroad: Boolean(model.offroad) });
    }
  }
  for (const makeId of new Set(makeIds.values())) {
    const key = modelKey(makeId, "autre");
    if (!modelIds.has(key)) {
      wanted.set(key, { makeId, name: OTHER, slug: "autre", vehicleType: "car", isOther: true });
    }
  }
  const models = await insertChunks([...wanted.values()], (chunk) =>
    ex.insert(vehicleModels).values(chunk).onConflictDoNothing().returning({ id: vehicleModels.id }),
  );
  if (models) {
    for (const m of await ex
      .select({ id: vehicleModels.id, makeId: vehicleModels.makeId, slug: vehicleModels.slug })
      .from(vehicleModels)) {
      modelIds.set(modelKey(m.makeId, m.slug), m.id);
    }
  }

  // 3. Générations (par modèle et nom exact), « Autre » compris, pour tous les modèles de la base.
  const genRows = await ex
    .select({ modelId: vehicleGenerations.modelId, name: vehicleGenerations.name })
    .from(vehicleGenerations);
  const genKeys = new Set(genRows.map((g) => `${g.modelId}|${g.name}`));
  const gens: (typeof vehicleGenerations.$inferInsert)[] = [];
  const addGen = (row: typeof vehicleGenerations.$inferInsert) => {
    const key = `${row.modelId}|${row.name}`;
    if (genKeys.has(key)) return;
    genKeys.add(key);
    gens.push(row);
  };
  for (const make of all) {
    const makeId = makeIds.get(slugify(make.name));
    if (!makeId) continue;
    for (const model of make.models) {
      const modelId = modelIds.get(modelKey(makeId, slugify(model.name)));
      if (!modelId) continue;
      for (const g of model.generations) addGen({ modelId, name: g.name, yearFrom: g.yearFrom, yearTo: g.yearTo });
    }
  }
  for (const modelId of new Set(modelIds.values())) addGen({ modelId, name: OTHER, isOther: true });
  const generations = await insertChunks(gens, (chunk) =>
    ex.insert(vehicleGenerations).values(chunk).onConflictDoNothing().returning({ id: vehicleGenerations.id }),
  );

  // 4. Tout-terrain (lot M1, tour 2) : les modèles listés `offroad` déjà en base sont marqués.
  let offroad = 0;
  for (const make of catalog) {
    const makeId = makeIds.get(slugify(make.name));
    const slugs = make.models.filter((m) => m.offroad).map((m) => slugify(m.name));
    if (!makeId || !slugs.length) continue;
    const updated = await ex
      .update(vehicleModels)
      .set({ offroad: true })
      .where(
        and(eq(vehicleModels.makeId, makeId), inArray(vehicleModels.slug, slugs), eq(vehicleModels.offroad, false)),
      )
      .returning({ id: vehicleModels.id });
    offroad += updated.length;
  }

  return { makes, models, generations, offroad };
}
