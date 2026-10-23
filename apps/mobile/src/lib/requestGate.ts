// Garde des lectures (lot M3, tour 3) : seule la dernière lecture partie compte, et seulement pour le compte qui l'a
// lancée. Une réponse arrivée après une lecture plus récente, après `invalidate()` (changement de compte, liste vidée)
// ou sous un autre compte est jetée : ni état, ni cache. Pur, testé seul ; utilisé par `useApi` et `usePaged`.

export type RequestTicket = {
  /** La lecture est toujours la dernière et le compte n'a pas changé : sa réponse peut s'afficher. */
  current: () => boolean;
  /** La lecture est toujours la dernière (le compte mis à part). */
  latest: () => boolean;
};

export function createRequestGate(scope: () => string | null) {
  let seq = 0;
  const ticket = (id: number): RequestTicket => {
    const from = scope();
    return { latest: () => id === seq, current: () => id === seq && scope() === from };
  };
  return {
    /** Une nouvelle lecture : les précédentes ne comptent plus. */
    start: (): RequestTicket => ticket(++seq),
    /** La suite de la dernière lecture (page suivante) : valable tant qu'aucune autre lecture n'est partie. */
    follow: (): RequestTicket => ticket(seq),
    /** Toutes les lectures en cours sont jetées (changement de compte). */
    invalidate: () => {
      seq++;
    },
  };
}
