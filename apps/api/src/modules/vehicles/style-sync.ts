// Arrivée du catalogue de départ des styles (lot R5a) : chaque style de `styleCatalog` est adopté une seule fois. Au
// premier passage sur une base (aucun slug encore vu), un style absent est ajouté et un style existant (catégories
// d'avant le lot) est mis à jour : famille, icône, libellés, types, ordre, pause (« Origine » devient « D'origine »,
// « Moto » et « Utilitaire » passent en pause). Ensuite, un slug nouveau du catalogue est ajouté s'il manque ; s'il
// existe déjà (créé entre-temps par l'admin, ou de même nom), il est seulement noté comme vu : il n'est jamais réécrit
// ni réactivé (tour 2). Un slug vu n'est plus jamais réinséré ni réécrit (`category_catalog_seen`), si bien qu'un style
// renommé, déplacé ou mis en pause par l'admin le reste. Même idée que `vehicle_reference_seen` (lot R3c).
// Tour 2 : la liste blanche des marques (Supercar) est posée avec le style et complétée à chaque passage par les marques
// de la liste arrivées depuis, sans dépendre du seed. Une transaction, sous un verrou consultatif.
// Lancée au démarrage de l'API (`scripts/reference-sync.ts`, après le référentiel) et par le seed.
import { styleKey } from "@orasso/shared";
import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { categories, categoryCatalogSeen, categoryMakes, vehicleMakes } from "../../db/schema";
import { type CatalogStyle, styleCatalog } from "../../db/seed/style-catalog";
import type { Tx } from "../../lib/tx";

export type StyleSyncResult = { inserted: number; adopted: number };

/** Les marques de la liste blanche d'un style, retrouvées par leur nom (sans casse) ; celles qui manquent sont ajoutées. */
async function ensureMakes(tx: Tx, categoryId: string, names: readonly string[]) {
  const makes = await tx
    .select({ id: vehicleMakes.id })
    .from(vehicleMakes)
    .where(
      inArray(
        sql`lower(${vehicleMakes.name})`,
        names.map((n) => n.toLowerCase()),
      ),
    );
  if (makes.length) {
    await tx
      .insert(categoryMakes)
      .values(makes.map((m) => ({ categoryId, makeId: m.id })))
      .onConflictDoNothing();
  }
}

export async function syncStyleCatalog(catalog: readonly CatalogStyle[] = styleCatalog): Promise<StyleSyncResult> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('style-catalog-sync', 0))`);
    // Même verrou que l'admin quand il attribue une position (création, acceptation, ordre).
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('category-positions', 0))`);
    const seen = new Set(
      (await tx.select({ slug: categoryCatalogSeen.slug }).from(categoryCatalogSeen)).map((r) => r.slug),
    );
    const rows = await tx
      .select({ slug: categories.slug, label: categories.label, position: categories.position })
      .from(categories);
    const bySlug = new Set(rows.map((r) => r.slug));
    const byKey = new Set(rows.map((r) => styleKey(r.label)));
    // Premier passage : l'ordre du catalogue ; ensuite, un style nouveau du catalogue arrive à la fin.
    const firstRun = seen.size === 0;
    let next = rows.reduce((max, r) => Math.max(max, r.position), -1) + 1;
    let inserted = 0;
    let adopted = 0;
    for (const [index, s] of catalog.entries()) {
      if (seen.has(s.slug)) continue;
      const values = {
        label: s.label,
        labelM: s.labelM ?? null,
        labelKey: styleKey(s.label),
        family: s.family,
        icon: s.icon,
        allowedVehicleTypes: s.types,
        minVehicleAge: s.minVehicleAge ?? null,
        ...(s.countries ? { allowedCountries: s.countries } : {}),
        makeMode: s.makes ? ("whitelist" as const) : ("any" as const),
        active: !s.paused,
      };
      if (bySlug.has(s.slug)) {
        // Une catégorie d'avant le lot : adoptée au premier passage seulement ; sinon elle est à l'admin.
        if (!firstRun) continue;
        await tx
          .update(categories)
          .set({ ...values, position: index })
          .where(eq(categories.slug, s.slug));
        adopted++;
      } else {
        // Un style de même nom créé par l'admin : le sien reste, le catalogue ne le double pas.
        if (byKey.has(values.labelKey)) continue;
        await tx
          .insert(categories)
          .values({ slug: s.slug, ...values, position: firstRun ? index : next++ })
          .onConflictDoNothing();
        byKey.add(values.labelKey);
        inserted++;
      }
    }
    const keys = catalog.filter((s) => !seen.has(s.slug)).map((s) => ({ slug: s.slug }));
    if (keys.length) await tx.insert(categoryCatalogSeen).values(keys).onConflictDoNothing();
    // Listes blanches : complétées à chaque passage (marques arrivées depuis), tant que le style est en liste blanche.
    for (const s of catalog) {
      if (!s.makes) continue;
      const [row] = await tx
        .select({ id: categories.id })
        .from(categories)
        .where(and(eq(categories.slug, s.slug), eq(categories.makeMode, "whitelist")));
      if (row) await ensureMakes(tx, row.id, s.makes);
    }
    return { inserted, adopted };
  });
}
