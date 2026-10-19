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

/**
 * Le O vivant (DA v2, lot 39 ; README, écart 5) : la voiture du logo vue de dessus drifte autour du O pendant un
 * chargement et se gare dedans quand c'est fini. Durées en millisecondes.
 */
export const olive = {
  /** Battle d'ouverture en tandem, à chaque lancement (V12) : 1,6 s du kit allongées à 3 s. */
  open: 3000,
  /** La voiture se gare dans le O (même geste que `park` : dépassement puis place). */
  park: 320,
  /** Un tour de drift autour du O. */
  orbit: 1400,
  /** Contre-braquage des roues avant pendant la glisse, en degrés. */
  steer: -18,
  /** Angle de dérive autour du O (corps − tangente), en radians : le nez vers l'intérieur du virage. */
  slip: 0.62,
  /** Écart du poursuivant dans la battle en tandem, en tour de piste. */
  tandemGap: 0.16,
  /** Le O descend de 64 px avant que l'actualisation parte (tirer pour actualiser). */
  pullDistance: 64,
} as const;

/**
 * Le fond animé « battle » (lot 39, V14) : une meute de 2 voitures (parfois un train de 3) toutes les 9 à 14 s,
 * 2 à 3 voitures à l'écran au plus, jamais en mode staff, jour J ou tri, jamais avec la réduction des animations.
 */
export const battle = {
  /** Attente entre deux meutes, en millisecondes [min, max]. */
  gap: [9000, 14000],
  /** Vitesse de la meute, en px par seconde [min, max]. */
  speed: [140, 200],
  /** Probabilité d'un train de trois voitures au lieu d'une paire. */
  trainChance: 0.27,
  /** Distance entre deux voitures de la meute, le long de la trajectoire, en px (paire, train). */
  spacing: { pair: 40, train: 34 },
  /** Opacité des voitures sur le fond : 18 % en Béton, 10 % en Sable. */
  opacity: { beton: 0.18, sable: 0.1 },
  /** Première meute après l'arrivée sur l'écran, en millisecondes. */
  firstDelay: 1200,
  /** Longueur de la voiture du fond, en px (la voiture du O garde ses 64 unités). */
  carLength: 26,
} as const;
