// Résultat de la dernière lecture partie (lot R7l3, tour 4) : `useApi` n'accepte que la réponse de la dernière lecture partie
// (`createRequestGate`) ; le résultat « la grille a échoué » suit la même règle. Une ancienne lecture qui finit après une plus
// récente n'écrit rien : elle ne remet pas à « réussi » une grille que la lecture acceptée n'a pas pu relire. Pur, testé seul.

export function createLatestRead() {
  let seq = 0;
  let failed = false;
  return {
    /** Une lecture part : les précédentes ne comptent plus. */
    start() {
      const id = ++seq;
      return {
        /** La lecture finit : son résultat est gardé seulement si elle est toujours la dernière partie. */
        settle(ok: boolean) {
          if (id === seq) failed = !ok;
        },
      };
    },
    /** La dernière lecture terminée et acceptée a échoué (la grille reste « à relire »). */
    failed: () => failed,
  };
}
