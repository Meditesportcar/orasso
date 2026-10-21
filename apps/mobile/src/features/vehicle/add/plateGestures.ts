// Gestes du cadre de plaque dans l'appli (lot 59c, tour 2 des relectures) : logique pure, testée seule.
import { PLATE_ROTATE_HANDLE_OFFSET, type PlateRect } from "@orasso/shared";

export type PlateGesture = "move" | "resize" | "rotate";

/** Diamètre visible des poignées (px). */
export const PLATE_HANDLE = 22;

/**
 * Qui prend le geste en phase de capture. Le système de répondeurs de React Native demande d'abord au parent en capture :
 * si le cadre (déplacement) capturait, ses poignées (enfants) ne recevraient jamais le doigt. Seules les poignées
 * capturent ; le cadre prend le geste en phase normale, quand le doigt est sur lui et pas sur une poignée.
 */
export function capturesGesture(kind: PlateGesture): boolean {
  return kind !== "move";
}

/**
 * La poignée de rotation passe sous le cadre quand, au-dessus, elle sortirait de la photo (cadre collé en haut) : hors
 * de la photo, elle serait coupée et ne se toucherait plus. `boxH` : hauteur de la photo affichée.
 */
export function rotateHandleBelow(rect: PlateRect, boxH: number): boolean {
  const a = ((rect.angle ?? 0) * Math.PI) / 180;
  const reach = (rect.h * boxH) / 2 + PLATE_ROTATE_HANDLE_OFFSET;
  const cy = (rect.y + rect.h / 2) * boxH;
  return cy - reach * Math.cos(a) - PLATE_HANDLE / 2 < 0;
}
