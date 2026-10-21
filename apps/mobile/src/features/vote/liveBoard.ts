// Classement en direct du vote (lot 59d) : réconcilie les messages `votes.changed` avec les réponses HTTP.
// Un message reçu AVANT le départ d'une requête de classement est dépassé par sa réponse (votes manqués pendant une
// coupure inclus) : il est abandonné quand la réponse arrive. Un message reçu pendant la requête reste affiché.
// Les réponses sont ordonnées (tour 2) : une réponse partie avant la dernière appliquée est ignorée, le classement et le
// total ne reculent jamais à cause d'un réseau qui rend les réponses dans le désordre.

import type { AudienceVotesChanged } from "@orasso/shared";

/** Réponses ordonnées par départ : une réponse plus ancienne que la dernière appliquée rend la valeur appliquée. */
export type Latest<T> = {
  /** Au départ d'une requête : son numéro. */
  begin: () => number;
  /** À l'arrivée : la valeur à afficher (la réponse, ou la plus récente déjà appliquée si celle-ci est dépassée). */
  settle: (request: number, fresh: T) => { value: T; stale: boolean };
  /** Valeur posée hors requête (réponse d'un vote) : les requêtes parties avant sont dépassées. */
  set: (value: T) => void;
};

export function createLatest<T>(): Latest<T> {
  let requests = 0;
  let applied: { request: number; value: T } | null = null;
  return {
    begin: () => {
      requests += 1;
      return requests;
    },
    settle(request, fresh) {
      if (applied && applied.request > request) return { value: applied.value, stale: true };
      applied = { request, value: fresh };
      return { value: fresh, stale: false };
    },
    set(value) {
      requests += 1;
      applied = { request: requests, value };
    },
  };
}

export type LiveBoardToken = { seq: number; request: number };

export type LiveBoard<B> = {
  /** Message `votes.changed` reçu ; rend le message à afficher. */
  receive: (payload: AudienceVotesChanged) => AudienceVotesChanged;
  /** À appeler au départ d'une requête de classement ; rend le jeton à rendre à `loaded`. */
  begin: () => LiveBoardToken;
  /** À l'arrivée de la réponse : le classement à garder et le message encore valable (ou null). */
  loaded: (token: LiveBoardToken, fresh: B) => { board: B; live: AudienceVotesChanged | null };
};

export function createLiveBoard<B = unknown>(): LiveBoard<B> {
  let seq = 0;
  let live: { seq: number; payload: AudienceVotesChanged } | null = null;
  const order = createLatest<B>();
  return {
    receive(payload) {
      seq += 1;
      live = { seq, payload };
      return payload;
    },
    begin: () => ({ seq, request: order.begin() }),
    loaded(token, fresh) {
      const { value, stale } = order.settle(token.request, fresh);
      // Réponse dépassée : ni le classement ni le message en cours ne changent.
      if (!stale && live && live.seq <= token.seq) live = null;
      return { board: value, live: live?.payload ?? null };
    },
  };
}

/** Suit les chargements d'une porte (ouverture comprise) : savoir, une fois au repos, si le dernier lot a réussi. */
export type LoadTracker = {
  track: <T>(load: () => Promise<T>) => Promise<T>;
  /** Résout quand aucun chargement n'est en cours : vrai si tous ceux du dernier lot ont réussi (faux si aucun). */
  idle: () => Promise<boolean>;
};

export function createLoadTracker(): LoadTracker {
  let inFlight = 0;
  let failedInBatch = false;
  let lastOk = false;
  let waiters: Array<(ok: boolean) => void> = [];
  const finish = () => {
    inFlight -= 1;
    if (inFlight > 0) return;
    lastOk = !failedInBatch;
    failedInBatch = false;
    const done = waiters;
    waiters = [];
    for (const w of done) w(lastOk);
  };
  return {
    async track(load) {
      inFlight += 1;
      try {
        return await load();
      } catch (e) {
        failedInBatch = true;
        throw e;
      } finally {
        finish();
      }
    },
    idle: () => (inFlight === 0 ? Promise.resolve(lastOk) : new Promise((resolve) => waiters.push(resolve))),
  };
}

type Gate = { request: () => void };

/**
 * Abonnement confirmé au canal du vote. Le premier ne recharge que ce que l'ouverture n'a pas chargé (chargement
 * échoué ou absent, ex. écran ouvert hors ligne) : 150 téléphones ouverts au même signal ne doublent pas leurs
 * requêtes. Les suivants (reconnexion : des messages ont pu être manqués) rechargent toujours, par les portes.
 */
export function createVoteSubscription(
  gates: { board: Gate; list: Gate },
  loads: { board: LoadTracker; list: LoadTracker },
): { onSubscribed: () => void } {
  let subscriptions = 0;
  return {
    onSubscribed() {
      subscriptions += 1;
      if (subscriptions > 1) {
        gates.board.request();
        gates.list.request();
        return;
      }
      for (const key of ["board", "list"] as const) {
        void loads[key].idle().then((ok) => {
          if (!ok) gates[key].request();
        });
      }
    },
  };
}
