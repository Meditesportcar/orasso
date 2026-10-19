// Affiche d'événement (lot 47) : l'entrée du rendu et les calques que chaque gabarit décrit.
import type { PosterDate, PosterStyle } from "@orasso/shared";

import type { PosterFont } from "./text";

/** Ce qu'il faut pour rendre une affiche : rien d'autre (pas de base, pas de réseau). */
export type PosterInput = {
  style: PosterStyle;
  title: string;
  startsAt: Date;
  timezone: string;
  /** Lieu court (ville). */
  place: string;
  structureName: string;
  /** Photo de fond (n'importe quel format lu par sharp), `null` = aplat. */
  photo: Buffer | null;
  /** Logo de la structure (rond), `null` = initiales de la structure. */
  logo: Buffer | null;
};

/** Contexte d'un gabarit : dimensions, unités du prototype (`cqw`, `cqh` = 1 % de la largeur, de la hauteur). */
export type PosterCtx = {
  W: number;
  H: number;
  cqw: number;
  cqh: number;
  story: boolean;
  input: PosterInput;
  date: PosterDate;
  /** Titre en capitales. */
  title: string;
  /** Lieu en capitales. */
  place: string;
};

/** Texte : une ou plusieurs lignes, ancrées par le haut des capitales de la première ligne ou par le bas de la dernière. */
export type TextLayer = {
  kind: "text";
  lines: string[];
  font: PosterFont;
  size: number;
  color: string;
  /** Interlettrage, fraction du corps. */
  spacing?: number;
  /** Interligne, fraction du corps (0.9 par défaut). */
  lineHeight?: number;
  /** Largeur de la boîte (chaque ligne y tient, réduite au besoin). */
  width: number;
  x: number;
  /** `x` désigne le bord gauche, le centre ou le bord droit de la boîte. */
  align?: "left" | "center" | "right";
  y: number;
  /** `y` désigne le haut des capitales de la première ligne (`top`) ou la ligne de base de la dernière (`bottom`). */
  anchor?: "top" | "bottom";
  /** -90 : le bloc tourne d'un quart de tour (lecture de bas en haut, style JDM) ; `x`, `y` = coin bas gauche. */
  rotate?: -90;
};

/** Fragment SVG dessiné sur toute l'affiche (formes, dégradés, damier). */
export type SvgLayer = { kind: "svg"; markup: string };

/** La photo, recadrée `cover` dans un rectangle, découpée par une forme facultative (SVG, coordonnées locales). */
export type PhotoLayer = { kind: "photo"; x: number; y: number; w: number; h: number; clip?: string; flat: string };

/** Cartouche : lignes de texte empilées sur un fond, inclinée ou tournée (date du Néon, bandeau du Damier). */
export type BoxLayer = {
  kind: "box";
  x: number;
  y: number;
  /** Largeur fixe, sinon ajustée au texte (au plus `maxWidth`). */
  maxWidth?: number;
  width?: number;
  padding: [number, number, number, number];
  fill: string;
  rows: { text: string; font: PosterFont; size: number; color: string; spacing?: number; gapBefore?: number }[];
  align: "left" | "center";
  skewX?: number;
  rotate?: number;
  /** `x`, `y` = coin haut gauche (par défaut) ou centre. */
  origin?: "topleft" | "center";
};

/** Signature « Orasso » (O du logo et mot) précédée du logo rond de la structure, comme `sigH()` du prototype. */
export type SigLayer = {
  kind: "sig";
  /** Bord droit du groupe ; `center` le centre à la place. */
  right: number;
  center?: number;
  y: number;
  anchor: "bottom" | "top";
  color: string;
};

export type PosterLayer = TextLayer | SvgLayer | PhotoLayer | BoxLayer | SigLayer;

export type PosterLayout = { background: string; layers: PosterLayer[] };
