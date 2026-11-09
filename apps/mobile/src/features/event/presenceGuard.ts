// Garde d'une tentative « Je suis sur place » (lot R7d2, tour 2). Une mesure GPS dure de longues secondes : si la personne
// se déconnecte et qu'une autre se connecte entre-temps, la demande partirait avec le jeton de la seconde. La garde
// retient la session du début de la tentative ; elle n'est plus valable si la session a changé, si la feuille s'est
// fermée ou démontée (`cancel`). Sans dépendance native : testable seule.

export type AttemptGuard = {
  /** La tentative peut encore partir : même session qu'au début, pas annulée. */
  valid: () => boolean;
  /** Fermeture ou démontage de la feuille : la tentative en cours ne partira plus. */
  cancel: () => void;
};

/** `session` rend un identifiant stable de la session courante (le jeton), `null` sans session. */
export function attemptGuard(session: () => string | null): AttemptGuard {
  const started = session();
  let cancelled = false;
  return {
    valid: () => !cancelled && started !== null && session() === started,
    cancel: () => {
      cancelled = true;
    },
  };
}
