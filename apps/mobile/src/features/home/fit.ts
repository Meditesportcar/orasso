// Taille d'un titre d'affiche (lot M5, retour 01) : un mot ne se coupe jamais au milieu. Le titre passe à la ligne
// entre les mots ; c'est le mot le plus long qui doit tenir sur la largeur disponible, quitte à baisser le corps.
// Logique pure, testée : `em` est la chasse moyenne d'un caractère de la police, en fraction du corps.
import { wideWordEm } from "@orasso/shared";

import { TITLE_INK_MARGIN } from "../../ui/secHeadLayout";

/** Chasse moyenne d'Archivo large (125 %) noir italique en capitales : mesure large, pour ne jamais déborder. */
export const WIDE_EM = 0.92;
/** Chasse moyenne d'Archivo étroit (62 %) 800 : chiffres et capitales du compte à rebours. */
export const NARROW_EM = 0.5;

export function fitWordSize(text: string, width: number, max: number, min: number, em: number): number {
  if (!(width > 0)) return max;
  const longest = Math.max(1, ...text.split(/\s+/).map((w) => w.length));
  return Math.max(min, Math.min(max, Math.floor(width / (longest * em))));
}

/**
 * Corps d'un titre en Archivo large noir italique en capitales (lot R7-0, tour 2 : « RASSEMBLEMEN / T DU LYDIA »). Le mot le
 * plus large est mesuré à la chasse de chaque signe (`wideWordEm`, plus 10 % pour l'encre des capitales italiques
 * d'Android), et l'échelle de police du système est retirée de la largeur : `width / fontScale`, car le texte sera
 * agrandi d'autant. Le titre ne se coupe alors qu'entre deux mots, de `max` (corps du jeton) jusqu'à `min`.
 */
export function fitWideTitleSize(text: string, width: number, fontScale: number, max: number, min: number): number {
  if (!(width > 0)) return max;
  const widest = Math.max(1, ...text.split(/\s+/).map((w) => wideWordEm(w, TITLE_INK_MARGIN)));
  return Math.max(min, Math.min(max, Math.floor(width / Math.max(1, fontScale) / widest)));
}

/** Corps minimal d'un titre d'affiche ou de ticket (lot R7-0, tour 3) : en dessous, le titre change de place, il ne rétrécit plus. */
export const TITLE_FLOOR = 11;

/**
 * Titre d'un ticket ou d'une carte (lot R7-0, tour 3) : le corps suit le mot le plus large dans sa colonne, jamais sous
 * `TITLE_FLOOR`. Quand le mot le plus long ne tient pas à ce plancher, le titre passe sur toute la largeur de la carte
 * (`full`), au corps qui lui convient là (même plancher), au lieu de rétrécir encore. Un mot ne se coupe jamais.
 * `columnWidth` / `fullWidth` : largeurs utiles du texte (0 = pas encore mesurées : le maximum, en colonne).
 */
export function fitTitle(
  text: string,
  columnWidth: number,
  fullWidth: number,
  fontScale: number,
  max: number,
  floor = TITLE_FLOOR,
): { size: number; full: boolean } {
  if (!(columnWidth > 0)) return { size: max, full: false };
  const raw = (width: number) => {
    const widest = Math.max(1, ...text.split(/\s+/).map((w) => wideWordEm(w, TITLE_INK_MARGIN)));
    return Math.floor(width / Math.max(1, fontScale) / widest);
  };
  const inColumn = raw(columnWidth);
  if (inColumn >= floor || !(fullWidth > columnWidth)) return { size: Math.max(floor, Math.min(max, inColumn)), full: false };
  return { size: Math.max(floor, Math.min(max, raw(fullWidth))), full: true };
}
