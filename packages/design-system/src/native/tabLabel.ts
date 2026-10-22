// Ajustement des libellés de la barre d'onglets (lot C1, tour 2). Pur : testé sans React Native.

import { archivoAt } from "./fontFamily";

/** Place d'un libellé : la colonne (≈ 74 px à 390 px) plus un léger débord, sans toucher le voisin. */
export const LABEL_ROOM = 78;

/**
 * Lot C1, tour 2 : un libellé long (« Candidatures », « Événements ») ne doit ni être coupé ni toucher son voisin.
 * Largeur estimée en Archivo 115 % 800 (0,874 em par capitale, mesuré) ; au-delà de la place, l'instance 100 %
 * (0,75 em), puis une taille réduite jusqu'à 7,5 px.
 */
export function tabLabelFit(label: string): { fontFamily?: string; fontSize?: number } {
  const n = label.length;
  if (n * 0.874 * 9.5 <= LABEL_ROOM) return {};
  const size = Math.max(7.5, Math.min(9.5, LABEL_ROOM / (n * 0.75)));
  return { fontFamily: archivoAt(100, 800), fontSize: size };
}
