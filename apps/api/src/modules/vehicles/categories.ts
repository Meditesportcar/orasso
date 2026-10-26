// Catégories cohérentes avec le véhicule (lot 31, ARCHITECTURE-SUITE § 14) : âge, type, pays de la marque, liste blanche.
// Les règles sont dans `@orasso/shared` (`categoryRefusal`) ; ici on charge les catégories et leurs marques.
import {
  type CategoryIcon,
  type CategoryOption,
  type CategoryReferenceQuery,
  type CategoryRule,
  categoryLabelFor,
  categoryRefusal,
  categoryRefusalLabels,
  type VehicleFacts,
} from "@orasso/shared";
import { asc, eq, inArray } from "drizzle-orm";

import { db } from "../../db/client";
import { categories, categoryMakes, profileInterests, vehicleMakes, vehicleModels } from "../../db/schema";
import { now } from "../../lib/deps";
import { validation } from "../../lib/errors";
import type { Executor } from "../../lib/tx";

type CategoryRow = typeof categories.$inferSelect;
export type CategoryWithRule = CategoryRow & { rule: CategoryRule };

/** Catégories (actives, ou celles demandées) avec leur règle complète. */
export async function loadCategoryRules(ex: Executor, ids?: string[]): Promise<CategoryWithRule[]> {
  const rows = await ex.query.categories.findMany({
    where: ids ? inArray(categories.id, ids) : eq(categories.active, true),
    orderBy: [asc(categories.position)],
  });
  const makes = rows.length
    ? await ex
        .select()
        .from(categoryMakes)
        .where(
          inArray(
            categoryMakes.categoryId,
            rows.map((r) => r.id),
          ),
        )
    : [];
  return rows.map((c) => ({
    ...c,
    rule: {
      minVehicleAge: c.minVehicleAge,
      allowedVehicleTypes: c.allowedVehicleTypes,
      allowedCountries: c.allowedCountries,
      makeMode: c.makeMode,
      allowedMakeIds: makes.filter((m) => m.categoryId === c.id).map((m) => m.makeId),
    },
  }));
}

/** Faits du véhicule utiles aux règles : type, année, marque (pays et « Autre » lus en base), modèle tout-terrain. */
export async function loadVehicleFacts(
  ex: Executor,
  v: { vehicleType: string; makeId: string; modelId?: string | null; year: number | null },
): Promise<VehicleFacts> {
  const make = await ex.query.vehicleMakes.findFirst({ where: eq(vehicleMakes.id, v.makeId) });
  if (!make) throw validation("Marque inconnue");
  const model = v.modelId ? await ex.query.vehicleModels.findFirst({ where: eq(vehicleModels.id, v.modelId) }) : null;
  return {
    vehicleType: v.vehicleType,
    offroad: Boolean(model?.offroad && model.makeId === make.id),
    year: v.year,
    makeId: make.id,
    makeCountry: make.country,
    makeIsOther: make.isOther,
  };
}

/**
 * Catégories actives et cohérentes avec le véhicule ; refus listé avec sa raison. Lot R5a : `kept`, les catégories déjà
 * sur la fiche ; un style mis en pause depuis par l'admin y reste permis (il ne se propose plus, il ne disparaît pas).
 */
export async function checkCategories(
  ex: Executor,
  ids: string[],
  vehicle: { vehicleType: string; makeId: string; modelId?: string | null; year: number | null },
  kept: readonly string[] = [],
) {
  if (!ids.length) return;
  const unique = [...new Set(ids)];
  const rows = await loadCategoryRules(ex, unique);
  if (rows.length !== unique.length || rows.some((c) => !c.active && !kept.includes(c.id))) {
    throw validation("Catégorie inconnue");
  }
  const facts = await loadVehicleFacts(ex, vehicle);
  const refused = rows.flatMap((c) => {
    const refusal = categoryRefusal(c.rule, facts, now());
    return refusal ? [{ category: c, refusal }] : [];
  });
  if (refused.length) {
    throw validation(
      `Catégorie incompatible : ${refused.map((r) => `${r.category.label} (${categoryRefusalLabels[r.refusal].toLowerCase()})`).join(", ")}`,
      {
        categoryIds: refused.map((r) => r.category.id),
        reasons: Object.fromEntries(refused.map((r) => [r.category.id, r.refusal])),
      },
    );
  }
}

/**
 * Référentiel des catégories avec éligibilité. Sans paramètre : tout est éligible (page publique d'un événement).
 * `makeId` absent : pays et liste blanche ne s'appliquent pas encore ; `year` absent : l'âge n'est pas évalué ;
 * `vehicleType` absent : tous les types.
 */
export async function categoryOptions(query: CategoryReferenceQuery): Promise<CategoryOption[]> {
  const rows = await loadCategoryRules(db);
  const facts: VehicleFacts = query.makeId
    ? await loadVehicleFacts(db, {
        vehicleType: query.vehicleType ?? "car",
        makeId: query.makeId,
        modelId: query.modelId ?? null,
        year: query.year ?? null,
      })
    : {
        vehicleType: query.vehicleType ?? "car",
        year: query.year ?? null,
        makeId: null,
        makeCountry: null,
        makeIsOther: true,
      };
  return rows.map((c) => {
    const rule: CategoryRule = {
      ...c.rule,
      minVehicleAge: query.year === undefined ? null : c.rule.minVehicleAge,
      allowedVehicleTypes: query.vehicleType === undefined ? null : c.rule.allowedVehicleTypes,
    };
    const refusal = categoryRefusal(rule, facts, now());
    return {
      id: c.id,
      slug: c.slug,
      // Lot R5a : au masculin pour un camion (« Ancien », « Préparé »), famille et icône du catalogue des styles.
      label: categoryLabelFor(c, query.vehicleType),
      family: c.family,
      icon: c.icon as CategoryIcon,
      minVehicleAge: c.minVehicleAge,
      allowedVehicleTypes: c.allowedVehicleTypes,
      allowedCountries: c.allowedCountries,
      makeMode: c.makeMode,
      eligible: refusal === null,
      refusal,
      reason: refusal ? categoryRefusalLabels[refusal] : null,
    };
  });
}

/**
 * Centres d'intérêt envoyés (préférences, réglages, profil) : des catégories actives, ou déjà choisies par la personne.
 * Lot R5a : un style mis en pause par l'admin (« Moto », « Utilitaire ») ne se propose plus, mais reste choisi : renvoyer
 * ses choix tels quels ne doit pas être refusé.
 */
export async function assertInterests(ex: Executor, userId: string, ids: readonly string[] | undefined) {
  if (!ids?.length) return;
  const unique = [...new Set(ids)];
  const [found, kept] = await Promise.all([
    ex.select({ id: categories.id, active: categories.active }).from(categories).where(inArray(categories.id, unique)),
    ex
      .select({ id: profileInterests.categoryId })
      .from(profileInterests)
      .where(eq(profileInterests.userId, userId))
      .then((rows) => new Set(rows.map((r) => r.id))),
  ]);
  if (found.length !== unique.length || found.some((c) => !c.active && !kept.has(c.id))) {
    throw validation("Centre d'intérêt inconnu");
  }
}
