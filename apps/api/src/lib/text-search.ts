// Recherche par texte (lot 29) : un texte saisi devient quelques mots (au plus 4) qui doivent tous se retrouver quelque
// part ; chaque mot est échappé pour `like` et borné en longueur. Aucun mot ne peut faire un motif `%`.
import { or, type SQL, type SQLWrapper, sql } from "drizzle-orm";

import { escapeLike } from "./pagination";

/** Mots d'une recherche : au plus `max`, de 1 à 40 caractères, sans caractère de contrôle. */
export function searchTokens(q: string | undefined | null, max = 4): string[] {
  if (!q) return [];
  return [...q]
    .map((ch) => (ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 ? " " : ch))
    .join("")
    .split(/\s+/)
    .map((t) => t.trim().slice(0, 40))
    .filter(Boolean)
    .slice(0, max);
}

/** Motif `ilike '%mot%'` à passer avec `escape '\\'` (ou le défaut de PostgreSQL). */
export const containsPattern = (token: string): string => `%${escapeLike(token)}%`;

/** Motif `ilike 'mot%'`. */
export const prefixPattern = (token: string): string => `${escapeLike(token)}%`;

/** Minuscules sans accents, pour comparer un mot saisi à des libellés connus (activités). */
export function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

// Lot R1 (retour de Damien du 24/10 : « Médite » ne trouvait pas MéditeSportCar) : la même chose côté base, sans
// extension (`unaccent` n'est pas partout). Tour 2 : par la fonction `orasso_fold` (migration 0056 : `translate` des
// deux casses, indépendant de la locale de la base, puis `lower`), IMMUTABLE, qui porte les index trigrammes du titre,
// de la ville et du lieu des événements et du nom des structures ; l'expression doit rester exactement celle-ci pour
// que ces index servent. À comparer avec `like` à un motif fait de `fold(mot)` (parité testée).

/** Colonne en minuscules sans accents (SQL), comme `fold`. */
export const foldedSql = (column: SQLWrapper): SQL => sql`orasso_fold(${column})`;

/**
 * Un mot saisi se retrouve dans une des colonnes, sans tenir compte des accents ni de la casse ; un début de mot (ou un
 * morceau) suffit : « Médite », « medite », « MEDI » trouvent « MéditeSportCar ».
 */
export function anyColumnContains(token: string, columns: SQLWrapper[]): SQL | undefined {
  const like = containsPattern(fold(token));
  return or(...columns.map((column) => sql`${foldedSql(column)} like ${like}`));
}
