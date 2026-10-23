// Recadrage carré (lot M1, maquette 1.2) : le calcul, sans React (testé par `squareCrop.test.ts`). Le cadre carré est
// fixe ; la photo est posée dessous « en couverture » (zoom 1 : son petit côté remplit le cadre), on la glisse et on la
// zoome (1 à MAX_ZOOM). Le cadre ne sort jamais de la photo. Le résultat est un carré normalisé dans la photo d'origine
// (`SquareCrop` : coin haut gauche en fractions de la largeur et de la hauteur, côté en fraction de la largeur).

export type SquareCrop = { x: number; y: number; size: number };
export type CropView = { zoom: number; tx: number; ty: number };

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 2.5;
/** Pas des boutons − et + (maquette : ×1,0 à ×2,5 en six crans). */
export const ZOOM_STEP = 0.25;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Échelle de la photo à l'écran pour un cadre de `frame` px et un zoom donné (photo en couverture du carré). */
export function displayScale(w: number, h: number, frame: number, zoom: number): number {
  const short = Math.max(1, Math.min(w, h));
  return (frame / short) * zoom;
}

/** Décalage permis (px, depuis le centre du cadre) : le cadre reste dans la photo. */
export function clampView(w: number, h: number, frame: number, view: CropView): CropView {
  const zoom = clamp(view.zoom, MIN_ZOOM, MAX_ZOOM);
  const s = displayScale(w, h, frame, zoom);
  const mx = Math.max(0, (w * s - frame) / 2);
  const my = Math.max(0, (h * s - frame) / 2);
  return { zoom, tx: clamp(view.tx, -mx, mx) || 0, ty: clamp(view.ty, -my, my) || 0 };
}

/** Le carré découpé dans la photo d'origine pour cette vue. */
export function cropFromView(w: number, h: number, frame: number, view: CropView): SquareCrop {
  const v = clampView(w, h, frame, view);
  const s = displayScale(w, h, frame, v.zoom);
  const side = Math.min(frame / s, w, h);
  const cx = w / 2 - v.tx / s;
  const cy = h / 2 - v.ty / s;
  const x = clamp(cx - side / 2, 0, w - side);
  const y = clamp(cy - side / 2, 0, h - side);
  return { x: x / w, y: y / h, size: side / w };
}

/** La vue qui montre ce carré (pour rouvrir le recadrage où on l'avait laissé). */
export function viewFromCrop(w: number, h: number, frame: number, crop: SquareCrop): CropView {
  const side = Math.max(1, crop.size * w);
  const zoom = clamp(Math.min(w, h) / side, MIN_ZOOM, MAX_ZOOM);
  const s = displayScale(w, h, frame, zoom);
  const cx = crop.x * w + side / 2;
  const cy = crop.y * h + side / 2;
  return clampView(w, h, frame, { zoom, tx: (w / 2 - cx) * s, ty: (h / 2 - cy) * s });
}

/** Carré centré (le cadrage par défaut d'une photo importée). */
export function centerCrop(w: number, h: number): SquareCrop {
  const side = Math.min(w, h);
  return { x: (w - side) / 2 / w, y: (h - side) / 2 / h, size: side / w };
}

/** Le carré en pixels (pour l'outil de découpe), entiers et dans la photo. */
export function cropPixels(w: number, h: number, crop: SquareCrop) {
  const side = Math.max(1, Math.min(Math.round(crop.size * w), w, h));
  const originX = clamp(Math.round(crop.x * w), 0, w - side);
  const originY = clamp(Math.round(crop.y * h), 0, h - side);
  return { originX, originY, width: side, height: side };
}

/**
 * Où montrer la photo d'origine dans une vignette carrée pour qu'elle corresponde au carré (aperçu en direct) :
 * taille et position de l'image, en fractions du côté de la vignette.
 */
export function previewPlacement(w: number, h: number, crop: SquareCrop) {
  const side = crop.size * w;
  const k = 1 / side;
  return { width: w * k, height: h * k, left: -crop.x * w * k, top: -crop.y * h * k };
}

/** Zoom après un pincement : rapport des écarts entre les deux doigts. */
export const pinchZoom = (start: number, startDistance: number, distance: number) =>
  clamp(startDistance > 0 ? (start * distance) / startDistance : start, MIN_ZOOM, MAX_ZOOM);

/** Zoom suivant ou précédent des boutons − et +. */
export const stepZoom = (zoom: number, dir: 1 | -1) =>
  clamp(Math.round((zoom + dir * ZOOM_STEP) / ZOOM_STEP) * ZOOM_STEP, MIN_ZOOM, MAX_ZOOM);
