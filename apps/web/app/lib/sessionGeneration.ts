// Petit lot site (P45) : la « génération » d'une page paginée qui suit la session. Une annonce d'un autre compte que celui du
// chargeur COURANT invalide la génération : toute page lue sous l'ancienne est jetée à son arrivée. Pur (aucun React), extrait de
// `routes/event-mentions.tsx` sans changer son comportement.

export type SessionGeneration = {
  /** La génération à noter au départ d'une lecture. */
  current: () => number;
  /** Un nouveau chargement (autre fiche, autre compte, masquage) : les lectures en vol sont jetées. */
  bump: () => void;
  /** Cette lecture est-elle encore la bonne ? */
  isCurrent: (mine: number) => boolean;
  /**
   * Une annonce de session. Le même compte que le chargeur courant (hydratation, autre onglet du même compte) ne change rien
   * (`false`) ; un autre invalide la génération (`true`).
   */
  announce: (userId: string | null) => boolean;
};

export function createSessionGeneration(loaderUser: () => string | null): SessionGeneration {
  let generation = 0;
  return {
    current: () => generation,
    bump: () => {
      generation += 1;
    },
    isCurrent: (mine) => mine === generation,
    announce: (userId) => {
      if (userId === loaderUser()) return false;
      generation += 1;
      return true;
    },
  };
}
