// Recherche par texte (lot 29) : un texte saisi devient quelques mots (au plus 4) qui doivent tous se retrouver quelque
// part ; chaque mot est échappé pour `like` et borné en longueur. Aucun mot ne peut faire un motif `%`.
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
