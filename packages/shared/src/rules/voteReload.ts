// Relectures d'un vote sur les messages du canal (lot R7l3, tour 2) : le jour J, des centaines de téléphones écoutent le même
// canal ; un message par voix, relu à chaque fois, ferait payer au serveur autant de lectures que de voix. Ici : au plus une
// relecture toutes les `VOTE_RELOAD_MIN_MS`, mesurées entre les **départs effectifs** (y compris celui d'une lecture qui
// attendait derrière une lecture lente : tour 3), une lecture à la fois, les demandes arrivées entre-temps n'en font qu'une.
// Les relectures que déclenche le canal partent avec une gigue de 0 à `VOTE_RELOAD_JITTER_MS` (150 téléphones ne relisent pas
// à la même milliseconde) ; jamais celles d'un geste de la personne. La **grille** des candidats ne se relit que sur les
// messages qui la changent (`votes.candidates.changed`, `votes.opened`, `votes.closed`), pas à chaque voix. Pur.

/** Délai minimal entre deux relectures déclenchées par le canal (le site garde le même, 10 s). */
export const VOTE_RELOAD_MIN_MS = 10_000;

/** Gigue maximale ajoutée au départ d'une relecture déclenchée par le canal. */
export const VOTE_RELOAD_JITTER_MS = 2_000;

/** Les messages du canal qui changent la liste des candidats d'un vote (pas une simple voix de plus). */
export const VOTE_GRID_MESSAGES: ReadonlySet<string> = new Set([
  "votes.candidates.changed",
  "votes.opened",
  "votes.closed",
]);

/**
 * Une lecture à la fois, au moins `minIntervalMs` entre deux **départs**. Les demandes arrivées avant le prochain départ n'en
 * font qu'une (même promesse) ; celles arrivées pendant une lecture en font une seule, qui part dès la fin de la lecture si le
 * délai est écoulé, sinon à l'échéance. `request(jitterMs)` ajoute une attente au départ (0 = geste de la personne : si une
 * demande sans gigue rejoint un groupe en attente, il part sans gigue).
 */
export function createPacedRun<T>(
  run: () => Promise<T>,
  minIntervalMs: number,
  now: () => number = Date.now,
): { request(jitterMs?: number): Promise<T>; cancel(): void } {
  interface Group {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (error: unknown) => void;
    jitterMs: number;
  }
  let lastStart = Number.NEGATIVE_INFINITY;
  let reading = false;
  let group: Group | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let timerAt = 0;

  const start = () => {
    timer = null;
    const g = group as Group;
    group = null;
    reading = true;
    lastStart = now();
    let p: Promise<T>;
    try {
      p = Promise.resolve(run());
    } catch (error) {
      p = Promise.reject(error);
    }
    const done = () => {
      reading = false;
      schedule();
    };
    p.then(
      (value) => {
        g.resolve(value);
        done();
      },
      (error) => {
        g.reject(error);
        done();
      },
    );
  };

  const schedule = () => {
    if (reading || !group) return;
    const target = Math.max(now(), lastStart + minIntervalMs) + group.jitterMs;
    if (timer !== null && timerAt <= target) return;
    if (timer !== null) clearTimeout(timer);
    const wait = target - now();
    if (wait <= 0) {
      start();
      return;
    }
    timerAt = target;
    timer = setTimeout(start, wait);
  };

  return {
    request(jitterMs = 0) {
      if (group) group.jitterMs = Math.min(group.jitterMs, jitterMs);
      else {
        let resolve!: (value: T) => void;
        let reject!: (error: unknown) => void;
        const promise = new Promise<T>((a, b) => {
          resolve = a;
          reject = b;
        });
        group = { promise, resolve, reject, jitterMs };
      }
      const { promise } = group;
      schedule();
      return promise;
    },
    /** Démontage : plus de minuterie, le groupe en attente est réglé (rejeté `vote_reload_cancelled`) ; une lecture en cours finit seule. */
    cancel() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      const g = group;
      group = null;
      g?.reject(new Error("vote_reload_cancelled"));
    },
  };
}

export interface VoteReloader {
  /** Un message du canal : relecture limitée, avec gigue ; la grille seulement si le message la change. */
  message(type: string): Promise<unknown>;
  /** Retour au premier plan ou « Réessayer » (messages manquables) : relecture limitée, sans gigue, grille comprise. */
  refresh(): Promise<unknown>;
  /** Reconnexion du canal (tour 4) : comme `refresh`, grille comprise, mais **avec** la gigue d'un message (le réseau revient pour tous en même temps). */
  reconnect(): Promise<unknown>;
  /** Démontage de l'écran : annule la relecture en attente (tour 4). */
  cancel(): void;
}

/** `reload(withGrid)` relit le vote (et sa grille quand `withGrid`) ; l'appelant l'enveloppe, jamais de relecture en double. */
export function createVoteReloader(
  reload: (withGrid: boolean) => Promise<unknown>,
  options: { minIntervalMs?: number; now?: () => number; random?: () => number; jitterMs?: number } = {},
): VoteReloader {
  let wantGrid = false;
  const random = options.random ?? Math.random;
  const jitterMs = options.jitterMs ?? VOTE_RELOAD_JITTER_MS;
  const paced = createPacedRun(
    async () => {
      const withGrid = wantGrid;
      wantGrid = false;
      try {
        return await reload(withGrid);
      } catch (error) {
        if (withGrid) wantGrid = true; // la grille n'a pas été relue : la prochaine relecture s'en charge
        throw error;
      }
    },
    options.minIntervalMs ?? VOTE_RELOAD_MIN_MS,
    options.now,
  );
  return {
    message(type) {
      if (VOTE_GRID_MESSAGES.has(type)) wantGrid = true;
      return paced.request(random() * jitterMs);
    },
    refresh() {
      wantGrid = true;
      return paced.request(0);
    },
    reconnect() {
      wantGrid = true;
      return paced.request(random() * jitterMs);
    },
    cancel: () => paced.cancel(),
  };
}
