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

// Lot 59c (retour de Damien sur l'APK d'essai) : cadre orientable. `angle` en degrés, rotation autour du centre du
// cadre dans le repère de la photo en pixels (sens horaire à l'écran) ; le rectangle `x, y, w, h` reste celui du cadre
// avant rotation (toujours dans la photo). Les écarts sont donnés en pixels de la photo affichée (`W × H`) : la photo
// est montrée à son format, une rotation à l'écran est donc la même sur la photo.

/** En deçà de cet angle (degrés), le cadre se remet droit : on retrouve facilement l'horizontale. */
export const PLATE_ANGLE_SNAP = 2;
/** Distance (px à l'écran) entre le haut du cadre et la poignée qui le tourne. */
export const PLATE_ROTATE_HANDLE_OFFSET = 26;

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Pose l'angle du cadre : borné à ±90°, arrondi au dixième, remis droit (sans `angle`) sous `PLATE_ANGLE_SNAP`. */
export function rotatePlateFrame(r: PlateRect, angle: number): PlateRect {
  const { angle: _previous, ...rest } = r;
  const a = Math.round(clamp(angle, -90, 90) * 10) / 10;
  return Math.abs(a) < PLATE_ANGLE_SNAP ? rest : { ...rest, angle: a };
}

/**
 * Tourne le cadre par sa poignée, posée `offset` px au-dessus du milieu de son bord haut : l'angle suit la direction du
 * centre du cadre vers le doigt (écart `dx, dy` en px depuis le début du geste ; `H` : hauteur de la photo affichée).
 */
export function dragRotatePlateFrame(
  start: PlateRect,
  dx: number,
  dy: number,
  H: number,
  offset = PLATE_ROTATE_HANDLE_OFFSET,
): PlateRect {
  const a0 = rad(start.angle ?? 0);
  const reach = (start.h * H) / 2 + offset;
  const vx = reach * Math.sin(a0) + dx;
  const vy = -reach * Math.cos(a0) + dy;
  if (Math.hypot(vx, vy) < 1) return start;
  return rotatePlateFrame(start, (Math.atan2(vx, -vy) * 180) / Math.PI);
}

/**
 * Agrandit ou réduit le cadre par son coin bas droit, en suivant ses axes s'il est tourné : le coin haut gauche (tourné)
 * reste en place. Borné à la taille minimale et à la photo (le cadre avant rotation reste dans l'image).
 */
export function resizeOrientedPlateFrame(start: PlateRect, dx: number, dy: number, W: number, H: number): PlateRect {
  if (!start.angle) return resizePlateFrame(start, dx / W, dy / H);
  const t = rad(start.angle);
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  const du = dx * cos + dy * sin;
  const dv = -dx * sin + dy * cos;
  const pw0 = start.w * W;
  const ph0 = start.h * H;
  const pw = clamp(pw0 + du, PLATE_FRAME_MIN_W * W, W);
  const ph = clamp(ph0 + dv, PLATE_FRAME_MIN_H * H, H);
  const hu = (pw - pw0) / 2;
  const hv = (ph - ph0) / 2;
  const cx = (start.x + start.w / 2) * W + hu * cos - hv * sin;
  const cy = (start.y + start.h / 2) * H + hu * sin + hv * cos;
  const w = pw / W;
  const h = ph / H;
  return {
    x: round(clamp(cx / W - w / 2, 0, 1 - w)),
    y: round(clamp(cy / H - h / 2, 0, 1 - h)),
    w: round(w),
    h: round(h),
    angle: start.angle,
  };
}
