// Relectures d'un vote sur les messages du canal (lot R7l3, tour 2) : le jour J, des centaines de téléphones écoutent le même
// canal ; un message par voix, relu à chaque fois, ferait payer au serveur autant de lectures que de voix. Ici : au plus une
// relecture toutes les `VOTE_RELOAD_MIN_MS` (la première part tout de suite, les demandes suivantes n'en font qu'une, au plus
// tôt à l'échéance), regroupées derrière (`createCoalescedRun` : une lecture à la fois). La **grille** des candidats ne se relit
// que sur les messages qui la changent (`votes.candidates.changed`, `votes.opened`, `votes.closed`), pas à chaque voix. Pur.
import { createCoalescedRun } from "./coalesce";

/** Délai minimal entre deux relectures déclenchées par le canal (le site garde le même, 10 s). */
export const VOTE_RELOAD_MIN_MS = 10_000;

/** Les messages du canal qui changent la liste des candidats d'un vote (pas une simple voix de plus). */
export const VOTE_GRID_MESSAGES: ReadonlySet<string> = new Set([
  "votes.candidates.changed",
  "votes.opened",
  "votes.closed",
]);

/** Au plus un appel toutes les `minIntervalMs` : le premier part tout de suite, les suivants n'en font qu'un, à l'échéance. */
export function createThrottledRun<T>(
  run: () => Promise<T>,
  minIntervalMs: number,
  now: () => number = Date.now,
): () => Promise<T> {
  let lastStart = Number.NEGATIVE_INFINITY;
  let pending: Promise<T> | null = null;
  return () => {
    if (pending) return pending;
    const wait = Math.max(0, lastStart + minIntervalMs - now());
    if (wait === 0) {
      lastStart = now();
      return run();
    }
    pending = new Promise<T>((resolve, reject) => {
      setTimeout(() => {
        pending = null;
        lastStart = now();
        run().then(resolve, reject);
      }, wait);
    });
    return pending;
  };
}

export interface VoteReloader {
  /** Un message du canal : relecture limitée ; la grille seulement si le message la change. */
  message(type: string): Promise<unknown>;
  /** Retour au premier plan ou reconnexion (messages manquables) : relecture limitée, grille comprise. */
  refresh(): Promise<unknown>;
}

/** `reload(withGrid)` relit le vote (et sa grille quand `withGrid`) ; l'appelant l'enveloppe, jamais de relecture en double. */
export function createVoteReloader(
  reload: (withGrid: boolean) => Promise<unknown>,
  options: { minIntervalMs?: number; now?: () => number } = {},
): VoteReloader {
  let wantGrid = false;
  const run = createThrottledRun(
    createCoalescedRun(async () => {
      const withGrid = wantGrid;
      wantGrid = false;
      try {
        return await reload(withGrid);
      } catch (error) {
        if (withGrid) wantGrid = true; // la grille n'a pas été relue : la prochaine relecture s'en charge
        throw error;
      }
    }),
    options.minIntervalMs ?? VOTE_RELOAD_MIN_MS,
    options.now,
  );
  return {
    message(type) {
      if (VOTE_GRID_MESSAGES.has(type)) wantGrid = true;
      return run();
    },
    refresh() {
      wantGrid = true;
      return run();
    },
  };
}
