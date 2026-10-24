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
/**
 * Distance (px à l'écran) entre le haut du cadre et le bouton de la tige qui le tourne. Lot R4a : une seule valeur pour
 * l'appli et le site (38 px, maquette R4.1 ; l'appli disait 38, le site 26).
 */
export const PLATE_ROTATE_HANDLE_OFFSET = 38;

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Pose l'angle du cadre : borné à ±90°, arrondi au dixième, remis droit (sans `angle`) sous `PLATE_ANGLE_SNAP`. */
export function rotatePlateFrame(r: PlateRect, angle: number): PlateRect {
  const { angle: _previous, ...rest } = r;
  const a = Math.round(clamp(angle, -90, 90) * 10) / 10;
  return Math.abs(a) < PLATE_ANGLE_SNAP ? rest : { ...rest, angle: a };
}

/**
 * Tourne le cadre par sa poignée, posée `offset` px au-dessus du milieu de son bord haut (ou au-dessous du bord bas,
 * `below`, quand le cadre est collé en haut de la photo : lot 59c, tour 2) : l'angle suit la direction du centre du cadre
 * vers le doigt (écart `dx, dy` en px depuis le début du geste ; `H` : hauteur de la photo affichée).
 */
export function dragRotatePlateFrame(
  start: PlateRect,
  dx: number,
  dy: number,
  H: number,
  offset = PLATE_ROTATE_HANDLE_OFFSET,
  below = false,
): PlateRect {
  const a0 = rad(start.angle ?? 0);
  const side = below ? -1 : 1;
  const reach = ((start.h * H) / 2 + offset) * side;
  const vx = reach * Math.sin(a0) + dx;
  const vy = -reach * Math.cos(a0) + dy;
  if (Math.hypot(vx, vy) < 1) return start;
  return rotatePlateFrame(start, (Math.atan2(side * vx, -side * vy) * 180) / Math.PI);
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

// Lot R4a (maquette R4.1) : le cadre ne fait qu'une chose à la fois. Toucher le cadre passe au mode suivant
// (Déplacer → Rotation → Taille → Déplacer) ; il rouvre toujours en Déplacer. En Taille, aucune poignée : les quatre
// bords s'attrapent (zone large et invisible), le bord opposé reste fixe, un coin tire ses deux bords. Logique pure,
// partagée par l'appli (PanResponder) et le site (Pointer Events).

export type PlateFrameMode = "move" | "rotate" | "size";
export const PLATE_FRAME_MODES: readonly PlateFrameMode[] = ["move", "rotate", "size"];
/** Le mode à l'ouverture du cadre : Déplacer, le geste le plus courant. */
export const PLATE_FRAME_FIRST_MODE: PlateFrameMode = "move";

/** Mode suivant, au toucher du cadre. */
export function nextPlateFrameMode(mode: PlateFrameMode): PlateFrameMode {
  const i = PLATE_FRAME_MODES.indexOf(mode);
  return PLATE_FRAME_MODES[(i + 1) % PLATE_FRAME_MODES.length] ?? PLATE_FRAME_FIRST_MODE;
}

export type PlateEdge = "l" | "r" | "t" | "b";
/** Zone de toucher d'un bord : 22 px de chaque côté du trait, 44 px en tout (validé le 24/10). */
export const PLATE_EDGE_HIT = 22;
/** Diamètre visible du bouton de la tige (maquette R4.1 : 28 px). */
export const PLATE_ROTATE_KNOB = 28;
/** Rayon de toucher autour du bouton de la tige. */
export const PLATE_ROTATE_KNOB_HIT = 26;
/** Un toucher (et non un geste) : moins de 6 px parcourus, en moins d'une demi-seconde. */
export const PLATE_TAP_SLOP = 6;
export const PLATE_TAP_MS = 500;

/** Un toucher sur le cadre, et non un glissement. */
export function isPlateFrameTap(distancePx: number, durationMs: number): boolean {
  return distancePx < PLATE_TAP_SLOP && durationMs < PLATE_TAP_MS;
}

/** Centre, demi-tailles (px) et angle (radians) du cadre dans la photo affichée `W × H`. */
function frameGeometry(r: PlateRect, W: number, H: number) {
  return {
    cx: (r.x + r.w / 2) * W,
    cy: (r.y + r.h / 2) * H,
    hw: (r.w * W) / 2,
    hh: (r.h * H) / 2,
    a: rad(r.angle ?? 0),
  };
}

/**
 * Le bouton de la tige passe sous le cadre quand, au-dessus, il sortirait de la photo (cadre collé en haut) : hors de
 * la photo, il serait coupé et ne se toucherait plus. `boxH` : hauteur de la photo affichée.
 */
export function rotateKnobBelow(r: PlateRect, boxH: number, offset = PLATE_ROTATE_HANDLE_OFFSET): boolean {
  const a = rad(r.angle ?? 0);
  const reach = (r.h * boxH) / 2 + offset;
  const cy = (r.y + r.h / 2) * boxH;
  return cy - reach * Math.cos(a) - PLATE_ROTATE_KNOB / 2 < 0;
}

/** Ce que touche le doigt (ou la souris) : le geste du mode, les bords tenus en Taille, et s'il est dans le cadre. */
export type PlateFrameHit = { kind: PlateFrameMode | null; edges: PlateEdge[]; inside: boolean };

/**
 * Ce que touche un point (px de la photo affichée `W × H`) selon le mode, ou null s'il ne touche pas le cadre.
 * - Déplacer : dans le cadre, ou à 11 px de son bord.
 * - Rotation : sur le bouton de la tige (au-dessus du cadre, ou dessous s'il est collé en haut) ; dans le cadre, un
 *   toucher change seulement de mode.
 * - Taille : à 22 px d'un bord, de chaque côté ; près d'un coin, ses deux bords. Sur un cadre plus étroit que deux
 *   zones, le côté l'emporte dans sa hauteur (le haut et le bas s'attrapent au-dessus et au-dessous).
 */
export function plateFrameHit(
  r: PlateRect,
  px: number,
  py: number,
  W: number,
  H: number,
  mode: PlateFrameMode,
  offset = PLATE_ROTATE_HANDLE_OFFSET,
): PlateFrameHit | null {
  const g = frameGeometry(r, W, H);
  const cos = Math.cos(g.a);
  const sin = Math.sin(g.a);
  const lx = (px - g.cx) * cos + (py - g.cy) * sin;
  const ly = -(px - g.cx) * sin + (py - g.cy) * cos;
  const inside = Math.abs(lx) <= g.hw && Math.abs(ly) <= g.hh;
  let kind: PlateFrameMode | null = null;
  const edges: PlateEdge[] = [];
  if (mode === "move") {
    if (Math.abs(lx) <= g.hw + PLATE_EDGE_HIT / 2 && Math.abs(ly) <= g.hh + PLATE_EDGE_HIT / 2) kind = "move";
  } else if (mode === "rotate") {
    const ky = (rotateKnobBelow(r, H, offset) ? 1 : -1) * (g.hh + offset);
    if (Math.hypot(lx, ly - ky) <= PLATE_ROTATE_KNOB_HIT) kind = "rotate";
  } else {
    const T = PLATE_EDGE_HIT;
    const dl = Math.abs(lx + g.hw);
    const dr = Math.abs(lx - g.hw);
    const dt = Math.abs(ly + g.hh);
    const db = Math.abs(ly - g.hh);
    let side = Math.min(dl, dr) <= T && Math.abs(ly) <= g.hh + T;
    let end = Math.min(dt, db) <= T && Math.abs(lx) <= g.hw + T;
    if (side && end) {
      // Cadre plus étroit que deux zones (une plaque fait souvent 30 px de haut) : dans sa hauteur, on tient le côté ;
      // le haut et le bas s'attrapent au-dessus et au-dessous. Un coin, hors du cadre, tient ses deux bords.
      if (g.hh < T && Math.abs(ly) <= g.hh) end = false;
      if (g.hw < T && Math.abs(lx) <= g.hw) side = false;
      if (!side && !end) side = Math.min(dl, dr) <= Math.min(dt, db);
      if (!side && !end) end = true;
    }
    if (side) edges.push(dl < dr ? "l" : "r");
    if (end) edges.push(dt < db ? "t" : "b");
    if (edges.length) kind = "size";
  }
  if (!kind && !inside) return null;
  return { kind, edges, inside };
}

/**
 * Tire un ou deux bords du cadre (Taille) de `dx, dy` px : le bord opposé reste fixe, en suivant les axes du cadre s'il
 * est tourné. Borné à la taille minimale ; un cadre droit s'arrête au bord de la photo, un cadre tourné reste dans
 * l'image (le rectangle avant rotation, comme `resizeOrientedPlateFrame`).
 */
export function resizePlateFrameEdges(
  start: PlateRect,
  edges: readonly PlateEdge[],
  dx: number,
  dy: number,
  W: number,
  H: number,
): PlateRect {
  const g = frameGeometry(start, W, H);
  const cos = Math.cos(g.a);
  const sin = Math.sin(g.a);
  const lx = dx * cos + dy * sin;
  const ly = -dx * sin + dy * cos;
  const minW = PLATE_FRAME_MIN_W * W;
  const minH = PLATE_FRAME_MIN_H * H;
  let L = -g.hw;
  let R = g.hw;
  let T = -g.hh;
  let B = g.hh;
  const upright = !start.angle;
  if (edges.includes("l")) L = clamp(L + lx, upright ? -g.cx : R - W, R - minW);
  if (edges.includes("r")) R = clamp(R + lx, L + minW, upright ? W - g.cx : L + W);
  if (edges.includes("t")) T = clamp(T + ly, upright ? -g.cy : B - H, B - minH);
  if (edges.includes("b")) B = clamp(B + ly, T + minH, upright ? H - g.cy : T + H);
  const mx = (L + R) / 2;
  const my = (T + B) / 2;
  const cx = g.cx + mx * cos - my * sin;
  const cy = g.cy + mx * sin + my * cos;
  const w = Math.min(1, (R - L) / W);
  const h = Math.min(1, (B - T) / H);
  return {
    x: round(clamp(cx / W - w / 2, 0, 1 - w)),
    y: round(clamp(cy / H - h / 2, 0, 1 - h)),
    w: round(w),
    h: round(h),
    ...(start.angle ? { angle: start.angle } : {}),
  };
}
