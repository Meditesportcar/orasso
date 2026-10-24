// Gestes du cadre de plaque dans l'appli (lot 59c, tour 2 des relectures ; lot R4a, maquette R4.1 : le cadre par modes,
// plus de poignées ni de gestes à deux doigts) : logique pure, testée seule. Les modes, les bords et la tige sont dans
// `@orasso/shared` (`plateFrameHit`, `resizePlateFrameEdges`), communs avec le site.
import {
  dragRotatePlateFrame,
  movePlateFrame,
  type PlateEdge,
  type PlateFrameHit,
  type PlateFrameMode,
  type PlateRect,
  plateFrameHit,
  resizePlateFrameEdges,
  rotateKnobBelow,
} from "@orasso/shared";

/** Loupe : diamètre (px) et grossissement (maquette 1.4, ×2,5). */
export const LOUPE_SIZE = 112;
export const LOUPE_ZOOM = 2.5;

/** Bords tenus en un nombre (bits l, r, t, b) : lisible par un style animé sur le fil UI, sans tableau. */
export const EDGE_BITS: Record<PlateEdge, number> = { l: 1, r: 2, t: 4, b: 8 };
export const edgeMask = (edges: readonly PlateEdge[]): number => edges.reduce((m, e) => m | EDGE_BITS[e], 0);

/**
 * Le cadre que touche le doigt (px de la photo affichée), le dernier posé d'abord (il est dessiné au-dessus) ; un
 * cadre dont le mode prend le geste passe avant un cadre seulement touché.
 */
export function pickPlateFrame(
  rects: readonly PlateRect[],
  px: number,
  py: number,
  W: number,
  H: number,
  mode: PlateFrameMode,
): (PlateFrameHit & { index: number }) | null {
  let touched: (PlateFrameHit & { index: number }) | null = null;
  for (let i = rects.length - 1; i >= 0; i--) {
    const r = rects[i];
    if (!r) continue;
    const hit = plateFrameHit(r, px, py, W, H, mode);
    if (!hit) continue;
    if (hit.kind) return { ...hit, index: i };
    touched ??= { ...hit, index: i };
  }
  return touched;
}

/** Le cadre pendant le geste du mode (`dx, dy` : px depuis le début du geste). */
export function dragPlateFrame(
  start: PlateRect,
  kind: PlateFrameMode,
  edges: readonly PlateEdge[],
  dx: number,
  dy: number,
  W: number,
  H: number,
): PlateRect {
  if (kind === "move") return movePlateFrame(start, dx / W, dy / H);
  if (kind === "rotate") return dragRotatePlateFrame(start, dx, dy, H, undefined, rotateKnobBelow(start, H));
  return resizePlateFrameEdges(start, edges, dx, dy, W, H);
}

/**
 * Place de la loupe dans la photo (px) : centrée au-dessus du doigt, en dessous quand on est en haut de la photo, et
 * toujours dans la photo.
 */
export function loupePlace(px: number, py: number, boxW: number, boxH: number, sizeArg?: number, gapArg?: number) {
  "worklet";
  // Appelée sur le fil UI (style animé de la loupe) : pas d'appel à une fonction JS ordinaire ici. Les valeurs par
  // défaut se posent dans le corps : une constante de module en valeur par défaut d'un paramètre n'est pas capturée par
  // le plugin Reanimated (plantage « Property 'LOUPE_SIZE' doesn't exist » sur le Xiaomi, 24/10).
  const size = sizeArg ?? LOUPE_SIZE;
  const gap = gapArg ?? 52;
  const left = Math.min(Math.max(6, boxW - size - 6), Math.max(6, px - size / 2));
  const above = py - size - gap;
  const top = above >= 6 ? above : Math.min(Math.max(6, boxH - size - 6), Math.max(6, py + gap));
  return { left, top };
}
