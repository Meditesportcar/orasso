// Petit lot site (tour 3) : lectures numérotées. Chaque lecture prend un numéro au départ ; seule la dernière lancée compte,
// la réponse d'une lecture dépassée (autre compte, relance) est jetée à son arrivée.

export type ReadSeq = {
  /** Lance une lecture : son numéro. */
  start: () => number;
  /** Cette lecture est-elle encore la dernière lancée ? */
  isCurrent: (n: number) => boolean;
};

export function createReadSeq(): ReadSeq {
  let last = 0;
  return {
    start: () => {
      last += 1;
      return last;
    },
    isCurrent: (n) => n === last,
  };
}
