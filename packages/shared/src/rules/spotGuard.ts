// Garde des lectures et des actions d'une fiche de rendez-vous au spot (lot R7i, tour 4), commune au site et à l'appli.
// Deux courses à fermer, toutes deux pour qu'un lieu révoqué ou fini ne réapparaisse jamais :
// - un refus définitif (404 / 403) invalide toutes les opérations parties avant lui : leur réponse (même 200) est jetée ;
// - « Voir plus » porte la génération de la liste qui l'a lancé : si la première page a été remplacée entre-temps, sa réponse
//   est jetée (ni doublon, ni personne manquante).
// Pur : pas d'horloge, pas de réseau.

export type SpotGuard = {
  /** Une opération (lecture, action) part : son numéro. */
  start: () => number;
  /** Refus définitif appris : toutes les opérations déjà parties ne comptent plus. */
  refuse: () => void;
  /** La réponse de cette opération peut être appliquée (aucun refus appris depuis son départ). */
  valid: (op: number) => boolean;
};

export function createSpotGuard(): SpotGuard {
  let seq = 0;
  let refusedAt = 0;
  return {
    start: () => ++seq,
    refuse: () => {
      refusedAt = seq;
    },
    valid: (op) => op > refusedAt,
  };
}

export type ListGeneration = {
  /** La première page est remplacée (relecture, réponse, changement de compteurs) : les « Voir plus » en cours sont périmés. */
  bump: () => number;
  /** Génération courante, à emporter avec un « Voir plus » au départ. */
  current: () => number;
  /** La réponse d'un « Voir plus » parti à la génération `gen` peut être ajoutée à la liste. */
  accepts: (gen: number) => boolean;
};

export function createListGeneration(): ListGeneration {
  let gen = 0;
  return { bump: () => ++gen, current: () => gen, accepts: (g) => g === gen };
}
