// Gestes du cadre de plaque dans l'appli (lot 59c, tour 2 des relectures) : logique pure, testée seule.
import { PLATE_FRAME_MIN_H, PLATE_FRAME_MIN_W, PLATE_ROTATE_HANDLE_OFFSET, type PlateRect } from "@orasso/shared";

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
export function rotateHandleBelow(rect: PlateRect, boxH: number, offset = PLATE_ROTATE_HANDLE_OFFSET): boolean {
  const a = ((rect.angle ?? 0) * Math.PI) / 180;
  const reach = (rect.h * boxH) / 2 + offset;
  const cy = (rect.y + rect.h / 2) * boxH;
  return cy - reach * Math.cos(a) - PLATE_HANDLE / 2 < 0;
}

/** Lot M1 (maquette 1.4) : cible tactile des poignées, 48 px au doigt (22 px visibles + 13 px autour). */
export const PLATE_HANDLE_HIT = 13;
/** Poignée de rotation plus loin du cadre (maquette 1.4 : 38 px au lieu de 26). */
export const PLATE_ROTATE_OFFSET_FAR = 38;
/** Loupe : diamètre (px) et grossissement (maquette 1.4, ×2,5). */
export const LOUPE_SIZE = 112;
export const LOUPE_ZOOM = 2.5;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * Deux doigts n'importe où sur la photo (lot M1, maquette 1.4) : pincer agrandit le cadre autour de son centre, tourner
 * les doigts le fait pivoter (−90° à 90°). Le cadre reste dans la photo.
 */
export function pinchPlateFrame(start: PlateRect, scale: number, rotateDeg: number): PlateRect {
  const cx = start.x + start.w / 2;
  const cy = start.y + start.h / 2;
  const w = clamp(start.w * scale, PLATE_FRAME_MIN_W, 1);
  const h = clamp(start.h * scale, PLATE_FRAME_MIN_H, 1);
  const angle = clamp((start.angle ?? 0) + rotateDeg, -90, 90);
  return {
    x: clamp(cx - w / 2, 0, 1 - w),
    y: clamp(cy - h / 2, 0, 1 - h),
    w,
    h,
    ...(Math.abs(angle) >= 0.5 ? { angle: Math.round(angle * 10) / 10 } : {}),
  };
}

/** Écart et angle (degrés) entre deux doigts. */
export function twoFingers(a: { pageX: number; pageY: number }, b: { pageX: number; pageY: number }) {
  return {
    distance: Math.hypot(b.pageX - a.pageX, b.pageY - a.pageY),
    angle: (Math.atan2(b.pageY - a.pageY, b.pageX - a.pageX) * 180) / Math.PI,
  };
}

/** Différence d'angle ramenée entre −180° et 180° (le passage de 179° à −179° n'est pas un tour complet). */
export const angleDelta = (from: number, to: number) => ((((to - from) % 360) + 540) % 360) - 180;

/**
 * Place de la loupe dans la photo (px) : centrée au-dessus du doigt, en dessous quand on est en haut de la photo, et
 * toujours dans la photo.
 */
export function loupePlace(px: number, py: number, boxW: number, boxH: number, size = LOUPE_SIZE, gap = 52) {
  "worklet";
  // Appelée sur le fil UI (style animé de la loupe) : pas d'appel à une fonction JS ordinaire ici.
  const left = Math.min(Math.max(6, boxW - size - 6), Math.max(6, px - size / 2));
  const above = py - size - gap;
  const top = above >= 6 ? above : Math.min(Math.max(6, boxH - size - 6), Math.max(6, py + gap));
  return { left, top };
}
