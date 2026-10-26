// Lot R5b, tour 2 : un pseudo (sans espace) affiché en Archivo large (125 %) noir italique, en capitales, rapetisse pour
// tenir sur sa ligne au lieu de se couper. Une chasse moyenne (0,92 corps par signe) ne suffit pas : « R5SD_MNGKQ0 »
// se coupait sur le site (M, N, G, K, Q dépassent 1 corps). Chasses relevées dans le navigateur, police du site
// (`.pr5-hd h1`), en fraction du corps ; un signe inconnu compte pour le plus large des courants (1,05).

const EM: Record<string, number> = {
  A: 0.954,
  B: 0.93,
  C: 0.939,
  D: 0.933,
  E: 0.86,
  F: 0.807,
  G: 1.012,
  H: 1.009,
  I: 0.395,
  J: 0.764,
  K: 0.988,
  L: 0.786,
  M: 1.178,
  N: 1.007,
  O: 1.008,
  P: 0.865,
  Q: 1.008,
  R: 0.943,
  S: 0.882,
  T: 0.877,
  U: 0.989,
  V: 0.938,
  W: 1.23,
  X: 0.961,
  Y: 0.966,
  Z: 0.877,
  "0": 0.811,
  "1": 0.731,
  "2": 0.809,
  "3": 0.813,
  "4": 0.819,
  "5": 0.813,
  "6": 0.815,
  "7": 0.746,
  "8": 0.828,
  "9": 0.815,
  _: 0.679,
  ".": 0.381,
  "-": 0.6,
};
const UNKNOWN_EM = 1.05;
/** Marge pour la pente de l'italique et les écarts d'arrondi entre plateformes. */
const SAFETY = 1.04;

/** Largeur d'un mot en capitales Archivo large noire italique, en corps (« 10 » = dix fois le corps). */
export function wideWordEm(word: string): number {
  let sum = 0;
  for (const ch of word.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase()) sum += EM[ch] ?? UNKNOWN_EM;
  return sum * SAFETY;
}

/** Corps (px) qui fait tenir le mot le plus large de `text` dans `width`, entre `min` et `max`. */
export function fitWideWordSize(text: string, width: number, max: number, min: number): number {
  if (!(width > 0)) return max;
  const widest = Math.max(1, ...text.split(/\s+/).map(wideWordEm));
  return Math.max(min, Math.min(max, Math.floor(width / widest)));
}
