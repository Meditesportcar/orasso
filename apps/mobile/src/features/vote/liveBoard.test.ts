import { describe, expect, it, vi } from "vitest";

import { createLiveBoard, onVoteSubscribed } from "./liveBoard";
import { createRefreshGate } from "./refreshGate";

const msg = (total: number) => ({ total, top3: [] });

describe("createLiveBoard", () => {
  it("la réponse HTTP chargée après des votes manqués remplace le dernier message (total 12, pas 5)", () => {
    const board = createLiveBoard();
    board.receive(msg(5)); // dernier message avant la coupure
    const token = board.begin(); // reconnexion : rechargement HTTP (total 12)
    expect(board.loaded(token)).toBeNull(); // le message est dépassé : on affiche la réponse HTTP
  });

  it("un message reçu pendant la requête reste affiché", () => {
    const board = createLiveBoard();
    board.receive(msg(5));
    const token = board.begin();
    board.receive(msg(13));
    expect(board.loaded(token)).toEqual(msg(13));
  });

  it("sans message, rien à superposer", () => {
    const board = createLiveBoard();
    expect(board.loaded(board.begin())).toBeNull();
  });
});

describe("onVoteSubscribed", () => {
  it("ouverture hors ligne puis retour du réseau : le premier abonnement confirmé recharge", async () => {
    const board = vi.fn(async () => undefined);
    const list = vi.fn(async () => undefined);
    const gates = {
      board: createRefreshGate({ run: board, minMs: 10_000 }),
      list: createRefreshGate({ run: list, minMs: 10_000 }),
    };
    onVoteSubscribed(gates); // premier abonnement confirmé, sans changement d'AppState
    await Promise.resolve();
    expect(board).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledTimes(1);
  });
});
