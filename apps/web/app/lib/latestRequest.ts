// Seule la dernière lecture compte (lot R7l2, tour 2) : les rechargements des votes (canal temps réel, actions, minuteur)
// se chevauchent ; une réponse partie avant une lecture plus récente est jetée, sinon elle réaffiche l'ancien état (un vote
// « ouvert » après sa clôture). `invalidate()` jette aussi les lectures en cours (recherche vidée). Pur, testé seul.
export type LatestTicket = { latest: () => boolean };

export function createLatestGate() {
  let seq = 0;
  return {
    /** Une nouvelle lecture : les précédentes ne comptent plus. */
    start: (): LatestTicket => {
      const id = ++seq;
      return { latest: () => id === seq };
    },
    /** Toutes les lectures en cours sont jetées. */
    invalidate: () => {
      seq++;
    },
  };
}
