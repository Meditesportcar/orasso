// Découverte des événements par affinités (docs/01 « Découverte », décision S34) : un événement marque des points
// selon ce qui rapproche la personne de lui. Fonctions pures, communes à l'API (qui calcule le même score en SQL pour
// trier toute la liste) et aux tests.

/** Points d'un événement dont l'organisateur est suivi. */
export const AFFINITY_FOLLOWED = 3;
/** Points par catégorie de l'événement que la personne a dans ses centres d'intérêt. */
export const AFFINITY_PER_CATEGORY = 2;
/** Points d'un événement à `AFFINITY_NEAR_KM` au plus de la position de la personne. */
export const AFFINITY_NEAR = 1;
export const AFFINITY_NEAR_KM = 50;

export type AffinityFacts = {
  /** L'organisateur de l'événement est suivi. */
  followed: boolean;
  /** Nombre de catégories de l'événement qui sont aussi des centres d'intérêt de la personne. */
  commonCategories: number;
  /** Distance à la position de la personne ; `null` si l'un des deux est inconnu. */
  distanceKm: number | null;
};

export type Affinity = {
  score: number;
  followed: boolean;
  commonCategories: number;
  near: boolean;
};

export function affinityOf(facts: AffinityFacts): Affinity {
  const common = Math.max(0, Math.floor(facts.commonCategories));
  const near = facts.distanceKm !== null && facts.distanceKm <= AFFINITY_NEAR_KM;
  const score = (facts.followed ? AFFINITY_FOLLOWED : 0) + common * AFFINITY_PER_CATEGORY + (near ? AFFINITY_NEAR : 0);
  return { score, followed: facts.followed, commonCategories: common, near };
}

/** Ordre « affinités » : score décroissant, puis date de début, puis identifiant (ordre total, stable). */
export function compareByAffinity(
  a: { score: number; startsAt: string | Date; id: string },
  b: { score: number; startsAt: string | Date; id: string },
): number {
  if (a.score !== b.score) return b.score - a.score;
  const ta = new Date(a.startsAt).getTime();
  const tb = new Date(b.startsAt).getTime();
  if (ta !== tb) return ta - tb;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
