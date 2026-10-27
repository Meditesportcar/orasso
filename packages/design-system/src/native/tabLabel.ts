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

/** Largeur d'une capitale en Archivo 115 % 800 et 100 % 800, en em (mesurée, voir `tabLabelFit`). */
const EM_115 = 0.874;
const EM_100 = 0.75;
/** Plus petit corps affiché d'un libellé d'onglet (après l'échelle de police). */
const MIN_SHOWN = 7.5;
const BASE = 9.5;

/**
 * Lot R6-police (« EXPLORE / R » sur le Pixel de Damien, police système agrandie) : avec une échelle de police
 * au-dessus de 1, le libellé le plus long de la barre doit tenir sur une ligne dans sa place une fois agrandi. Le même
 * corps pour les cinq libellés (une barre, un corps) : 115 % tant que le corps affiché reste lisible (7,5 px), sinon
 * l'instance 100 %. À l'échelle 1 (ou moins), rien ne change : `tabLabelFit` de chaque libellé.
 */
export function tabBarLabelFits(
  labels: readonly string[],
  fontScale: number,
): { fontFamily?: string; fontSize?: number }[] {
  if (!(fontScale > 1)) return labels.map(tabLabelFit);
  const n = Math.max(1, ...labels.map((l) => l.length));
  const wide = Math.min(BASE, LABEL_ROOM / (n * EM_115 * fontScale));
  if (wide * fontScale >= MIN_SHOWN) {
    const style = wide < BASE ? { fontSize: wide } : {};
    return labels.map(() => style);
  }
  const size = Math.min(BASE, LABEL_ROOM / (n * EM_100 * fontScale));
  return labels.map(() => ({ fontFamily: archivoAt(100, 800), fontSize: size }));
}
