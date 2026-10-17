// Emplacement sponsorisé de l'accueil (lot 30, ARCHITECTURE-SUITE § 13.3) : éligibilité d'un emplacement pour une
// personne, et tirage pondéré déterministe (même graine, même résultat). Fonctions pures, testées.

export type PlacementStatus = "draft" | "active" | "paused" | "ended";

export type PlacementTarget = {
  id: string;
  status: PlacementStatus;
  /** AAAA-MM-JJ, jours de Paris, bornes comprises. */
  startsOn: string;
  endsOn: string;
  /** Vide = tous les départements. */
  departments: string[];
  /** Vide = tous les centres d'intérêt. */
  categoryIds: string[];
  /** Affichages par jour au plus ; `null` = sans plafond. */
  dailyCap: number | null;
};

export type SponsoredContext = {
  /** AAAA-MM-JJ à Paris. */
  today: string;
  /** Départements de secteur de la personne. */
  sector: readonly string[];
  /** Centres d'intérêt (catégories) de la personne. */
  interests: readonly string[];
  /** Affichages de cet emplacement aujourd'hui. */
  impressionsToday: number;
};

/**
 * Un emplacement est montré à la personne s'il est actif, dans sa période, sous son plafond du jour, et si son ciblage
 * (département, centre d'intérêt) recoupe le profil. Le poids vaut 1 + le nombre de ciblages renseignés qui
 * correspondent : un emplacement ciblé qui touche bien la personne passe avant un emplacement ouvert à tous.
 */
export function placementMatch(p: PlacementTarget, ctx: SponsoredContext): { eligible: boolean; weight: number } {
  const no = { eligible: false, weight: 0 };
  if (p.status !== "active") return no;
  if (ctx.today < p.startsOn || ctx.today > p.endsOn) return no;
  if (p.dailyCap !== null && ctx.impressionsToday >= p.dailyCap) return no;
  let weight = 1;
  if (p.departments.length) {
    if (!p.departments.some((d) => ctx.sector.includes(d))) return no;
    weight += 1;
  }
  if (p.categoryIds.length) {
    if (!p.categoryIds.some((c) => ctx.interests.includes(c))) return no;
    weight += 1;
  }
  return { eligible: true, weight };
}

/** Nombre pseudo-aléatoire stable dans [0, 1) à partir d'un texte (FNV-1a puis mélange final). */
export function seededUnit(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d) >>> 0;
  h ^= h >>> 12;
  return (h >>> 0) / 0x100000000;
}

/** Tirage pondéré : candidats triés par identifiant (ordre stable), puis position selon la graine. */
export function pickWeighted<T extends { id: string; weight: number }>(candidates: T[], seed: string): T | null {
  const list = candidates.filter((c) => c.weight > 0).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const total = list.reduce((sum, c) => sum + c.weight, 0);
  if (!list.length || total <= 0) return null;
  let point = seededUnit(seed) * total;
  for (const c of list) {
    point -= c.weight;
    if (point < 0) return c;
  }
  return list[list.length - 1] ?? null;
}
