// Cadrage d'une story 9:16 (lot R7f1, ARCHITECTURE-R7 § 2.5 et § 3). L'appli montre un aperçu : la photo posée dans un
// canevas de 1080 × 1920, qu'on déplace et qu'on zoome ; derrière, la même photo en couverture, floutée et assombrie.
// Le serveur refait exactement ce rendu avec sharp (un seul rendu) et transforme les rectangles de plaque, donnés dans
// la photo d'origine, vers le rendu final avant de les flouter. Pur et testé : aucune dépendance.

/** Taille du rendu final d'une story, en pixels. */
export const STORY_W = 1080;
export const STORY_H = 1920;

/**
 * Cadrage de la photo dans le canevas. `scale` est relatif à « tenir en entier » : 1 = la photo tient entière dans le
 * canevas (bandes floutées sur les côtés d'une photo paysage), plus grand = zoom. Relatif, donc indépendant de la
 * taille en pixels (l'appli envoie un cadrage calculé sur la photo d'origine, le serveur travaille sur la photo
 * recompressée à 2048 px : même forme, autre taille). `offsetX` / `offsetY` : décalage du centre de la photo par
 * rapport au centre du canevas, en pixels du canevas (1080 × 1920).
 */
export type Frame = { scale: number; offsetX: number; offsetY: number };

/** Zoom permis : du « tenir en entier » à quatre fois plus. */
export const STORY_SCALE_MIN = 1;
export const STORY_SCALE_MAX = 4;
/** Décalage permis au-delà du canevas : la photo ne sort jamais complètement. */
export const STORY_OFFSET_MAX = 2000;

/** Rectangle de plaque dans la photo (fractions 0–1, rotation en degrés) : même forme que `PlateRect`. */
export type FrameRect = { x: number; y: number; w: number; h: number; angle?: number };

/** Zone de la photo dans le canevas, en pixels (peut déborder du canevas quand on zoome). */
export type CanvasBox = { left: number; top: number; width: number; height: number };

/** Cadrage par défaut : la photo tient entière, centrée. */
export function fitDefault(_w: number, _h: number): Frame {
  return { scale: 1, offsetX: 0, offsetY: 0 };
}

/** Échelle (relative) qui fait remplir tout le canevas : le « plein cadre » de l'aperçu. */
export function coverScale(w: number, h: number): number {
  if (w <= 0 || h <= 0) return 1;
  const contain = Math.min(STORY_W / w, STORY_H / h);
  const cover = Math.max(STORY_W / w, STORY_H / h);
  return cover / contain;
}

/** Ramène un cadrage dans ses bornes (valeurs non finies comprises). */
export function clampFrame(frame: Frame): Frame {
  const fin = (v: number, fallback: number) => (Number.isFinite(v) ? v : fallback);
  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
  return {
    scale: clamp(fin(frame.scale, 1), STORY_SCALE_MIN, STORY_SCALE_MAX),
    offsetX: clamp(fin(frame.offsetX, 0), -STORY_OFFSET_MAX, STORY_OFFSET_MAX),
    offsetY: clamp(fin(frame.offsetY, 0), -STORY_OFFSET_MAX, STORY_OFFSET_MAX),
  };
}

/** Où la photo (`srcW × srcH`) se pose dans le canevas pour ce cadrage, en pixels du canevas. */
export function frameToCanvas(frame: Frame, srcW: number, srcH: number): CanvasBox {
  const base = Math.min(STORY_W / srcW, STORY_H / srcH);
  const width = srcW * base * frame.scale;
  const height = srcH * base * frame.scale;
  return {
    left: STORY_W / 2 + frame.offsetX - width / 2,
    top: STORY_H / 2 + frame.offsetY - height / 2,
    width,
    height,
  };
}

/**
 * Transforme un rectangle de plaque, des fractions de la photo d'origine vers des fractions du canevas final. La
 * mise à l'échelle est la même sur les deux axes : l'angle (rotation dans le repère des pixels) ne change pas.
 */
export function mapRect(rect: FrameRect, frame: Frame, src: { width: number; height: number }): FrameRect {
  const box = frameToCanvas(frame, src.width, src.height);
  const out: FrameRect = {
    x: (box.left + rect.x * box.width) / STORY_W,
    y: (box.top + rect.y * box.height) / STORY_H,
    w: (rect.w * box.width) / STORY_W,
    h: (rect.h * box.height) / STORY_H,
  };
  if (rect.angle) out.angle = rect.angle;
  return out;
}

/** Vrai si une partie du rectangle (centre et demi-diagonale, pour un cadre tourné) tombe dans le canevas. */
export function rectIntersectsCanvas(rect: FrameRect): boolean {
  const cx = (rect.x + rect.w / 2) * STORY_W;
  const cy = (rect.y + rect.h / 2) * STORY_H;
  const hw = (rect.w * STORY_W) / 2;
  const hh = (rect.h * STORY_H) / 2;
  const reach = Math.hypot(hw, hh);
  return cx + reach > 0 && cx - reach < STORY_W && cy + reach > 0 && cy - reach < STORY_H;
}

/** Les rectangles transformés qui touchent encore le canevas (les autres sortent du cadre : rien à flouter). */
export function mapRects<T extends FrameRect>(
  rects: readonly T[],
  frame: Frame,
  src: { width: number; height: number },
) {
  return rects.map((r) => mapRect(r, frame, src)).filter(rectIntersectsCanvas);
}

// --- Ajuster une photo de la galerie (lot R7f3) ------------------------------------------------------------------------
// L'écran « Ajuster » (appli : pince et glissement ; site : molette et souris) calcule le même `Frame` que le serveur lit :
// ces fonctions pures le tiennent dans ses bornes et disent dans quel état il est (maquette R7.22 : posée, ajustée, remplie).

/** Une image déjà en 9:16 (à un centième près : 1080 × 1920, 720 × 1280, un recadrage de l'appareil) n'a rien à ajuster. */
export const isStoryRatio = (w: number, h: number): boolean => h > 0 && Math.abs(w / h - STORY_W / STORY_H) < 0.012;

// `+ 0` : un « -0 » (borne nulle) redevient 0.
const within = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v)) + 0;

/**
 * Cadrage dans ses bornes de zoom, et déplacement borné pour que la photo ne sorte jamais « à moitié » : d'un axe où elle
 * dépasse le canevas, ses bords ne laissent aucun vide (le fond flouté ne se voit pas là) ; d'un axe où elle est plus petite,
 * elle reste dans le canevas. `w` et `h` : la photo d'origine.
 */
export function limitFrame(frame: Frame, w: number, h: number): Frame {
  const f = clampFrame(frame);
  const box = frameToCanvas({ ...f, offsetX: 0, offsetY: 0 }, w, h);
  const room = (size: number, canvas: number) => Math.abs(size - canvas) / 2;
  const rx = room(box.width, STORY_W);
  const ry = room(box.height, STORY_H);
  return { scale: f.scale, offsetX: within(f.offsetX, -rx, rx), offsetY: within(f.offsetY, -ry, ry) };
}

/** Le plus fort zoom qui tient dans les bornes : « remplir » si la photo peut remplir le canevas (sinon le zoom maximal). */
export const fillScale = (w: number, h: number): number => Math.min(coverScale(w, h), STORY_SCALE_MAX);

/** « Remplir » : la photo couvre tout le canevas, centrée (jusqu'à la limite de zoom). */
export const fillFrame = (w: number, h: number): Frame => ({ scale: fillScale(w, h), offsetX: 0, offsetY: 0 });

export type FrameState = "fit" | "adjusted" | "full";

/**
 * Les trois états de la maquette : `fit` (posée : la photo entière sur son fond flouté, rien n'a bougé), `full` (remplie :
 * 9:16 sans bande), `adjusted` (entre les deux, ou déplacée).
 */
export function frameState(frame: Frame, w: number, h: number): FrameState {
  const f = clampFrame(frame);
  const cover = fillScale(w, h);
  if (cover > 1.01 && f.scale >= cover - 0.01) return "full";
  if (Math.abs(f.scale - 1) < 0.01 && Math.abs(f.offsetX) < 1 && Math.abs(f.offsetY) < 1) return "fit";
  return "adjusted";
}

/** « Zoom 62 % » : où l'on en est entre « posée » (0) et « remplie » (100). Une photo qui remplit déjà : 100. */
export function zoomPercent(frame: Frame, w: number, h: number): number {
  const cover = fillScale(w, h);
  if (cover <= 1.01) return 100;
  return Math.round(within((clampFrame(frame).scale - 1) / (cover - 1), 0, 1) * 100);
}

/**
 * Le cadrage après un geste : `ratio` = rapport des écartements des doigts (ou cran de molette) depuis le début du geste ;
 * (`dx`, `dy`) = glissement en pixels du canevas final (1080 × 1920), pas de l'écran. Zoom autour du centre du canevas.
 */
export function moveFrame(start: Frame, ratio: number, dx: number, dy: number, w: number, h: number): Frame {
  const r = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  const mx = Number.isFinite(dx) ? dx : 0;
  const my = Number.isFinite(dy) ? dy : 0;
  return limitFrame({ scale: start.scale * r, offsetX: start.offsetX * r + mx, offsetY: start.offsetY * r + my }, w, h);
}

/** Pixels de l'écran → pixels du canevas final, pour un aperçu de `viewWidth` pixels de large. */
export const canvasPerView = (viewWidth: number): number => (viewWidth > 0 ? STORY_W / viewWidth : 1);
