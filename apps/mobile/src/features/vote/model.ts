// Prix du public, côté appli (lot 50) : ce qu'on déduit de ce que l'API renvoie pour dessiner l'écran. Les règles (qui
// peut voter, la fenêtre, le règlement) sont toutes dans l'API (lot 49) ; ici seulement de l'affichage.
import type { AudiencePrizeBoard, AudiencePrizeEntry, AudiencePrizeMine } from "@orasso/shared";

/** Ce que l'écran montre : le vote, ou pourquoi il n'est pas possible, ou le classement figé. */
export type VoteView = "vote" | "not_open" | "not_checked_in" | "closed" | "settled";

export function voteView(board: AudiencePrizeBoard | null, mine: AudiencePrizeMine | null): VoteView | null {
  if (!board || !mine) return null;
  if (board.settled) return "settled";
  if (mine.canVote) return "vote";
  if (mine.reason === "vote_closed" || (!board.open && board.total > 0)) return "closed";
  if (mine.reason === "not_checked_in") return "not_checked_in";
  return "not_open";
}

/** Largeur de la barre d'un véhicule, en pourcentage de celle du premier (au moins un trait quand il a des voix). */
export function barPercent(votes: number, top: number): number {
  if (votes <= 0 || top <= 0) return 0;
  return Math.max(4, Math.min(100, Math.round((votes / top) * 100)));
}

/** Mon meilleur rang : le mieux placé de mes véhicules pointés (« 4e sur 142 »). */
export function myRank(
  board: AudiencePrizeBoard,
  mine: Pick<AudiencePrizeMine, "ownApplicationIds">,
): { rank: number; of: number; entry: AudiencePrizeEntry } | null {
  const own = new Set(mine.ownApplicationIds);
  const entry = board.entries.find((e) => own.has(e.applicationId));
  return entry ? { rank: entry.rank, of: board.vehicles, entry } : null;
}

/** Vrai pour mon propre véhicule : grisé, « C'est toi », pas de voix pour soi-même. */
export function isOwn(entry: AudiencePrizeEntry, mine: Pick<AudiencePrizeMine, "ownApplicationIds">): boolean {
  return mine.ownApplicationIds.includes(entry.applicationId);
}

/**
 * Ordre de la grille : stable et sans rapport avec le classement (une grille triée par voix pousserait à voter pour le
 * premier). Les numéros « N° 1 » du prototype suivent cet ordre.
 */
export function gridOrder(entries: readonly AudiencePrizeEntry[]): AudiencePrizeEntry[] {
  return [...entries].sort((a, b) => a.applicationId.localeCompare(b.applicationId));
}
