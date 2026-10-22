// La fumée des voitures qui driftent (lot C8, artefact DA v2) : géométrie pure des bouffées, sans React. Chaque voiture a
// un pool fixe de bouffées recyclées : la bouffée n° `slot` renaît toutes les `life` ms, décalée de `life / count`, à la
// roue arrière de la voiture au moment de sa naissance, puis recule, grossit et s'efface. Aucune création ni destruction
// image par image : tout se calcule depuis l'horloge, sur le fil graphique (worklets).

import { smoke } from "../../motion";

export type SmokeSpec = (typeof smoke)["battle"] | (typeof smoke)["orbit"];

/** Naissance (ms), âge (ms, −1 avant la première naissance) et cycle de la bouffée `slot` à l'instant `now` (ms). */
export function puffClock(slot: number, count: number, life: number, now: number) {
  "worklet";
  const offset = (slot * life) / count;
  if (now < offset) return { born: 0, age: -1, cycle: 0 };
  const cycle = Math.floor((now - offset) / life);
  const born = offset + cycle * life;
  return { born, age: now - born, cycle };
}

/** Bruit déterministe dans [0, 1) : la dispersion d'une bouffée reste la même pendant toute sa vie. */
export function noise(a: number, b: number): number {
  "worklet";
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Roue arrière (`side` −1 ou 1) d'une voiture centrée en (x, y), de cap `heading`, de `length` × `width` px. */
export function rearWheel(
  spec: SmokeSpec,
  x: number,
  y: number,
  heading: number,
  length: number,
  width: number,
  side: number,
) {
  "worklet";
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  return {
    x: x - c * length * spec.wheelBack - s * width * spec.wheelSide * side,
    y: y - s * length * spec.wheelBack + c * width * spec.wheelSide * side,
  };
}

/**
 * Une bouffée d'âge `age` ms née en (wx, wy) derrière une voiture de cap `heading` : position, rayon (px) et opacité
 * (avant la densité du pool). `unit` : px par unité (vitesses et rayons autour du O ; 1 pour le fond), `k` : échelle des
 * rayons. `n1`, `n2` : dispersion (bruit dans [0, 1)).
 */
export function puffState(
  spec: SmokeSpec,
  age: number,
  wx: number,
  wy: number,
  heading: number,
  n1: number,
  n2: number,
  unit = 1,
  k = 1,
) {
  "worklet";
  const a = age / 1000;
  const vx = (-Math.cos(heading) * spec.speed + (n1 - 0.5) * spec.spread) * unit;
  const vy = (-Math.sin(heading) * spec.speed + (n2 - 0.5) * spec.spread) * unit;
  return {
    x: wx + vx * a,
    y: wy + vy * a,
    r: (spec.radius + spec.grow * a) * unit * k,
    alpha: Math.max(0, 1 - age / spec.life) * spec.alpha,
  };
}

/**
 * Le style d'une bouffée du pool (natif) : née entre les deux roues arrière (`axle`), étirée le long de la trace
 * (`tangent`) sur `gap` px, la distance parcourue par la voiture jusqu'à la bouffée suivante, et sur la voie
 * (`halfTrack`, demi-écart des roues) : les bouffées se rejoignent en une traînée comme les dizaines de particules du
 * canvas de l'artefact. `maxR` : rayon de la boîte dessinée (puffMaxRadius).
 */
export function puffStyle(
  spec: SmokeSpec,
  age: number,
  axleX: number,
  axleY: number,
  heading: number,
  tangent: number,
  gap: number,
  halfTrack: number,
  n1: number,
  n2: number,
  maxR: number,
  density: number,
  unit = 1,
  k = 1,
) {
  "worklet";
  const st = puffState(spec, age, axleX, axleY, heading, n1, n2, unit, k);
  return {
    opacity: Math.min(1, st.alpha * density),
    transform: [
      { translateX: st.x - maxR },
      { translateY: st.y - maxR },
      { rotate: `${tangent}rad` },
      { scaleX: (st.r + gap / 2) / maxR },
      { scaleY: (st.r + halfTrack) / maxR },
    ],
  };
}

/** Rayon d'une bouffée en fin de vie (px) : taille de la boîte qu'on met à l'échelle. */
export function puffMaxRadius(spec: SmokeSpec, unit = 1, k = 1): number {
  return (spec.radius + (spec.grow * spec.life) / 1000) * unit * k;
}

/**
 * Bouffées par voiture (`pool` : fond ; `orbitPool` : autour du O) : moins sur un petit écran (moins de 360 px) ou un
 * Android ancien (avant l'API 28).
 */
export function smokePoolSize(width: number, androidApi?: number, pool: { low: number; high: number } = smoke.pool) {
  return width < 360 || (androidApi !== undefined && androidApi < 28) ? pool.low : pool.high;
}

/** Les numéros des bouffées d'un pool de `count` (0 → count − 1). */
export function poolSlots(count: number): number[] {
  return Array.from({ length: count }, (_, i) => i);
}
