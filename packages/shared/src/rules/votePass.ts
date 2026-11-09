// Votes à thème, côté passionné (lot R7l3) : la ligne de chaque vote dans la liste, la carte « Résultat », l'état de l'écran
// d'un vote et la surveillance de sa clôture. Fonctions pures, l'heure est passée en paramètre. Les règles de fond (qui
// peut voter, quand le classement est servi, points) sont dans l'API : ici on met seulement en mots ce qu'elle a répondu,
// jamais une règle de visibilité (un classement que l'API n'a pas servi n'est pas reconstruit).
import { votePassTexts as T } from "../labels/votePass.fr";
import type { VoteRankingEntry, VoteView } from "../schemas/votes";
import { AUDIENCE_PRIZE_MIN_VOTES } from "./audiencePrize";
import { VOTE_MIN_CANDIDATES } from "./votes";
import { voteWhen } from "./votesOrga";

const MINUTE = 60_000;
/** En dessous, la ligne dit « 8 min restantes » au lieu de l'heure de fermeture, et se met en avant. */
export const VOTE_CLOSING_SOON_MIN = 60;

export type VoteRowTone = "voted" | "open" | "soon" | "blocked" | "upcoming" | "closed";

export type VoteRow = {
  tone: VoteRowTone;
  /** La pastille de droite : « Voté », « Voter », « À venir », « Résultats », « Ouvert ». */
  chip: string;
  chipIcon: "check" | "trophy" | "wait" | "chevron";
  /** La ligne sous le titre. */
  detail: string;
  /** Grisée et non touchable (vote à venir). */
  muted: boolean;
  /** La mettre en avant (se ferme dans moins d'une heure et je n'ai pas voté). */
  hot: boolean;
};

/** Minutes avant la fermeture (arrondi vers le haut, jamais négatif). */
export function voteMinutesLeft(closesAt: string | Date, now: Date): number {
  const end = typeof closesAt === "string" ? new Date(closesAt) : closesAt;
  return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / MINUTE));
}

/** Ce qu'il manque à qui ne peut pas voter : entrer sur l'événement, ou valider sa présence (aucune candidature : visiteur). */
export function voteBlockedLine(v: Pick<VoteView, "ownApplicationIds">): string {
  return v.ownApplicationIds.length === 0 ? T.validatePresence : T.enterToVote;
}

/** La ligne d'un vote dans la liste (maquette R7.17 `vs_list`). */
export function voteRow(v: VoteView, now: Date): VoteRow {
  const cars = T.cars(v.candidatesCount);
  if (v.state === "closed") {
    return {
      tone: "closed",
      chip: T.chipResults,
      chipIcon: "chevron",
      detail: T.closedSeeRanking,
      muted: false,
      hot: false,
    };
  }
  if (v.state === "upcoming") {
    const opens = v.opensAt ? new Date(v.opensAt) : null;
    const line =
      opens && opens > now
        ? T.opensWhen(voteWhen(opens, now, true))
        : v.candidatesCount < VOTE_MIN_CANDIDATES
          ? T.opensWhenTwoCars
          : T.opensLater;
    return {
      tone: "upcoming",
      chip: T.chipSoon,
      chipIcon: "wait",
      detail: v.candidatesCount > 0 ? `${line} · ${cars}` : line,
      muted: true,
      hot: false,
    };
  }
  const left = voteMinutesLeft(v.closesAt, now);
  const soon = left <= VOTE_CLOSING_SOON_MIN;
  const closes = soon ? T.minutesLeft(left) : T.closesWhen(voteWhen(new Date(v.closesAt), now, true));
  if (v.myVote) {
    const mine = v.ranking?.find((r) => r.applicationId === v.myVote);
    return {
      tone: "voted",
      chip: T.chipVoted,
      chipIcon: "check",
      detail: `${mine ? T.myVoteLine(mine.vehicleLabel) : T.myVoteSaved} · ${closes}`,
      muted: false,
      hot: false,
    };
  }
  if (!v.canVote) {
    return {
      tone: "blocked",
      chip: T.chipOpen,
      chipIcon: "chevron",
      detail: `${T.openLabel} · ${cars} · ${voteBlockedLine(v)}`,
      muted: false,
      hot: false,
    };
  }
  return {
    tone: soon ? "soon" : "open",
    chip: T.chipVote,
    chipIcon: "trophy",
    detail: soon ? `${closes} · ${cars}` : `${T.openLabel} · ${cars} · ${closes}`,
    muted: false,
    hot: soon,
  };
}

/** Nombre de votes ouverts dans la liste (titre « Votes · 3 ouverts », onglet du Jour J qui s'allume). */
export function openVotesIn(items: readonly Pick<VoteView, "state">[]): number {
  return items.filter((v) => v.state === "open").length;
}

export type VoteResult = { rank: number; label: string; pseudo: string; votes: number }[];

/**
 * La carte « Résultat » d'un vote clos : le podium (rangs 1 à 3 avec au moins une voix), seulement s'il y en a un (deux
 * voitures et trois voix au moins, comme le règlement) et que l'API a servi le classement. `null` sinon : la ligne dit alors
 * seulement « Clos · voir le classement ».
 */
export function voteResultCard(
  v: Pick<VoteView, "state" | "ranking" | "candidatesCount" | "total">,
): VoteResult | null {
  if (v.state !== "closed" || !v.ranking) return null;
  if (v.candidatesCount < VOTE_MIN_CANDIDATES || v.total < AUDIENCE_PRIZE_MIN_VOTES) return null;
  const podium = v.ranking.filter((r) => r.rank <= 3 && r.votes > 0);
  return podium.length
    ? podium.map((r) => ({ rank: r.rank, label: r.vehicleLabel, pseudo: r.pseudo, votes: r.votes }))
    : null;
}

/**
 * Le vote est-il fini (clos, ou réglé) ? Sert de réponse à la surveillance de la clôture : tant que l'API dit « prévu » ou
 * « ouvert », on relit.
 */
export function voteIsOver(v: Pick<VoteView, "state" | "settled"> | null | undefined): boolean {
  return Boolean(v) && (v?.state === "closed" || v?.settled === true);
}

/**
 * L'échéance à surveiller (R7l3, constat du 09/11) : la clôture, **tant que le vote n'est pas fini**, qu'il soit déjà ouvert
 * ou pas. Un écran ouvert avant l'ouverture (deux véhicules pointés manquent) doit armer sa minuterie lui aussi : le
 * deuxième pointage ouvre le vote sans que l'écran ne la ré-arme. `closesAt` vient de l'API (début + durée, au plus la fin de
 * l'événement).
 */
export function voteWatchDeadline(v: Pick<VoteView, "state" | "settled" | "closesAt"> | null | undefined): Date | null {
  if (!v || voteIsOver(v)) return null;
  const end = new Date(v.closesAt);
  return Number.isNaN(end.getTime()) ? null : end;
}

export type VoteScreenMode =
  /** Pas encore de lecture. */
  | "loading"
  /** Je peux voter et je n'ai pas voté (ou je change ma voix) : la grille se touche. */
  | "choose"
  /** J'ai voté : ma voix, le classement servi, « Changer mon vote ». */
  | "voted"
  /** Je ne peux pas voter : la grille est montrée sans pouvoir la toucher, avec ce qu'il manque. */
  | "blocked"
  /** Pas encore ouvert. */
  | "upcoming"
  /** Clos : le classement est servi à tous. */
  | "closed";

/** L'état de l'écran d'un vote d'après la réponse de l'API (jamais d'après une règle de visibilité d'ici). */
export function voteScreenMode(v: VoteView | null, changing: boolean): VoteScreenMode {
  if (!v) return "loading";
  if (v.state === "closed") return "closed";
  if (v.state === "upcoming") return "upcoming";
  if (v.myVote && v.canVote) return changing ? "choose" : "voted";
  if (v.canVote) return "choose";
  return "blocked";
}

/** Le classement n'est pas servi à cette personne : la phrase qui dit quand il le sera. */
export function rankingHiddenLine(v: Pick<VoteView, "rankingHiddenReason">): string {
  return v.rankingHiddenReason === "vote_first" ? T.rankingAfterVote : T.rankingAtClose;
}

/** Largeur de la barre d'un classement (le premier à 100 %, un minimum visible dès une voix). */
export function rankingBarPercent(votes: number, top: number): number {
  if (top <= 0 || votes <= 0) return 0;
  return Math.max(4, Math.round((votes / top) * 100));
}

/** Ma place dans le classement servi (« 2e sur 5 »), `null` si ma voiture n'y est pas ou si le classement n'est pas servi. */
export function myRankIn(
  v: Pick<VoteView, "ranking" | "ownApplicationIds" | "candidatesCount">,
): { rank: number; of: number } | null {
  const mine = v.ranking?.find((r: VoteRankingEntry) => v.ownApplicationIds.includes(r.applicationId));
  return mine ? { rank: mine.rank, of: v.candidatesCount } : null;
}
