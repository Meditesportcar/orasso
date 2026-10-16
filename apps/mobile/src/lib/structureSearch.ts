// Recherche d'une structure par son nom ou sa ville (« Devenir staff »), sur l'appareil : sans accents ni casse.
import type { StructureCard } from "@orasso/shared";

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function filterStructures(items: readonly StructureCard[], query: string): StructureCard[] {
  const q = fold(query.trim());
  if (!q) return [...items];
  return items.filter((s) => fold(`${s.name} ${s.city ?? ""}`).includes(q));
}
