// Le Fil (lot R7e1, décision D38, ARCHITECTURE-R7 § 2.4) : cartes mélangées, classement, publications en 4:5.
// Règles pures : l'API les applique, l'appli et le site affichent le résultat sans le recalculer.
//
// Classement d'une carte = fraîcheur (demi-vie de 36 h) × proximité (même département 1, même région 0,7, ailleurs 0,3)
// × affinité (auteur suivi 1,5 ; crew commun 1,3 ; centre d'intérêt commun 1,2 ; sinon 1 : la plus forte s'applique) ×
// « Moins de ce genre » (0,3). Puis la diversité (`diversify`) : deux cartes de suite du même genre pèsent 0,6, et trois
// de suite n'arrivent que s'il ne reste rien d'autre.
import { departmentCentroids, distanceKm, regions } from "../geo";
import { type AudienceRel, type AudienceViewer, canSeeFeedPost, type FeedPostFacts } from "./audience";

export type { AudienceRel, AudienceViewer, FeedPostFacts };
export { canSeeFeedPost };

/** Les genres de carte du Fil (`Card.kind`). `spot_meetup` (R7i), `memory` (R7j) et `sponsored` (R7k1) arrivent après. */
export const feedCardKinds = [
  "event_recommended",
  "vehicle_public",
  "lineup",
  "vote_result",
  "announcement",
  "pro",
  "spot_meetup",
  "feed_post",
  "memory",
  "sponsored",
] as const;
export type FeedCardKind = (typeof feedCardKinds)[number];

export const feedFilters = ["for_you", "nearby", "following"] as const;
export type FeedFilter = (typeof feedFilters)[number];

/** Le pseudo du compte officiel d'Orasso (contenu de départ, seed). Le compte se reconnaît à `profiles.official`, jamais à son pseudo. */
export const OFFICIAL_PSEUDO = "Orasso";

/**
 * Pseudo réservé : il contient « orasso » (ou « 0rasso »), sans tenir compte de la casse, des accents ni des séparateurs
 * « _ » et « . ». Refusé à l'inscription et au changement de pseudo (`pseudo_reserved`) ; seul le compte officiel le porte.
 */
export function isReservedPseudo(pseudo: string): boolean {
  const plain = pseudo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[_.\s-]/g, "")
    .replaceAll("0", "o");
  return plain.includes("orasso");
}

/** Cartes par page. */
export const FEED_PAGE = 20;
/**
 * Cartes que la page choisit parmi, avant de les mélanger : celles de la page (20) et au plus 20 « différées » (vues
 * dans la fenêtre précédente mais non servies, gardées pour celle-ci). Borne aussi la liste du curseur.
 */
export const FEED_POOL = 2 * FEED_PAGE;
/**
 * Longueur maximale (caractères) d'un curseur du Fil, calculée sur le format le plus grand que l'API produise : 16
 * sources au plafond, 20 cartes différées (voir `apps/api/src/modules/feed/cursor.ts`, 1011 caractères).
 */
export const FEED_CURSOR_MAX = 1100;
export const FEED_POST_PHOTOS_MAX = 6;
export const FEED_CAPTION_MAX = 500;

/** Demi-vie de la fraîcheur : une carte de 36 h pèse moitié moins qu'une carte neuve. */
export const FEED_HALF_LIFE_MS = 36 * 3_600_000;
/** Fenêtre classée par score ; au-delà, les cartes suivent la date. */
export const FEED_SCORE_WINDOW_MS = 48 * 3_600_000;
export const FEED_PROXIMITY = { sameDepartment: 1, sameRegion: 0.7, elsewhere: 0.3 } as const;
export const FEED_AFFINITY = { followed: 1.5, crew: 1.3, interest: 1.2, none: 1 } as const;
/** « Moins de ce genre » (menu ⋯). */
export const FEED_LESS_FACTOR = 0.3;
/** Deux cartes consécutives du même genre. */
export const FEED_REPEAT_PENALTY = 0.6;
/** Départements « voisins » : le centre du département est à cette distance (km) ou moins. */
export const FEED_NEARBY_KM = 80;

/** Un « publier au Fil » : trois formats. */
export const feedAspects = ["portrait_4_5", "square", "landscape"] as const;
export type FeedAspect = (typeof feedAspects)[number];
/** Largeur / hauteur de chaque format ; 4:5 par défaut (D38). */
export const FEED_ASPECT_RATIOS: Record<FeedAspect, number> = { portrait_4_5: 0.8, square: 1, landscape: 1.25 };
/** Tolérance du recadrage fait par l'appli, vérifiée par l'API (± 2 %). */
export const FEED_RATIO_TOLERANCE = 0.02;
/** Côté le plus long de la photo stockée (1080 × 1350 en 4:5 ; le serveur réduit au besoin). */
export const FEED_PHOTO_SIDE = 1350;
export const DEFAULT_FEED_ASPECT: FeedAspect = "portrait_4_5";

/** La photo (largeur × hauteur réelles) a-t-elle le format annoncé, à 2 % près ? */
export function aspectMatches(aspect: FeedAspect, width: number, height: number): boolean {
  if (!(width > 0 && height > 0)) return false;
  const target = FEED_ASPECT_RATIOS[aspect];
  return Math.abs(width / height / target - 1) <= FEED_RATIO_TOLERANCE;
}

// --- Proximité -------------------------------------------------------------------------------------------------------

export const regionOfDepartment = (code: string | null | undefined): string | null =>
  code ? (regions.find((r) => (r.departments as readonly string[]).includes(code))?.code ?? null) : null;

/**
 * Coefficient de proximité d'une carte pour une personne. Sans département connu (carte ou personne), on reste neutre
 * (région : 0,7) plutôt que d'enterrer ou de pousser la carte.
 */
export function proximityFactor(cardDepartment: string | null, viewerDepartments: readonly string[]): number {
  if (!cardDepartment || !viewerDepartments.length) return FEED_PROXIMITY.sameRegion;
  if (viewerDepartments.includes(cardDepartment)) return FEED_PROXIMITY.sameDepartment;
  const region = regionOfDepartment(cardDepartment);
  if (region && viewerDepartments.some((d) => regionOfDepartment(d) === region)) return FEED_PROXIMITY.sameRegion;
  return FEED_PROXIMITY.elsewhere;
}

/** Les départements de la personne et leurs voisins (centres à `FEED_NEARBY_KM` km ou moins) : filtre « Autour de moi ». */
export function nearbyDepartments(viewerDepartments: readonly string[]): string[] {
  const out = new Set<string>(viewerDepartments);
  for (const home of viewerDepartments) {
    const a = departmentCentroids[home];
    if (!a) continue;
    for (const [code, b] of Object.entries(departmentCentroids)) {
      if (distanceKm(a, b) <= FEED_NEARBY_KM) out.add(code);
    }
  }
  return [...out];
}

// --- Score -----------------------------------------------------------------------------------------------------------

/** Ce que le classement sait d'une carte (jamais le contenu). */
export type FeedCandidate<K extends string = FeedCardKind> = {
  id: string;
  kind: K;
  at: Date;
  department: string | null;
  /** Auteur ou propriétaire (compte), s'il y en a un. */
  authorId: string | null;
  /** Structure organisatrice, s'il y en a une. */
  structureId: string | null;
  /** Pro de la fiche, s'il y en a un. */
  proId: string | null;
  /** Centres d'intérêt de la carte (catégories de l'événement ou du véhicule). */
  categoryIds: readonly string[];
};

/** Ce que le classement sait de la personne qui regarde (calculé par l'API pour elle seule). */
export type FeedViewerContext = {
  departments: readonly string[];
  followedUsers: ReadonlySet<string>;
  followedStructures: ReadonlySet<string>;
  followedPros: ReadonlySet<string>;
  crewmates: ReadonlySet<string>;
  interests: ReadonlySet<string>;
  lessKinds: ReadonlySet<string>;
};

export const emptyFeedViewerContext = (): FeedViewerContext => ({
  departments: [],
  followedUsers: new Set(),
  followedStructures: new Set(),
  followedPros: new Set(),
  crewmates: new Set(),
  interests: new Set(),
  lessKinds: new Set(),
});

/** Fraîcheur : 1 à la publication, 0,5 après 36 h. Une carte datée du futur compte comme neuve. */
export function freshness(at: Date, now: Date): number {
  const age = Math.max(0, now.getTime() - at.getTime());
  return 0.5 ** (age / FEED_HALF_LIFE_MS);
}

/** La personne suit-elle l'auteur, la structure ou le pro de cette carte ? (filtre « Mes abonnements ») */
export function isFollowedCard(c: FeedCandidate, ctx: FeedViewerContext): boolean {
  return (
    (c.authorId !== null && ctx.followedUsers.has(c.authorId)) ||
    (c.structureId !== null && ctx.followedStructures.has(c.structureId)) ||
    (c.proId !== null && ctx.followedPros.has(c.proId))
  );
}

export function affinityFactor(c: FeedCandidate, ctx: FeedViewerContext): number {
  if (isFollowedCard(c, ctx)) return FEED_AFFINITY.followed;
  if (c.authorId !== null && ctx.crewmates.has(c.authorId)) return FEED_AFFINITY.crew;
  if (c.categoryIds.some((id) => ctx.interests.has(id))) return FEED_AFFINITY.interest;
  return FEED_AFFINITY.none;
}

/** Score d'une carte à l'instant `now` (l'API fige `now` sur la première page d'un parcours). */
export function scoreCard(card: FeedCandidate, ctx: FeedViewerContext, now: Date): number {
  return (
    freshness(card.at, now) *
    proximityFactor(card.department, ctx.departments) *
    affinityFactor(card, ctx) *
    (ctx.lessKinds.has(card.kind) ? FEED_LESS_FACTOR : 1)
  );
}

// --- Raison affichée sous la carte ("Pourquoi je vois ça") --------------------------------------------------------------

export const feedReasonCodes = [
  "following_author",
  "following_structure",
  "following_pro",
  "crew_mate",
  "your_styles",
  "near_you",
  "recommended_event",
  "lineup_today",
  "vote_result",
  "pro_near",
  "from_orasso",
  "new_here",
] as const;
export type FeedReasonCode = (typeof feedReasonCodes)[number];

/** Le code de la raison, par priorité : lien direct, puis goûts, puis proximité, puis le genre de la carte. */
export function reasonCode(c: FeedCandidate, ctx: FeedViewerContext, official = false): FeedReasonCode {
  if (official) return "from_orasso";
  if (c.authorId !== null && ctx.followedUsers.has(c.authorId)) return "following_author";
  if (c.structureId !== null && ctx.followedStructures.has(c.structureId)) return "following_structure";
  if (c.proId !== null && ctx.followedPros.has(c.proId)) return "following_pro";
  if (c.authorId !== null && ctx.crewmates.has(c.authorId)) return "crew_mate";
  if (c.categoryIds.some((id) => ctx.interests.has(id))) return "your_styles";
  if (c.department && ctx.departments.includes(c.department)) return "near_you";
  switch (c.kind) {
    case "event_recommended":
      return "recommended_event";
    case "lineup":
      return "lineup_today";
    case "vote_result":
      return "vote_result";
    case "pro":
      return "pro_near";
    default:
      return "new_here";
  }
}

// --- Diversité -------------------------------------------------------------------------------------------------------

export type Scored<T> = T & { score: number };

/**
 * Ordre final d'une liste déjà notée. On prend à chaque pas la carte qui vaut le plus, son score étant multiplié par
 * 0,6 si elle a le même genre que la précédente ; une troisième carte du même genre de suite n'est choisie que s'il
 * ne reste rien d'autre. À égalité : score, puis date récente, puis identifiant (ordre stable).
 */
export function diversify<T extends { id: string; kind: string; at: Date; score: number }>(
  cards: readonly T[],
  /** Genres des deux dernières cartes déjà servies (page précédente), de la plus ancienne à la plus récente. */
  previous: readonly string[] = [],
): T[] {
  const rest = [...cards].sort(compareCards);
  const out: T[] = [];
  // Les genres servis, en commençant par ceux d'avant : ils comptent pour la répétition sans faire partie du résultat.
  const kinds: string[] = [...previous];
  while (rest.length) {
    const lastKind = kinds.at(-1);
    const beforeLastKind = kinds.at(-2);
    const run = lastKind !== undefined && lastKind === beforeLastKind ? lastKind : null;
    const onlyRun = run !== null && rest.every((c) => c.kind === run);
    let best = -1;
    let bestValue = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < rest.length; i++) {
      const c = rest[i] as T;
      if (run !== null && c.kind === run && !onlyRun) continue;
      const value = c.score * (lastKind !== undefined && c.kind === lastKind ? FEED_REPEAT_PENALTY : 1);
      // `rest` est trié : en cas d'égalité stricte, la première (la mieux classée) reste.
      if (value > bestValue) {
        bestValue = value;
        best = i;
      }
    }
    const picked = rest.splice(best, 1)[0] as T;
    out.push(picked);
    kinds.push(picked.kind);
  }
  return out;
}

/** Score décroissant, puis date récente, puis identifiant décroissant. */
export function compareCards(
  a: { score: number; at: Date; id: string },
  b: { score: number; at: Date; id: string },
): number {
  return b.score - a.score || b.at.getTime() - a.at.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);
}

/** Ordre stable du parcours classé : score décroissant, puis identifiant décroissant (clé du curseur). */
export function compareByScore(a: { score: number; id: string }, b: { score: number; id: string }): number {
  return b.score - a.score || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);
}

/** Ordre par date (au-delà de la fenêtre de 48 h) : récent d'abord, identifiant décroissant à égalité. */
export function compareByDate(a: { at: Date; id: string }, b: { at: Date; id: string }): number {
  return b.at.getTime() - a.at.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);
}

// --- Sponsorisé ------------------------------------------------------------------------------------------------------

/** Positions (1 = première carte) des emplacements sponsorisés : 4, 10, 16… (jamais dans les trois premières). */
export const SPONSORED_FIRST_POSITION = 4;
export const SPONSORED_EVERY = 6;

/**
 * Insère les cartes sponsorisées aux positions 4, 10, 16… du Fil entier. `offset` = nombre de cartes déjà servies avant
 * cette page, pour que les positions restent celles du Fil et non de la page. `picker` nul → rien (R7k1 le branche) ;
 * `picker(position)` rend la carte ou `null`. Une position au-delà de la fin de la liste reste vide.
 */
export function insertSponsored<T>(
  cards: readonly T[],
  picker: ((position: number) => T | null) | null,
  offset = 0,
): T[] {
  if (!picker) return [...cards];
  const out = [...cards];
  // Positions absolues (1-based) tombant dans cette page, en tenant compte des cartes insérées plus tôt dans la page.
  for (let position = SPONSORED_FIRST_POSITION; position <= offset + out.length + 1; position += SPONSORED_EVERY) {
    const index = position - 1 - offset;
    if (index < 0 || index > out.length) continue;
    const card = picker(position);
    if (card) out.splice(index, 0, card);
  }
  return out;
}
