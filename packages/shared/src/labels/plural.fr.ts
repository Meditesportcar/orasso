// Lot R6-retouches : l'accord en nombre, une seule règle pour le site et l'appli. En français, 0 et 1 sont au singulier
// (« 0 abonné », « 1 abonné »), le pluriel commence à 2 (« 2 abonnés »). Les libellés qui avaient leur petite fonction
// `plural` locale passent par celle-ci.

/** La forme du mot qui suit le nombre `n` : `one` à 0 et 1, `many` à partir de 2. */
export function pluralFr(n: number, one: string, many: string): string {
  return Math.abs(n) >= 2 ? many : one;
}

/** Le nombre suivi du mot accordé : « 1 abonné », « 2 abonnés ». `many` vaut `one` + « s » par défaut. */
export function countFr(n: number, one: string, many = `${one}s`): string {
  return `${n} ${pluralFr(n, one, many)}`;
}
