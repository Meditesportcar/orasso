// Le chemin de la Supra sur le plan du parking (diapo 4 de l'exposant) : géométrie pure, testée seule.
// Repère du plan : 300 × 210, l'axe y descend ; la voiture a le nez à droite à 0°, un angle positif tourne vers le bas.

export const PLAN_W = 300;
export const PLAN_H = 210;

/** Le chemin : de l'entrée jusqu'à la place, en trois segments (vers le haut, vers la gauche, vers le haut). */
export const PATH: readonly (readonly [number, number])[] = [
  [150, 200],
  [150, 128],
  [72, 128],
  [72, 78],
];

/** Les cases du plan : la place de l'exposant (zone JDM) est le bout du chemin. */
export const PLACE = { x: 40, y: 32, w: 64, h: 72 } as const;

const lengths = PATH.slice(1).map(([x, y], i) => {
  const [px = 0, py = 0] = PATH[i] ?? [0, 0];
  return Math.hypot(x - px, y - py);
});
const total = lengths.reduce((a, b) => a + b, 0);

/** Part du trajet à chaque sommet (0 → 1). */
export const stops = PATH.map((_, i) => lengths.slice(0, i).reduce((a, b) => a + b, 0) / total);
export const xs = PATH.map(([x]) => x);
export const ys = PATH.map(([, y]) => y);

const corner1 = stops[1] ?? 0;
const corner2 = stops[2] ?? 0;
/** Fin d'un virage : la voiture dépasse son cap (elle glisse), puis se redresse. */
const SLIDE = 0.05;

/**
 * Cap de la voiture le long du trajet, en degrés. Vers le haut = −90, vers la gauche = −180. Au premier virage (à gauche)
 * elle dépasse jusqu'à −195 puis revient ; au second (à droite, de « gauche » à « haut ») elle dépasse jusqu'à −75 puis
 * revient à −90 : elle se gare le nez vers le haut.
 */
export const headStops = [
  0,
  corner1,
  corner1 + SLIDE,
  corner1 + 2 * SLIDE,
  corner2,
  corner2 + SLIDE,
  corner2 + 2 * SLIDE,
  1,
];
export const headings = [-90, -90, -195, -180, -180, -75, -90, -90];

/** Interpolation linéaire par morceaux (la même que `interpolate` de Reanimated, sans dépendance). */
export function lerpAt(at: number, from: readonly number[], to: readonly number[]): number {
  if (at <= (from[0] ?? 0)) return to[0] ?? 0;
  for (let i = 1; i < from.length; i++) {
    const a = from[i - 1] ?? 0;
    const b = from[i] ?? 1;
    if (at <= b) {
      const k = b === a ? 1 : (at - a) / (b - a);
      return (to[i - 1] ?? 0) + ((to[i] ?? 0) - (to[i - 1] ?? 0)) * k;
    }
  }
  return to[to.length - 1] ?? 0;
}

/** Cap, position de la voiture au point `p` (0 → 1) du trajet. */
export function poseAtProgress(p: number) {
  return { x: lerpAt(p, stops, xs), y: lerpAt(p, stops, ys), heading: lerpAt(p, headStops, headings) };
}
