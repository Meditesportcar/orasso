// Arrivée du catalogue de départ des styles (lot R5a) : chaque style de `styleCatalog` est adopté une seule fois, ajouté
// s'il manque, ou mis à jour s'il existe déjà (famille, icône, libellés, types, ordre, pause : « Origine » devient
// « D'origine », « Moto » et « Utilitaire » passent en pause). Son slug est alors noté dans `category_catalog_seen` : un
// slug vu n'est plus jamais réinséré ni réécrit, si bien qu'un style renommé, déplacé ou mis en pause par l'admin le
// reste. Même idée que `vehicle_reference_seen` (lot R3c). Une transaction, sous un verrou consultatif.
// Lancée au démarrage de l'API (`scripts/reference-sync.ts`, deploy/api-start.sh) et par le seed.
import { sql } from "drizzle-orm";

import { db } from "../../db/client";
import { categories, categoryCatalogSeen } from "../../db/schema";
import { type CatalogStyle, styleCatalog } from "../../db/seed/style-catalog";

export type StyleSyncResult = { inserted: number; adopted: number };

export async function syncStyleCatalog(catalog: readonly CatalogStyle[] = styleCatalog): Promise<StyleSyncResult> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('style-catalog-sync', 0))`);
    const seen = new Set(
      (await tx.select({ slug: categoryCatalogSeen.slug }).from(categoryCatalogSeen)).map((r) => r.slug),
    );
    const rows = await tx.select({ slug: categories.slug, position: categories.position }).from(categories);
    const existing = new Set(rows.map((r) => r.slug));
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
        family: s.family,
        icon: s.icon,
        allowedVehicleTypes: s.types,
        minVehicleAge: s.minVehicleAge ?? null,
        ...(s.countries ? { allowedCountries: s.countries } : {}),
        active: !s.paused,
      };
      if (existing.has(s.slug)) {
        await tx
          .update(categories)
          .set({ ...values, ...(firstRun ? { position: index } : {}) })
          .where(sql`${categories.slug} = ${s.slug}`);
        adopted++;
      } else {
        await tx
          .insert(categories)
          .values({ slug: s.slug, ...values, position: firstRun ? index : next++ })
          .onConflictDoNothing();
        inserted++;
      }
    }
    const keys = catalog.filter((s) => !seen.has(s.slug)).map((s) => ({ slug: s.slug }));
    if (keys.length) await tx.insert(categoryCatalogSeen).values(keys).onConflictDoNothing();
    return { inserted, adopted };
  });
}
