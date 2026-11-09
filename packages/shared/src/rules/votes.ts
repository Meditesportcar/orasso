// Votes à thème (lot R7l1, ARCHITECTURE-R7 § 1.3 et § 2.7, décision D38) : le prix du public devient le vote « Toutes
// catégories », et l'organisateur peut ajouter autant de votes qu'il veut. Fonctions pures, communes à l'API, au site et
// à l'appli : l'état d'un vote, qui peut y voter, qui voit le classement, les points du podium.
import {
  AUDIENCE_PRIZE_MIN_VEHICLES,
  type AudienceRanked,
  type AudienceVoteRefusal,
  type AudienceVoter,
  prizeAwardable,
} from "./audiencePrize";

export const voteKinds = ["all_categories", "theme"] as const;
export type VoteKind = (typeof voteKinds)[number];

/** Qui concourt : tous les véhicules entrés, une origine (pays ou marques), une zone, ou des voitures choisies à la main. */
export const voteCandidateModes = ["all", "origins", "zone", "hand"] as const;
export type VoteCandidateMode = (typeof voteCandidateModes)[number];

/** Quand le vote s'ouvre : au premier pointage, à une heure fixée, ou quand l'organisateur le lance. */
export const voteOpenModes = ["first_entry", "at", "manual"] as const;
export type VoteOpenMode = (typeof voteOpenModes)[number];

/** D'où vient un candidat choisi à la main : la règle, un choix, ou le scan de son QR. */
export const voteCandidateSources = ["rule", "hand", "scan"] as const;
export type VoteCandidateSource = (typeof voteCandidateSources)[number];

export type VoteState = "upcoming" | "open" | "closed";

/** Filtre d'origine ou de zone d'un vote (`candidate_filter`). */
export type VoteCandidateFilter = { countries?: string[]; makeIds?: string[]; zoneId?: string };

export const VOTE_TITLE_MAX = 60;
export const VOTE_TITLE_MIN = 2;
/** Plafond technique, pas une règle de produit (« autant de votes qu'il veut ») : contre un script qui en crée des milliers. */
export const VOTES_PER_EVENT_MAX = 50;
/** Durée d'un vote : de 1 minute à 7 jours. */
export const VOTE_DURATION_MIN = 1;
export const VOTE_DURATION_MAX = 7 * 24 * 60;
/** Titre du vote créé d'office à chaque événement. */
export const ALL_CATEGORIES_TITLE = "Toutes catégories";
/** Lignes du classement servies à la fois (le podium et les suivants). */
export const VOTE_BOARD_LIMIT = 100;
/** Lignes du classement d'un vote dans la liste des votes. */
export const VOTE_LIST_PREVIEW = 3;
/** Véhicules par page de la grille des candidats. */
export const VOTE_CANDIDATES_PAGE = 100;

/** Points du podium quand l'administration n'a rien réglé (provisoires, D38) : 15, 10, 5. */
export const VOTE_PODIUM_POINTS_DEFAULT = { first: 15, second: 10, third: 5 } as const;
export type PodiumSettings = {
  "points.vote_first"?: number | null;
  "points.vote_second"?: number | null;
  "points.vote_third"?: number | null;
};

/** Un vote tel que la règle le lit. */
export type EventVote = {
  kind: VoteKind;
  openMode: VoteOpenMode;
  /** Mode « à l'heure » : l'ouverture prévue. */
  opensAt: Date | null;
  /** Durée en minutes ; `null` = jusqu'à la fin de l'événement. */
  durationMinutes: number | null;
  /** Ouverture constatée (lancement à la main, tâche, premier pointage) ; fixe le début d'une durée. */
  openedAt: Date | null;
  /** Clôture à la main. */
  closedAt: Date | null;
  /** Création du vote : un vote créé en cours d'événement ne s'ouvre pas avant (tour 2). */
  createdAt: Date;
};

/** Ce qui vient de l'événement et des entrées. */
export type VoteContext = {
  status: string;
  endsAt: Date;
  /** Premier pointage de l'événement. */
  firstCheckinAt: Date | null;
  /**
   * Quand le 2e candidat de CE vote est devenu disponible (entré, et choisi pour un vote à la main) : l'instant où le vote
   * a pu s'ouvrir « au premier pointage » (tour 2). `null` tant qu'il n'y en a pas deux.
   */
  candidatesReadyAt: Date | null;
  /** Candidats de CE vote déjà entrés. */
  candidatesEntered: number;
};

/** Il faut deux candidats entrés pour pouvoir choisir (règle du lot 49, par vote). */
export const VOTE_MIN_CANDIDATES = AUDIENCE_PRIZE_MIN_VEHICLES;

/** Début du vote, constaté ou prévu ; `null` pour un vote à lancer à la main qui ne l'est pas encore. */
export function voteOpensAt(
  vote: EventVote,
  ctx: Pick<VoteContext, "firstCheckinAt" | "candidatesReadyAt">,
): Date | null {
  if (vote.openedAt) return vote.openedAt;
  if (vote.openMode === "at") return vote.opensAt;
  if (vote.openMode === "first_entry") {
    // « Toutes catégories » : au premier pointage de l'événement. Un vote à thème : quand ses deux premiers candidats sont
    // là, et jamais avant sa création (tour 2) ; sa durée court depuis.
    if (vote.kind === "all_categories") return ctx.firstCheckinAt;
    if (!ctx.candidatesReadyAt) return null;
    return ctx.candidatesReadyAt > vote.createdAt ? ctx.candidatesReadyAt : vote.createdAt;
  }
  return null;
}

/** Fin du vote : début + durée, au plus tard la fin de l'événement ; une clôture à la main l'avance. */
export function voteClosesAt(
  vote: EventVote,
  ctx: Pick<VoteContext, "endsAt" | "firstCheckinAt" | "candidatesReadyAt">,
): Date {
  const start = voteOpensAt(vote, ctx);
  const byDuration = start && vote.durationMinutes ? new Date(start.getTime() + vote.durationMinutes * 60_000) : null;
  const natural = byDuration && byDuration < ctx.endsAt ? byDuration : ctx.endsAt;
  return vote.closedAt && vote.closedAt < natural ? vote.closedAt : natural;
}

/**
 * `upcoming` (prévu), `open` (on peut voter), `closed` (clos). Un vote ne s'ouvre qu'avec deux candidats entrés. Un
 * événement non publié (annulé, brouillon) n'a que des votes clos, comme le prix du public du lot 49.
 */
export function voteState(vote: EventVote, ctx: VoteContext, now: Date): VoteState {
  if (ctx.status !== "published") return "closed";
  if (now >= voteClosesAt(vote, ctx)) return "closed";
  if (ctx.candidatesEntered < VOTE_MIN_CANDIDATES) return "upcoming";
  const start = voteOpensAt(vote, ctx);
  // Au premier pointage : dès qu'il y en a un et que deux candidats sont là ; les autres modes : à leur début.
  return start && now >= start ? "open" : "upcoming";
}

/** Peut voter dans ce vote maintenant ? `null` = oui ; sinon la raison, dans l'ordre où l'interface l'explique. */
export function canVoteIn(
  voter: AudienceVoter,
  vote: EventVote,
  ctx: VoteContext,
  now: Date,
): AudienceVoteRefusal | null {
  const state = voteState(vote, ctx, now);
  if (state === "closed") return "vote_closed";
  if (!voter.checkedInAt && !voter.ticketScannedAt && !voter.staffPresent && !voter.gpsPresentAt) {
    return "not_checked_in";
  }
  if (state !== "open") return "vote_not_open";
  return null;
}

/** Ce que la règle d'un vote lit d'un véhicule entré. */
export type CandidateVehicle = { country: string | null; makeId: string | null; zoneId: string | null };

/** Un véhicule entré concourt-il à ce vote, selon son mode ? (`hand` : voir l'appartenance, pas la règle.) */
export function matchesCandidateRule(
  mode: VoteCandidateMode,
  filter: VoteCandidateFilter | null | undefined,
  v: CandidateVehicle,
): boolean {
  switch (mode) {
    case "all":
      return true;
    case "origins": {
      const countries = filter?.countries ?? [];
      const makes = filter?.makeIds ?? [];
      return Boolean((v.country && countries.includes(v.country)) || (v.makeId && makes.includes(v.makeId)));
    }
    case "zone":
      return Boolean(filter?.zoneId && v.zoneId === filter.zoneId);
    case "hand":
      return false;
    default:
      return false;
  }
}

/** Un candidat reçoit des voix seulement une fois entré (une retenue choisie à l'avance est grisée tant qu'elle n'est pas là). */
export function candidateEligible(c: { enteredAt: Date | null }): boolean {
  return c.enteredAt !== null;
}

/** Qui voit le classement d'un vote : l'équipe toujours, qui a voté pendant le vote, tout le monde après la clôture. */
export function canSeeRanking(input: { team: boolean; voted: boolean; state: VoteState }): boolean {
  return input.team || input.voted || input.state === "closed";
}

export type RankingHiddenReason = "vote_first" | "not_closed";

/** Pourquoi le classement est caché : « après ton vote » à qui peut voter, « à la clôture » aux autres. */
export function rankingHiddenReason(input: { canVote: boolean }): RankingHiddenReason {
  return input.canVote ? "vote_first" : "not_closed";
}

/** Points d'un rang du podium, lus dans les réglages (`points.vote_*`), sinon 15 / 10 / 5 ; 0 hors podium. */
export function podiumPoints(settings: PodiumSettings | null | undefined, rank: number): number {
  const pick = (value: number | null | undefined, fallback: number) =>
    typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : fallback;
  if (rank === 1) return pick(settings?.["points.vote_first"], VOTE_PODIUM_POINTS_DEFAULT.first);
  if (rank === 2) return pick(settings?.["points.vote_second"], VOTE_PODIUM_POINTS_DEFAULT.second);
  if (rank === 3) return pick(settings?.["points.vote_third"], VOTE_PODIUM_POINTS_DEFAULT.third);
  return 0;
}

/** Le podium d'un vote (rangs 1 à 3 avec au moins une voix) ; vide sous deux candidats entrés ou trois voix. */
export function votePodium(ranked: readonly AudienceRanked[], totalVotes: number): AudienceRanked[] {
  if (!prizeAwardable({ vehicles: ranked.length, votes: totalVotes })) return [];
  return ranked.filter((r) => r.rank <= 3 && r.votes > 0);
}

/**
 * Une voiture garde son meilleur podium par événement (D38) : pour chaque voiture (`key`), le meilleur rang obtenu dans
 * un des votes ; à rang égal, le premier vote de la liste (celui qui passe avant dans l'ordre de l'organisateur).
 */
export function bestRankPerVehicle<T extends { key: string; rank: number }>(results: readonly T[]): Map<string, T> {
  const best = new Map<string, T>();
  for (const r of results) {
    const current = best.get(r.key);
    if (!current || r.rank < current.rank) best.set(r.key, r);
  }
  return best;
}
