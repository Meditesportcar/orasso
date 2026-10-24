// Ajustement du grand titre d'un onglet (lot R1, retour de Damien du 24/10 : « Mon garage » s'affichait « Mon » après
// un changement de casquette). Pur : testé sans React Native.
//
// La cause : `adjustsFontSizeToFit` d'Android calcule la taille une fois, pendant une mise en page ; un onglet préchargé
// caché (largeur nulle ou transitoire) la fige trop petite et le texte passe à la ligne entre deux mots, la deuxième
// ligne étant coupée par `numberOfLines`. Ici, la taille se calcule à partir des mesures réelles, et une mesure nulle
// (écran caché) ne change rien : la taille suit la dernière mise en page visible.

/** Le titre peut descendre à 70 % sur la même ligne que l'étiquette (DA v2, écart 7). */
export const BIG_TITLE_MIN_SCALE = 0.7;
/** Marge de sécurité (px) : la chasse ne suit pas exactement le corps (approche fixe, arrondis). */
const SAFETY = 2;

export type BigTitleFit = { fontSize: number; stacked: boolean };

/**
 * `size` : corps de base ; `natural` : largeur du titre sur une ligne à ce corps ; `row` : largeur de la ligne du titre ;
 * `label` : largeur de l'étiquette (0 sans étiquette) ; `gap` : écart entre les deux ; `narrow` : écran de 360 px ou
 * moins (l'étiquette passe toujours dessous). Une mesure inconnue (0) garde le corps de base.
 */
export function bigTitleFit(input: {
  size: number;
  natural: number;
  row: number;
  label: number;
  gap: number;
  narrow: boolean;
}): BigTitleFit {
  const { size, natural, row, label, gap, narrow } = input;
  if (!(natural > 0) || !(row > 0)) return { fontSize: size, stacked: narrow };
  const scaleFor = (room: number) => Math.min(1, Math.max(0, room - SAFETY) / natural);
  if (!narrow && label > 0) {
    // Sur la même ligne que l'étiquette, jusqu'à 70 % ; sinon l'étiquette passe dessous.
    const inline = scaleFor(row - label - gap);
    if (inline >= BIG_TITLE_MIN_SCALE) return { fontSize: Math.floor(size * inline * 10) / 10, stacked: false };
    return { fontSize: Math.floor(size * scaleFor(row) * 10) / 10, stacked: true };
  }
  // Seul sur sa ligne : il tient toujours, quitte à descendre sous 70 % (un titre ne se coupe jamais).
  return { fontSize: Math.floor(size * scaleFor(row) * 10) / 10, stacked: narrow };
}
