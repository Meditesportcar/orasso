// Emplacement sponsorisé de l'accueil (lot 30, ARCHITECTURE-SUITE § 13.3) : éligibilité d'un emplacement pour une
// personne, et tirage pondéré déterministe (même graine, même résultat). Fonctions pures, testées.

export type PlacementStatus = "draft" | "active" | "paused" | "ended";

/** Où un emplacement s'affiche (lot R7k1) : l'Accueil (un pro, ciblage départements + centres d'intérêt) et le Fil. */
export const sponsoredSurfaces = ["home", "feed"] as const;
export type SponsoredSurface = (typeof sponsoredSurfaces)[number];

/** Qui paie : un pro de la plateforme, ou un annonceur externe (Fil seulement, derrière `sponsored.external_enabled`). */
export const advertiserKinds = ["pro", "external"] as const;
export type AdvertiserKind = (typeof advertiserKinds)[number];

/**
 * « Pourquoi je vois ça » d'une carte Sponsorisé du Fil (D38 : non personnalisé, le seul critère est le département) :
 * la phrase du département ne se dit que pour un emplacement **ciblé** par département ; un emplacement ouvert à toute la
 * France dit seulement « Sponsorisé » (rien n'a été choisi d'après la personne).
 */
export const FEED_SPONSORED_REASON = "Sponsorisé · choisi d'après ton département";
export const FEED_SPONSORED_OPEN_REASON = "Sponsorisé";

/** Le libellé de la raison selon que l'emplacement vise des départements (`targeted`) ou toute la France. */
export function feedSponsoredReason(targeted: boolean): string {
  return targeted ? FEED_SPONSORED_REASON : FEED_SPONSORED_OPEN_REASON;
}

/** La carte Sponsorisé est-elle ciblée par département ? Lu depuis le libellé de sa raison (aucun champ de plus à l'API). */
export function isFeedSponsoredTargeted(reasonLabel: string): boolean {
  return reasonLabel === FEED_SPONSORED_REASON;
}

/** « Pourquoi je vois ça » d'une carte Sponsorisé (D38) : ciblée par département, ou ouverte à toute la France. */
export const FEED_SPONSORED_WHY = "Sponsorisé. Choisi d'après ton département, rien d'autre.";
export const FEED_SPONSORED_OPEN_WHY = "Sponsorisé. Montré à tout le monde en France : rien n'est choisi d'après toi.";

/** Les départements d'un emplacement sans doublon (l'ordre de saisie est gardé). */
export function distinctDepartments(departments: readonly string[]): string[] {
  return [...new Set(departments)];
}

/** Domaine affiché sous une carte d'annonceur externe : le nom d'hôte du lien, sans `www.` (jamais saisi à la main). */
export function displayDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase() || null;
  } catch {
    return null;
  }
}

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

/**
 * Éligibilité d'un emplacement pour le Fil (lot R7k1, D38 : publicité non personnalisée). Même règle que l'Accueil
 * (actif, dans sa période, sous le plafond du jour) mais **le département est le seul ciblage** : les centres d'intérêt
 * de l'emplacement ne comptent pas. Poids = 1 + le nombre de départements de la personne que l'emplacement vise (0 si
 * l'emplacement est ouvert à tous).
 */
export function feedPlacementMatch(
  p: PlacementTarget,
  ctx: Pick<SponsoredContext, "today" | "sector" | "impressionsToday">,
): { eligible: boolean; weight: number } {
  const no = { eligible: false, weight: 0 };
  if (p.status !== "active") return no;
  if (ctx.today < p.startsOn || ctx.today > p.endsOn) return no;
  if (p.dailyCap !== null && ctx.impressionsToday >= p.dailyCap) return no;
  if (!p.departments.length) return { eligible: true, weight: 1 };
  const touched = distinctDepartments(p.departments).filter((d) => ctx.sector.includes(d)).length;
  return touched ? { eligible: true, weight: 1 + touched } : no;
}
