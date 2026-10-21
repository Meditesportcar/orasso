// Classement en direct du vote (lot 59d) : réconcilie les messages `votes.changed` avec les réponses HTTP.
// Un message reçu AVANT le départ d'une requête de classement est dépassé par sa réponse (votes manqués pendant une
// coupure inclus) : il est abandonné quand la réponse arrive. Un message reçu pendant la requête reste affiché.

import type { AudienceVotesChanged } from "@orasso/shared";

export type LiveBoard = {
  /** Message `votes.changed` reçu ; rend le message à afficher. */
  receive: (payload: AudienceVotesChanged) => AudienceVotesChanged;
  /** À appeler au départ d'une requête de classement ; rend le jeton à rendre à `loaded`. */
  begin: () => number;
  /** À appeler à l'arrivée de la réponse ; rend le message encore valable (ou null). */
  loaded: (token: number) => AudienceVotesChanged | null;
};

export function createLiveBoard(): LiveBoard {
  let seq = 0;
  let live: { seq: number; payload: AudienceVotesChanged } | null = null;
  return {
    receive(payload) {
      seq += 1;
      live = { seq, payload };
      return payload;
    },
    begin: () => seq,
    loaded(token) {
      if (live && live.seq <= token) live = null;
      return live?.payload ?? null;
    },
  };
}

/** Premier abonnement comme reconnexion : l'écran ouvert hors ligne n'a rien chargé, un doublon est absorbé par les portes. */
export function onVoteSubscribed(gates: { board: { request: () => void }; list: { request: () => void } }): void {
  gates.board.request();
  gates.list.request();
}
