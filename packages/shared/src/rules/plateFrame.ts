// Cadre de plaque posé à la main (lot 51) : déplacer et agrandir un rectangle normalisé 0–1 sans qu'il sorte de la
// photo (l'API refuse un cadre hors de l'image). Partagé par l'éditeur de l'appli et celui du site.
import type { PlateRect } from "../schemas/vehicle";

/** Plus petit cadre posable : 4 % de la largeur, 3 % de la hauteur. */
export const PLATE_FRAME_MIN_W = 0.04;
export const PLATE_FRAME_MIN_H = 0.03;

/** Cadre proposé quand on en pose un : là où se trouve d'habitude la plaque avant, au centre bas de la photo. */
export const DEFAULT_PLATE_FRAME: PlateRect = { x: 0.35, y: 0.62, w: 0.3, h: 0.12 };

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const round = (n: number) => Math.round(n * 10000) / 10000;

/** Déplace le cadre de (dx, dy) en fraction de la photo, borné à l'image. */
export function movePlateFrame(r: PlateRect, dx: number, dy: number): PlateRect {
  return { ...r, x: round(clamp(r.x + dx, 0, 1 - r.w)), y: round(clamp(r.y + dy, 0, 1 - r.h)) };
}

/** Agrandit ou réduit le cadre par son coin bas droit, borné à l'image et à la taille minimale. */
export function resizePlateFrame(r: PlateRect, dw: number, dh: number): PlateRect {
  return {
    ...r,
    w: round(clamp(r.w + dw, PLATE_FRAME_MIN_W, 1 - r.x)),
    h: round(clamp(r.h + dh, PLATE_FRAME_MIN_H, 1 - r.y)),
  };
}

/** Un cadre de plus, décalé s'il en existe déjà au même endroit. */
export function nextPlateFrame(existing: readonly PlateRect[]): PlateRect {
  const shift = existing.length * 0.06;
  return movePlateFrame(DEFAULT_PLATE_FRAME, shift, -shift);
}
