// Recherche « Marque ou modèle » de l'ajout de véhicule (lot R3c) : règles de correspondance, sans accents, casse,
// tirets ni espaces. « 207 », « peugeot 207 », « golf 4 », « golf iv », « e36 », « mx5 » et « MX-5 » trouvent le bon
// modèle ou la bonne génération. L'API indexe le référentiel avec `searchWords` et classe avec `matchTokens` ; l'appli
// et le site peuvent filtrer une liste déjà chargée avec les mêmes fonctions.

import { z } from "zod";
import { vehicleTypeSchema } from "../enums";

export const vehicleReferenceSearchQuery = z.object({
  q: z.string().trim().min(1).max(60),
  type: vehicleTypeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type VehicleReferenceSearchQuery = z.infer<typeof vehicleReferenceSearchQuery>;

/**
 * Un résultat : une marque seule (« peugeot »), un modèle (« 207 ») ou une génération (« golf 4 » → Golf Mk4).
 * Les identifiants sont ceux des listes du référentiel (`/vehicle-reference/…`).
 */
export type VehicleReferenceHit = {
  kind: "make" | "model" | "generation";
  makeId: string;
  makeName: string;
  modelId: string | null;
  modelName: string | null;
  vehicleType: "car" | "moto" | "truck" | null;
  generationId: string | null;
  generationName: string | null;
  yearFrom: number | null;
  yearTo: number | null;
};

const ROMAN: Record<string, string> = {
  i: "1",
  ii: "2",
  iii: "3",
  iv: "4",
  v: "5",
  vi: "6",
  vii: "7",
  viii: "8",
  ix: "9",
  x: "10",
  xi: "11",
  xii: "12",
};

const ARABIC: Record<string, string> = Object.fromEntries(Object.entries(ROMAN).map(([r, n]) => [n, r]));

/** Préfixes de numéro de génération : « Mk4 », « Gen2 », « Phase1 », « Serie3 », « S2 » valent aussi « 4 », « 2 »… */
const NUMBERED = /^(mk|gen|phase|serie|series)(\d{1,2})$/;

/** Minuscules, sans accents. */
export function searchFold(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const compact = (text: string) => text.replace(/[^a-z0-9]/g, "");

/**
 * Mots indexés d'un nom : chaque mot collé (« MX-5 » → mx5), ses morceaux (mx, 5), le nom entier collé
 * (« Série 3 » → serie3), le chiffre d'un numéro romain (« IV » → 4) ou d'un « Mk4 » (→ 4).
 */
export function searchWords(name: string): string[] {
  const folded = searchFold(name);
  const out = new Set<string>();
  const whole = compact(folded);
  if (whole) out.add(whole);
  const raws = folded.split(/\s+/).filter(Boolean);
  for (const [i, raw] of raws.entries()) {
    const word = compact(raw);
    if (!word) continue;
    out.add(word);
    for (const part of raw.split(/[^a-z0-9]+/)) {
      if (!part) continue;
      out.add(part);
      const roman = ROMAN[part];
      // Un « V » ou un « X » en tête d'un nom de plusieurs mots est une lettre (« X 350 »), pas un numéro.
      if (roman && !(i === 0 && raws.length > 1 && (part === "v" || part === "x"))) out.add(roman);
      const numbered = NUMBERED.exec(part);
      if (numbered?.[2]) out.add(String(Number(numbered[2])));
    }
  }
  // Tour 2 : un numéro de 1 à 12 vaut aussi son romain (« Mk4 » → iv), pour « golfiv » et « golf-iv ».
  for (const word of [...out]) {
    const roman = ARABIC[word];
    if (roman) out.add(roman);
  }
  return [...out];
}

/** Mots de la saisie : collés (« MX-5 » → mx5), au plus 6 ; un numéro romain vaut aussi son chiffre. */
export function searchTokens(query: string): string[][] {
  return searchFold(query)
    .split(/\s+/)
    .map(compact)
    .filter(Boolean)
    .slice(0, 6)
    .map((token) => {
      const roman = ROMAN[token];
      return roman ? [token, roman] : [token];
    });
}

/** Note d'un mot de la saisie contre une liste de mots : 3 identique, 1 début de mot, 0 absent. */
export function tokenScore(alternatives: readonly string[], words: readonly string[]): number {
  let best = 0;
  for (const token of alternatives) {
    for (const word of words) {
      if (word === token) return 3;
      if (best === 0 && word.startsWith(token)) best = 1;
    }
  }
  return best;
}

/**
 * Correspondance d'une ligne du référentiel découpée en niveaux (marque, modèle, génération) : chaque mot de la saisie
 * doit se trouver à un niveau, et au moins un au niveau le plus précis (`levels` dernier), sinon la ligne du niveau
 * au-dessus suffit. Rend la note (somme des meilleures notes), ou 0.
 */
export function matchTokens(tokens: readonly string[][], levels: readonly (readonly string[])[]): number {
  if (!tokens.length || !levels.length) return 0;
  const last = levels.length - 1;
  let total = 0;
  let touchesLast = false;
  for (const alternatives of tokens) {
    let best = 0;
    for (const [i, words] of levels.entries()) {
      const score = tokenScore(alternatives, words);
      if (score > 0 && i === last) touchesLast = true;
      if (score > best) best = score;
    }
    if (best === 0) return 0;
    total += best;
  }
  return touchesLast ? total : 0;
}
