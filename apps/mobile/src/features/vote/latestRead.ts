// « Grille à relire » (lot R7l3, tours 4 et 5) : `useApi` n'accepte que la réponse de la dernière lecture partie
// (`createRequestGate`). L'état « à relire » ne s'efface donc que sur le **succès de la dernière lecture partie** ; tout échec
// d'une lecture partie après le dernier succès accepté le remet (même si une lecture plus récente est encore en cours : tant
// qu'elle n'a pas réussi, la grille reste à relire) ; un message du canal qui change les candidats le pose aussi. Une
// ancienne lecture qui réussit après une plus récente n'efface rien (sa réponse n'est pas affichée). Pur, testé seul.

export function createLatestRead() {
  let seq = 0; // dernière lecture partie
  let okSeq = 0; // dernière lecture réussie et acceptée
  let needAfter = 0; // un message de grille exige une lecture partie après lui
  let stale = false;
  return {
    /** Une lecture part : les précédentes ne sont plus acceptées. */
    start() {
      const id = ++seq;
      return {
        /** La lecture finit. */
        settle(ok: boolean) {
          if (ok) {
            if (id === seq) {
              okSeq = id;
              if (id > needAfter) stale = false;
            }
          } else if (id > okSeq) stale = true;
        },
      };
    },
    /** Les candidats ont changé (message du canal) : la grille est à relire jusqu'au succès d'une lecture partie après. */
    invalidate() {
      needAfter = seq;
      stale = true;
    },
    /** La grille affichée est à relire (message de grille non encore servi, ou lecture en échec depuis le dernier succès). */
    failed: () => stale,
  };
}
