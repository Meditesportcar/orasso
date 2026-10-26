// Titre de section et son aide à droite (lot R5b, tour 2, décision du coordinateur) : pur, sans React Native.
//
// L'aide (ou le lien, la mention) reste à droite du titre, comme dans l'artefact. Elle passe dessous seulement si
// (a) la police du système est agrandie (`fontScale > 1`), ou (b) titre + écart + aide ne tiennent pas côte à côte.
// Le titre est estimé à la chasse de chaque signe (`wideWordEm`) plus 10 % pour l'encre des capitales italiques
// d'Android, cause probable du « SON » (le dernier mot passait sur une seconde ligne cachée). Quand les deux tiennent,
// le titre ne rétrécit jamais (`flexShrink: 0`, largeur au moins égale à l'estimation) : c'est l'aide qui cède.
import { wideWordEm } from "@orasso/shared";

/** Marge pour l'encre des capitales italiques d'Android, sur la chasse de chaque signe. */
export const TITLE_INK_MARGIN = 1.1;
/** Chasse moyenne d'un texte courant (aide, lien, titre en Archivo normal), mesure large. */
export const PLAIN_EM = 0.6;
/** Écart entre le titre et l'aide (le `columnGap` des rangées). */
export const SEC_HEAD_GAP = 8;

export type SecHeadSpec = {
  title: string;
  /** Corps du titre (px). */
  titleSize: number;
  /** Titre en Archivo large, en capitales (`posterM`, `posterS`) ; sinon un texte courant. */
  titleWide?: boolean;
  /** Le texte à droite (aide, mention, lien) ; rien : le titre a toute la rangée. */
  side?: string | null;
  /** Corps du texte de droite (px). */
  sideSize?: number;
  /** Largeur fixe à droite en plus du texte (icône, chevron, écart entre mention et lien). */
  sideExtra?: number;
  gap?: number;
};

export function secHeadTitleWidth(spec: Pick<SecHeadSpec, "title" | "titleSize" | "titleWide">): number {
  const em = spec.titleWide === false ? spec.title.length * PLAIN_EM : wideWordEm(spec.title, 1);
  return Math.ceil(em * spec.titleSize * TITLE_INK_MARGIN);
}

export function secHeadSideWidth(spec: Pick<SecHeadSpec, "side" | "sideSize" | "sideExtra">): number {
  if (!spec.side) return 0;
  return Math.ceil(spec.side.length * PLAIN_EM * (spec.sideSize ?? 12.5) + (spec.sideExtra ?? 0));
}

/**
 * `stacked` : l'aide passe sous le titre (qui prend toute la rangée). `titleMinWidth` : côte à côte, la largeur sous
 * laquelle le titre ne descend jamais (`null` : pas d'aide, ou dessous).
 */
export function secHeadLayout(spec: SecHeadSpec & { rowWidth: number; fontScale: number }): {
  stacked: boolean;
  titleMinWidth: number | null;
} {
  if (!spec.side) return { stacked: false, titleMinWidth: null };
  const title = secHeadTitleWidth(spec);
  const side = secHeadSideWidth(spec);
  const stacked = spec.fontScale > 1 || title + (spec.gap ?? SEC_HEAD_GAP) + side > spec.rowWidth;
  return { stacked, titleMinWidth: stacked ? null : Math.min(title, spec.rowWidth) };
}
