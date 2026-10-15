// Mouvement du système de design, commun au site et à l'appli : « tout se gare ».
// Les durées et les courbes viennent de tokens.json (voir tokens.ts) ; ce fichier ajoute ce que le README
// « Motion » décrit en prose et qui n'a pas de jeton : distances, échelle d'appui, secousse du refus.
// web/motion.css porte les mêmes valeurs en variables CSS (un test vérifie l'accord).

import { tokens } from "./tokens";

const { timing, easing } = tokens;

/** Durées en millisecondes (jetons `timing`). */
export const duration = {
  fast: timing.fast,
  base: timing.base,
  poster: timing.poster,
  scan: timing.scan,
  stagger: timing.stagger,
  loader: timing.loader,
  breath: timing.breath,
  phares: timing.phares,
  sweep: timing.sweep,
  /** Fondu croisé d'un changement d'écran (README Motion : 160 ms). */
  screenOut: 160,
} as const;

/** Courbes (jetons `easing`) en texte CSS. */
export const curve = {
  park: easing.park,
  inout: easing.inout,
  out: easing.out,
  linear: easing.linear,
} as const;

/** Points de contrôle des mêmes courbes, pour l'animation native (lot 04). */
export const bezier = {
  park: [0.12, 0.75, 0.25, 1],
  inout: [0.4, 0, 0.2, 1],
  out: [0.2, 0.8, 0.2, 1],
} as const;

/** Distances et échelles du geste « se garer » (README Motion). */
export const park = {
  /** Dépassement avant de se ranger, en px. */
  overshoot: 6,
  /** Dépassement d'un interrupteur, en px. */
  overshootSwitch: 4,
  /** Distance d'où arrive une apparition ordinaire, en px. */
  from: 16,
  /** Un écran qui arrive se gare depuis la droite, en px. */
  screenFrom: 24,
  /** Changement d'onglet : montée du nouvel écran, en px. */
  tabRise: 8,
  /** Le chiffre d'un compteur glisse de 10 px. */
  counterSlide: 10,
  /** Échelle d'un bouton appuyé. */
  pressScale: 0.97,
  /** Nombre maximal de lignes d'une cascade. */
  staggerMax: 4,
} as const;

/** Refus de scan : secoué trois fois de ±7 px en 320 ms. */
export const shake = { amplitude: 7, count: 3, duration: 320 } as const;

/** Angle de la coupe diagonale des photos et de l'affiche, en degrés (jeton `cut`). */
export const cutAngle = Number.parseFloat(tokens.geometry.cut);
