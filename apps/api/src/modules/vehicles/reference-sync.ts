// Arrivée du référentiel des véhicules dans une base (lot R3c) : ajoute les marques, modèles et générations de
// `vehicleCatalog` qui manquent, et la ligne « Autre » à chaque niveau. Idempotente : relancée, elle n'ajoute rien.
// Ne renomme, ne modifie ni ne supprime rien, sauf le marquage « tout-terrain » d'un modèle à son arrivée (règle du lot
// M1, tour 2).
// Tour 2 : chaque clé du fichier arrivée une fois est notée dans `vehicle_reference_seen` ; une clé vue n'est plus
// jamais réinsérée, si bien qu'une ligne supprimée ou renommée dans l'admin ne revient pas. Les noms sont comparés
// sans accents, casse ni espaces en trop (« Phase 1 » = « phase  1 »). Toute la synchronisation tient dans une
// transaction, sous un verrou consultatif : deux démarrages simultanés ne se croisent pas, un échec ne laisse rien.
// Lancée au démarrage de l'API (deploy/api-start.sh, `pnpm --filter @orasso/api db:reference`) et par le seed.

import { searchFold } from "@orasso/shared";
import { sql } from "drizzle-orm";

import { db } from "../../db/client";
import { vehicleGenerations, vehicleMakes, vehicleModels, vehicleReferenceSeen } from "../../db/schema";
import { vehicleCatalog } from "../../db/seed/vehicle-catalog";
import type { RefMake } from "../../db/seed/vehicle-reference";
import { slugify } from "../../lib/slug";
import type { Tx } from "../../lib/tx";

const OTHER = "Autre";
const CHUNK = 500;

export type ReferenceSyncResult = {
  makes: number;
  models: number;
  generations: number;
  offroad: number;
  /** Ce qui a été (ou serait, en passe à blanc) ajouté, lisible : « Peugeot 207 Phase 1 ». */
  added: string[];
  dryRun: boolean;
};

/** Nom de génération comparable : sans accents ni casse, espaces réduits. */
export const generationKey = (name: string) => searchFold(name).trim().replace(/\s+/g, " ");

/** Clés du référentiel : « peugeot », « peugeot|207 », « peugeot|207|phase 1 ». */
export const referenceKeys = (catalog: readonly RefMake[]) =>
  catalog.flatMap((make) => {
    const mk = slugify(make.name);
    return [
      mk,
      ...make.models.flatMap((model) => {
        const md = `${mk}|${slugify(model.name)}`;
        return [md, ...model.generations.map((g) => `${md}|${generationKey(g.name)}`)];
      }),
    ];
  });

class DryRun extends Error {}

async function insertChunks<T>(rows: T[], insert: (chunk: T[]) => Promise<unknown[]>): Promise<number> {
  let count = 0;
  for (let i = 0; i < rows.length; i += CHUNK) count += (await insert(rows.slice(i, i + CHUNK))).length;
  return count;
}

async function run(tx: Tx, catalog: readonly RefMake[]): Promise<Omit<ReferenceSyncResult, "dryRun">> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('vehicle-reference-sync', 0))`);
  const seen = new Set(
    (await tx.select({ key: vehicleReferenceSeen.key }).from(vehicleReferenceSeen)).map((r) => r.key),
  );
  const added: string[] = [];
  const makeName = new Map(catalog.map((m) => [slugify(m.name), m.name]));

  // 1. Marques (par slug). « Autre » est toujours assurée.
  const loadMakes = async () =>
    new Map(
      (await tx.select({ id: vehicleMakes.id, slug: vehicleMakes.slug }).from(vehicleMakes)).map((m) => [m.slug, m.id]),
    );
  let makeIds = await loadMakes();
  const newMakes = [...catalog, { name: OTHER, country: "", models: [] }]
    .filter((m) => {
      const slug = slugify(m.name);
      return !makeIds.has(slug) && (m.name === OTHER || !seen.has(slug));
    })
    .map((m) => ({ name: m.name, slug: slugify(m.name), country: m.country || null, isOther: m.name === OTHER }));
  const makes = await insertChunks(newMakes, (chunk) =>
    tx.insert(vehicleMakes).values(chunk).onConflictDoNothing().returning({ id: vehicleMakes.id }),
  );
  for (const m of newMakes) if (m.name !== OTHER) added.push(m.name);
  makeIds = await loadMakes(); // relu après les conflits

  // 2. Modèles (par marque et slug), « Autre » compris pour toutes les marques de la base.
  const modelKey = (makeId: string, slug: string) => `${makeId}|${slug}`;
  const loadModels = async () =>
    new Map(
      (
        await tx
          .select({ id: vehicleModels.id, makeId: vehicleModels.makeId, slug: vehicleModels.slug })
          .from(vehicleModels)
      ).map((m) => [modelKey(m.makeId, m.slug), m.id]),
    );
  let modelIds = await loadModels();
  const wanted = new Map<string, typeof vehicleModels.$inferInsert>();
  const newOffroad: { makeId: string; slug: string }[] = [];
  for (const make of catalog) {
    const mk = slugify(make.name);
    const makeId = makeIds.get(mk);
    if (!makeId) continue; // marque supprimée ou renommée dans l'admin
    for (const model of make.models) {
      const slug = slugify(model.name);
      const key = modelKey(makeId, slug);
      if (seen.has(`${mk}|${slug}`)) continue;
      if (model.offroad) newOffroad.push({ makeId, slug });
      if (modelIds.has(key) || wanted.has(key)) continue;
      wanted.set(key, { makeId, name: model.name, slug, vehicleType: model.type, offroad: Boolean(model.offroad) });
      added.push(`${make.name} ${model.name}`);
    }
  }
  for (const makeId of new Set(makeIds.values())) {
    const key = modelKey(makeId, "autre");
    if (!modelIds.has(key)) wanted.set(key, { makeId, name: OTHER, slug: "autre", vehicleType: "car", isOther: true });
  }
  const models = await insertChunks([...wanted.values()], (chunk) =>
    tx.insert(vehicleModels).values(chunk).onConflictDoNothing().returning({ id: vehicleModels.id }),
  );
  modelIds = await loadModels();

  // 3. Générations (par modèle et nom normalisé), « Autre » compris pour tous les modèles de la base.
  const genKeys = new Set(
    (
      await tx.select({ modelId: vehicleGenerations.modelId, name: vehicleGenerations.name }).from(vehicleGenerations)
    ).map((g) => `${g.modelId}|${generationKey(g.name)}`),
  );
  const gens: (typeof vehicleGenerations.$inferInsert)[] = [];
  const addGen = (row: typeof vehicleGenerations.$inferInsert, label?: string) => {
    const key = `${row.modelId}|${generationKey(row.name)}`;
    if (genKeys.has(key)) return;
    genKeys.add(key);
    gens.push(row);
    if (label) added.push(label);
  };
  for (const make of catalog) {
    const mk = slugify(make.name);
    const makeId = makeIds.get(mk);
    if (!makeId) continue;
    for (const model of make.models) {
      const md = `${mk}|${slugify(model.name)}`;
      const modelId = modelIds.get(modelKey(makeId, slugify(model.name)));
      if (!modelId) continue; // modèle supprimé ou renommé dans l'admin
      for (const g of model.generations) {
        if (seen.has(`${md}|${generationKey(g.name)}`)) continue;
        addGen(
          { modelId, name: g.name, yearFrom: g.yearFrom, yearTo: g.yearTo },
          `${makeName.get(mk) ?? make.name} ${model.name} ${g.name}`,
        );
      }
    }
  }
  for (const modelId of new Set(modelIds.values())) addGen({ modelId, name: OTHER, isOther: true });
  const generations = await insertChunks(gens, (chunk) =>
    tx.insert(vehicleGenerations).values(chunk).onConflictDoNothing().returning({ id: vehicleGenerations.id }),
  );

  // 4. Tout-terrain (lot M1, tour 2) : un modèle listé `offroad` qui arrive (ou qui était déjà là sans être vu).
  let offroad = 0;
  for (const { makeId, slug } of newOffroad) {
    const updated = await tx
      .update(vehicleModels)
      .set({ offroad: true })
      .where(
        sql`${vehicleModels.makeId} = ${makeId} and ${vehicleModels.slug} = ${slug} and ${vehicleModels.offroad} = false`,
      )
      .returning({ id: vehicleModels.id });
    offroad += updated.length;
  }

  // 5. Toutes les clés du fichier sont désormais vues, y compris celles déjà en base au premier passage.
  const keys = [...new Set(referenceKeys(catalog))].filter((k) => !seen.has(k)).map((key) => ({ key }));
  await insertChunks(keys, (chunk) =>
    tx.insert(vehicleReferenceSeen).values(chunk).onConflictDoNothing().returning({ key: vehicleReferenceSeen.key }),
  );

  return { makes, models, generations, offroad, added };
}

/**
 * Synchronise le référentiel. `dryRun` : tout est calculé dans la transaction, puis annulé ; rien n'est écrit, le
 * résultat dit ce qui serait ajouté.
 */
export async function syncVehicleReference(
  options: { catalog?: readonly RefMake[]; dryRun?: boolean } = {},
): Promise<ReferenceSyncResult> {
  const catalog = options.catalog ?? vehicleCatalog;
  let result: Omit<ReferenceSyncResult, "dryRun"> | null = null;
  try {
    await db.transaction(async (tx) => {
      result = await run(tx, catalog);
      if (options.dryRun) throw new DryRun();
    });
  } catch (error) {
    if (!(error instanceof DryRun)) throw error;
  }
  if (!result) throw new Error("Synchronisation du référentiel sans résultat");
  return { ...(result as Omit<ReferenceSyncResult, "dryRun">), dryRun: Boolean(options.dryRun) };
}
