// Petit lot site (P26b) : quel appel d'une liste a échoué en dernier, pour que « Réessayer » relance le bon : la relecture
// depuis le début (`reload`) ou la page suivante (`more`, même curseur). Pur : les hooks des listes le partagent.

export type ListCall = "reload" | "more";

export type RetryTracker = {
  /** Un appel vient d'échouer. */
  failed: (call: ListCall) => void;
  /** Un appel a réussi : plus rien à réessayer. */
  succeeded: () => void;
  /** L'appel que « Réessayer » relance (`more` quand rien n'a échoué : le comportement d'une liste déjà lue). */
  target: () => ListCall;
};

export function createRetryTracker(): RetryTracker {
  let last: ListCall | null = null;
  return {
    failed: (call) => {
      last = call;
    },
    succeeded: () => {
      last = null;
    },
    target: () => last ?? "more",
  };
}
