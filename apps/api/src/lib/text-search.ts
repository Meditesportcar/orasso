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
// extension (`unaccent` n'est pas partout) : `translate` enlève les accents des deux casses (indépendant de la locale de
// la base), puis `lower`. À comparer avec `like` à un motif fait de `fold(mot)`.
const ACCENTED = "àáâãäåçèéêëìíîïñòóôõöùúûüýÿÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝŸ";
const PLAIN = "aaaaaaceeeeiiiinooooouuuuyyaaaaaaceeeeiiiinooooouuuuyy";

/** Colonne en minuscules sans accents (SQL), comme `fold`. */
export const foldedSql = (column: SQLWrapper): SQL => sql`lower(translate(${column}, ${ACCENTED}, ${PLAIN}))`;

/**
 * Un mot saisi se retrouve dans une des colonnes, sans tenir compte des accents ni de la casse ; un début de mot (ou un
 * morceau) suffit : « Médite », « medite », « MEDI » trouvent « MéditeSportCar ».
 */
export function anyColumnContains(token: string, columns: SQLWrapper[]): SQL | undefined {
  const like = containsPattern(fold(token));
  return or(...columns.map((column) => sql`${foldedSql(column)} like ${like}`));
}
