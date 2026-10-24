// Nom d'un véhicule (lot R4e, tour 2) : une seule composition pour l'API, l'appli, le site et l'affiche à partager.
// « Volkswagen Golf Mk4 GTI » : la marque, le modèle, la génération, puis la version. La version n'est pas répétée quand
// le nom la contient déjà, en mots entiers, sans casse ni accents (« Golf GTI » + « GTI », « 207 CC » + « CC »,
// « Golf Mk4 » + « Mk4 »). Un nom de véhicule ne se coupe jamais à l'affichage.
import { searchFold } from "./vehicleSearch";

export type VehicleNameParts = {
  make?: string | null;
  model?: string | null;
  /** Génération de la liste (sans « Autre »). */
  generation?: string | null;
  version?: string | null;
};

/** Mots d'un texte : lettres et chiffres, sans accents ni casse. */
const words = (text: string) =>
  searchFold(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

/** La version est-elle déjà dans ces morceaux du nom (suite de mots entiers) ? */
export function versionAlreadyIn(version: string, parts: readonly (string | null | undefined)[]): boolean {
  const want = words(version);
  if (!want.length) return true;
  const have = words(parts.filter(Boolean).join(" "));
  for (let i = 0; i + want.length <= have.length; i++) {
    if (want.every((w, j) => have[i + j] === w)) return true;
  }
  return false;
}

/**
 * Nom affiché. `withGeneration: false` : la génération est montrée ailleurs (fiche qui se construit, affiche), elle
 * n'entre pas dans le nom mais compte pour ne pas répéter la version. `fallback` : nom d'un véhicule sans aucun morceau.
 */
export function vehicleName(n: VehicleNameParts, opts: { withGeneration?: boolean; fallback?: string } = {}): string {
  const base = [n.make, n.model, opts.withGeneration === false ? null : n.generation].filter((p): p is string =>
    Boolean(p?.trim()),
  );
  const version = n.version?.trim();
  if (version && !versionAlreadyIn(version, [n.make, n.model, n.generation])) base.push(version);
  return base.join(" ") || (opts.fallback ?? "Autre véhicule");
}
