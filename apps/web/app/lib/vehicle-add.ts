// Règles d'affichage de l'ajout de véhicule du site (lot M1), les mêmes que l'appli (`features/vehicle/add/model.ts`) :
// origine déduite de la marque, styles montrés ou grisés, années de la génération. Pur : testé sans réseau ni React.
import {
  type CategoryOption,
  vehicleAddLabels as V,
  type VehicleGeneration,
  type VehicleMake,
  type VehicleModel,
  type VehicleType,
} from "@orasso/shared";

export const MAX_CATEGORIES = 10;

/** Triée par nom (les générations gardent l'ordre des années), « Autre » en dernier. */
export function sortRows<T extends { name: string; isOther: boolean }>(rows: readonly T[], byName = true): T[] {
  return [...rows].sort(
    (a, b) => Number(a.isOther) - Number(b.isOther) || (byName ? a.name.localeCompare(b.name, "fr") : 0),
  );
}

/** Modèles du type choisi (le modèle « Autre » vaut pour tous les types). */
export const modelsForType = (rows: readonly VehicleModel[], type: VehicleType) =>
  rows.filter((m) => m.isOther || m.vehicleType === type);

/** Années proposées en pastilles : celles de la génération (40 au plus), sinon aucune (champ libre). */
export function yearChoices(g: Pick<VehicleGeneration, "yearFrom" | "yearTo" | "isOther"> | undefined, now: number) {
  if (!g || g.isOther || !g.yearFrom) return [];
  const to = Math.min(g.yearTo ?? now + 1, now + 1);
  if (to < g.yearFrom || to - g.yearFrom > 40) return [];
  return Array.from({ length: to - g.yearFrom + 1 }, (_, i) => (g.yearFrom as number) + i);
}

/** Catégorie d'origine : restreinte à des pays, dont celui de la marque (« JDM » pour une marque japonaise). */
export function originCategories(rows: readonly CategoryOption[], make: VehicleMake | undefined) {
  const country = make && !make.isOther ? make.country : null;
  if (!country) return [];
  return rows.filter((c) => c.eligible && c.allowedCountries?.includes(country));
}

/** Les autres catégories (les origines d'autres pays ne sont pas des styles : on ne les montre pas). */
export const styleCategories = (rows: readonly CategoryOption[]) => rows.filter((c) => !c.allowedCountries);

/** Styles montrés : ceux refusés pour le type ou la marque sont cachés, ceux refusés pour l'âge restent grisés. */
export const visibleStyles = (rows: readonly CategoryOption[]) =>
  styleCategories(rows).filter((c) => c.refusal !== "type" && c.refusal !== "make");

/** « Youngtimer et Ancienne sont grisées : ta voiture est de 2021. » : une seule phrase sous les styles. */
export function dimmedNote(rows: readonly CategoryOption[], year: number | undefined, type: VehicleType) {
  if (!year) return null;
  const labels = visibleStyles(rows)
    .filter((c) => c.refusal === "age")
    .map((c) => c.label);
  return labels.length ? V.stylesDimmed(labels, V.vehicleNoun[type], year) : null;
}

/** Catégories gardées : origines déduites + styles choisis encore éligibles, 10 au plus. */
export function keptCategories(ids: readonly string[], rows: readonly CategoryOption[], make: VehicleMake | undefined) {
  const origins = originCategories(rows, make).map((c) => c.id);
  const eligible = new Set(
    styleCategories(rows)
      .filter((c) => c.eligible)
      .map((c) => c.id),
  );
  return [...origins, ...ids.filter((id) => eligible.has(id) && !origins.includes(id))].slice(0, MAX_CATEGORIES);
}

/** « Préparée » : la catégorie à cocher d'office dès qu'une préparation est choisie, si elle convient. */
export const preparedCategory = (rows: readonly CategoryOption[], slug: string) =>
  rows.find((c) => c.slug === slug && c.eligible) ?? null;
