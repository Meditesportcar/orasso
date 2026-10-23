// Taille d'un titre d'affiche (lot M5, retour 01) : un mot ne se coupe jamais au milieu. Le titre passe à la ligne
// entre les mots ; c'est le mot le plus long qui doit tenir sur la largeur disponible, quitte à baisser le corps.
// Logique pure, testée : `em` est la chasse moyenne d'un caractère de la police, en fraction du corps.

/** Chasse moyenne d'Archivo large (125 %) noir italique en capitales : mesure large, pour ne jamais déborder. */
export const WIDE_EM = 0.92;
/** Chasse moyenne d'Archivo étroit (62 %) 800 : chiffres et capitales du compte à rebours. */
export const NARROW_EM = 0.5;

export function fitWordSize(text: string, width: number, max: number, min: number, em: number): number {
  if (!(width > 0)) return max;
  const longest = Math.max(1, ...text.split(/\s+/).map((w) => w.length));
  return Math.max(min, Math.min(max, Math.floor(width / (longest * em))));
}
