// « Réessayer » d'une liste lue par curseur (lot « Petit lot appli », P26a) : relancer l'appel qui a échoué. Après l'échec d'une
// relecture (première page), on relit ; après l'échec d'une page suivante, on redemande la même page suivante. Les éléments déjà
// lus restent affichés dans les deux cas. Sans lecture ni curseur ancien à reprendre : une relecture.

/** L'appel qui vient d'échouer : la relecture de la première page, ou la page suivante. */
export type FailedCall = "reload" | "more";

/** Quel appel « Réessayer » relance-t-il ? */
export const retryCall = (failed: FailedCall | null): FailedCall => (failed === "more" ? "more" : "reload");
