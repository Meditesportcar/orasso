// Géométrie pure du O vivant et du fond « battle » (lot 39) : aucune dépendance à React ni à Reanimated, testée dans
// olive.test.ts, partagée par le natif (fil graphique : les fonctions appelées image par image sont des worklets) et
// par le site (SVG animé). Repère écran : x vers la droite, y vers le bas, angles en radians (sens horaire positif).
//
// Règles du drift validées par Damien (« on n'y touche plus », prototype v9) : la meute entre par n'importe quel bord,
// enchaîne 2 à 6 virages (gauche-droite surtout), puis une grande courbe de glisse jusqu'à sortir de l'écran ; jamais de
// ligne droite à la fin ; le nez pointe vers l'intérieur du virage d'après la courbure signée.

import { olive } from "../../motion";

/** Pose d'une voiture : position, cap du nez, dérive (cap − tangente) et braquage des roues avant. */
export type Pose = { x: number; y: number; heading: number; slip: number; steer: number };

/** Trajectoire échantillonnée tous les `step` px : position, tangente `hs`, courbure signée `ks`, dérive lissée `bs`. */
export type BattlePath = {
  xs: number[];
  ys: number[];
  hs: number[];
  ks: number[];
  bs: number[];
  step: number;
  /** Longueur totale en px. */
  length: number;
  /** Indice du premier point de la courbe finale (jamais droite). */
  finalFrom: number;
};

/** Une voiture de la meute : retard le long de la trajectoire (px) et décalage latéral (px). */
export type PackCar = { lag: number; side: number };

const TAU = Math.PI * 2;
const STEP = 2;
const SLIP = olive.slip;
const STEER = (olive.steer * Math.PI) / 180;
/** Départ du tour autour du O : en bas (comme le prototype), sens horaire. */
const ORBIT_START = Math.PI / 2;
/** Marge hors écran au départ et à l'arrivée d'une meute, en px. */
const OUTSIDE = 60;
/** Croissance du rayon de la courbe finale par px parcouru : elle s'ouvre et finit toujours par sortir. */
const SPIRAL = 0.6;
/** Part minimale de la courbe finale dans la trajectoire (la règle « jamais de ligne droite à la fin » sur 20 %). */
const FINAL_SHARE = 0.22;
/** Lissage de la dérive le long de la trajectoire (inertie de la caisse), par pas de 2 px. */
const SLIP_FOLLOW = 0.055;
/** La dérive atteint son plein (contre-braquage complet) à 0,45 rad. */
const FULL_SLIP = 0.45;

/** Générateur pseudo-aléatoire déterministe (mulberry32) : même `seed`, même trajectoire. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Le drift autour du O : `t` en tours (0 → 1 = un tour, au-delà ça continue), cercle de rayon `radius` écrasé
 * verticalement de `squash` (le O est plus large que haut). Le nez pointe vers l'intérieur du virage, les roues avant
 * contre-braquent de −18°.
 */
export function driftOrbit(t: number, radius: number, squash = 1): Pose {
  "worklet";
  const a = ORBIT_START + TAU * t;
  const ry = radius * squash;
  const tangent = Math.atan2(ry * Math.cos(a), -radius * Math.sin(a));
  return { x: radius * Math.cos(a), y: ry * Math.sin(a), heading: tangent + SLIP, slip: SLIP, steer: STEER };
}

/** Le même tour en chemin SVG (départ en bas, sens horaire), pour animateMotion sur le site. */
export function orbitPathD(radius: number, squash = 1): string {
  const ry = radius * squash;
  const r = (n: number) => Math.round(n * 100) / 100;
  return `M0 ${r(ry)}A${r(radius)} ${r(ry)} 0 1 1 0 ${r(-ry)}A${r(radius)} ${r(ry)} 0 1 1 0 ${r(ry)}Z`;
}

function buildAttempt(random: () => number, w: number, h: number): BattlePath {
  const between = (a: number, b: number) => a + random() * (b - a);
  const edge = Math.floor(random() * 4);
  let x: number;
  let y: number;
  let heading: number;
  if (edge === 0) {
    x = -OUTSIDE;
    y = between(h * 0.15, h * 0.85);
    heading = between(-0.4, 0.4);
  } else if (edge === 1) {
    x = w + OUTSIDE;
    y = between(h * 0.15, h * 0.85);
    heading = Math.PI + between(-0.4, 0.4);
  } else if (edge === 2) {
    x = between(w * 0.15, w * 0.85);
    y = -OUTSIDE;
    heading = Math.PI / 2 + between(-0.4, 0.4);
  } else {
    x = between(w * 0.15, w * 0.85);
    y = h + OUTSIDE;
    heading = -Math.PI / 2 + between(-0.4, 0.4);
  }
  const xs: number[] = [x];
  const ys: number[] = [y];
  const hs: number[] = [heading];
  const ks: number[] = [0];
  const inside = (m: number) => x > -m && x < w + m && y > -m && y < h + m;
  const advance = (k: number) => {
    heading += k * STEP;
    x += Math.cos(heading) * STEP;
    y += Math.sin(heading) * STEP;
    xs.push(x);
    ys.push(y);
    hs.push(heading);
    ks.push(k);
  };
  const run = (length: number, k: number) => {
    for (let d = 0; d < length; d += STEP) advance(k);
  };
  // Sens qui ramène vers le centre de l'écran.
  const toCenter = () => Math.sign(Math.cos(heading) * (h / 2 - y) - Math.sin(heading) * (w / 2 - x)) || 1;

  let guard = 0;
  while (!inside(0) && guard++ < 400) advance(0);
  run(between(20, 70), 0);
  const corners = 2 + Math.floor(random() * 5);
  let dir = toCenter();
  for (let c = 0; c < corners; c++) {
    const nearEdge = x < w * 0.18 || x > w * 0.82 || y < h * 0.12 || y > h * 0.88;
    if (c > 0) dir = nearEdge ? toCenter() : random() < 0.75 ? -dir : dir;
    const radius = between(60, 140);
    run(between(0.9, 2.1) * radius, dir / radius);
    // Un court bout droit entre deux virages, jamais avant la courbe finale.
    if (c < corners - 1 && random() < 0.45) run(between(10, 40), 0);
    if (c >= 1 && !inside(-10)) break;
  }
  // La grande courbe de glisse : un rayon qui s'ouvre (170 à 300 px au départ) jusqu'à sortir de l'écran.
  const finalFrom = xs.length;
  const startRadius = between(170, 300);
  const side = random() < 0.5 ? 1 : -1;
  let travelled = 0;
  guard = 0;
  while (inside(OUTSIDE + 10) && guard++ < 4000) {
    advance(side / (startRadius + SPIRAL * travelled));
    travelled += STEP;
  }
  // La dérive suit la courbure avec l'inertie de la caisse : le nez vers l'intérieur du virage.
  const bs: number[] = [];
  let slip = 0;
  for (const k of ks) {
    const target = k === 0 ? 0 : Math.sign(k) * Math.min(0.8, 0.5 + 18 * Math.abs(k));
    slip += (target - slip) * SLIP_FOLLOW;
    bs.push(slip);
  }
  return { xs, ys, hs, ks, bs, step: STEP, length: (xs.length - 1) * STEP, finalFrom };
}

/**
 * Une meute de battle sur un écran de `w` × `h` px : entrée par un bord quelconque, 2 à 6 virages, grande courbe finale
 * jusqu'à sortir. Déterministe par `seed`. Si la courbe finale est trop courte (la meute est sortie pendant un virage),
 * on reprend avec une graine dérivée : la règle « pas de ligne droite sur les 20 derniers % » tient toujours.
 */
export function battlePath(seed: number, w: number, h: number): BattlePath {
  let best: BattlePath | null = null;
  for (let attempt = 0; attempt < 24; attempt++) {
    const path = buildAttempt(seededRandom(seed + attempt * 0x9e3779b1), w, h);
    const share = (path.xs.length - path.finalFrom) / path.xs.length;
    if (share >= FINAL_SHARE) return path;
    if (!best || share > (best.xs.length - best.finalFrom) / best.xs.length) best = path;
  }
  return best as BattlePath;
}

/** Signe de la courbure à la fraction `t` (0 → 1) de la trajectoire : 1 virage à droite, −1 à gauche, 0 droit. */
export function curvatureSign(path: BattlePath, t: number): -1 | 0 | 1 {
  "worklet";
  const i = Math.max(0, Math.min(path.ks.length - 1, Math.round(t * (path.ks.length - 1))));
  const k = path.ks[i] ?? 0;
  return k > 0 ? 1 : k < 0 ? -1 : 0;
}

/** Pose sur la trajectoire à `s` px du départ (bornée aux extrémités), décalée de `side` px vers la droite du cap. */
export function poseAt(path: BattlePath, s: number, side = 0): Pose {
  "worklet";
  const last = path.xs.length - 1;
  const f = Math.max(0, Math.min(last, s / path.step));
  const i = Math.min(last - 1, Math.floor(f));
  const u = f - i;
  const lerp = (a: number[], j: number) => (a[j] ?? 0) + ((a[j + 1] ?? 0) - (a[j] ?? 0)) * u;
  const h = lerp(path.hs, i);
  const slip = lerp(path.bs, i);
  const k = path.ks[i] ?? 0;
  return {
    x: lerp(path.xs, i) - Math.sin(h) * side,
    y: lerp(path.ys, i) + Math.cos(h) * side,
    heading: h + slip,
    slip,
    // Contre-braquage : opposé au virage, plein quand la dérive atteint 0,45 rad.
    steer: k === 0 ? 0 : -Math.sign(k) * Math.abs(STEER) * Math.min(1, Math.abs(slip) / FULL_SLIP),
  };
}

/**
 * La meute en tandem : chaque poursuivant suit la même trajectoire à distance constante `gap` (le long de la
 * trajectoire), légèrement décalé sur le côté pour ne pas rouler dans les traces de celui qu'il chasse.
 */
export function tandem(path: BattlePath, gap: number, count = 2): PackCar[] {
  const cars: PackCar[] = [];
  const room = Math.max(0, path.length);
  for (let i = 0; i < count; i++) cars.push({ lag: Math.min(room, i * gap), side: i === 0 ? -3 : i % 2 ? 3 : -3 });
  return cars;
}

/** Durée d'une meute (ms) à `speed` px/s : le dernier poursuivant doit avoir fini la trajectoire. */
export function battleDuration(path: BattlePath, cars: readonly PackCar[], speed: number): number {
  const lag = cars.reduce((m, c) => Math.max(m, c.lag), 0);
  return ((path.length + lag) / speed) * 1000;
}

/** La trajectoire en chemin SVG (un point sur trois suffit à l'œil), pour animateMotion sur le site. */
export function battlePathD(path: BattlePath): string {
  const r = (n: number) => Math.round(n * 10) / 10;
  const parts: string[] = [];
  for (let i = 0; i < path.xs.length; i += 3) parts.push(`${i === 0 ? "M" : "L"}${r(path.xs[i] ?? 0)} ${r(path.ys[i] ?? 0)}`);
  const last = path.xs.length - 1;
  if (last % 3 !== 0) parts.push(`L${r(path.xs[last] ?? 0)} ${r(path.ys[last] ?? 0)}`);
  return parts.join("");
}

/** La dérive échantillonnée en `n` points réguliers (degrés), pour une rotation animée le long du chemin SVG. */
export function slipSamples(path: BattlePath, n: number): number[] {
  const out: number[] = [];
  for (let j = 0; j < n; j++) {
    const i = Math.round((j / (n - 1)) * (path.bs.length - 1));
    out.push(Math.round(((path.bs[i] ?? 0) * 180) / Math.PI));
  }
  return out;
}
