import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

import { createLatest, createLiveBoard, createLoadTracker, createVoteSubscription } from "./liveBoard";
import { createRefreshGate } from "./refreshGate";

const msg = (total: number) => ({ total, top3: [] });
const http = (total: number) => ({ total });

/** Total affiché par l'écran : celui du message en direct s'il en reste un, sinon celui du classement HTTP. */
const shown = (r: { board: { total: number }; live: { total: number } | null }) => r.live?.total ?? r.board.total;

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createLiveBoard", () => {
  it("la réponse HTTP chargée après des votes manqués remplace le dernier message : total 12, pas 5", () => {
    const board = createLiveBoard<{ total: number }>();
    board.receive(msg(5)); // dernier message avant la coupure
    const token = board.begin(); // reconnexion : rechargement HTTP (total 12)
    const r = board.loaded(token, http(12));
    expect(r.live).toBeNull();
    expect(shown(r)).toBe(12);
  });

  it("un message reçu pendant la requête reste affiché : total 13", () => {
    const board = createLiveBoard<{ total: number }>();
    board.receive(msg(5));
    const token = board.begin();
    board.receive(msg(13));
    const r = board.loaded(token, http(12));
    expect(r.live).toEqual(msg(13));
    expect(shown(r)).toBe(13);
  });

  it("sans message, le total est celui de la réponse", () => {
    const board = createLiveBoard<{ total: number }>();
    const r = board.loaded(board.begin(), http(4));
    expect(r.live).toBeNull();
    expect(shown(r)).toBe(4);
  });

  it("réponses dans le désordre : l'ancienne (5) n'écrase pas la récente (6), le total ne recule pas", () => {
    const board = createLiveBoard<{ total: number }>();
    const a = board.begin(); // chargement d'ouverture : la base compte 5
    board.receive(msg(6)); // un vote arrive, un rechargement B part
    const b = board.begin();
    const rb = board.loaded(b, http(6)); // B répond le premier
    expect(shown(rb)).toBe(6);
    const ra = board.loaded(a, http(5)); // A répond ensuite
    expect(ra.board).toEqual(http(6));
    expect(shown(ra)).toBe(6);
  });

  it("réponse ancienne arrivée en retard : le message en direct plus récent reste affiché", () => {
    const board = createLiveBoard<{ total: number }>();
    const a = board.begin();
    const b = board.begin();
    board.loaded(b, http(6));
    board.receive(msg(7));
    const ra = board.loaded(a, http(5));
    expect(shown(ra)).toBe(7);
  });
});

describe("createLatest", () => {
  it("une valeur posée par le vote n'est pas remplacée par un rechargement parti avant", () => {
    const mine = createLatest<string>();
    const before = mine.begin();
    mine.set("nouveau choix");
    expect(mine.settle(before, "ancien choix")).toEqual({ value: "nouveau choix", stale: true });
    const after = mine.begin();
    expect(mine.settle(after, "choix rechargé").value).toBe("choix rechargé");
  });
});

function setupSubscription() {
  const board = vi.fn(async () => undefined);
  const list = vi.fn(async () => undefined);
  const gates = {
    board: createRefreshGate({ run: board, minMs: 10_000 }),
    list: createRefreshGate({ run: list, minMs: 10_000 }),
  };
  const loads = { board: createLoadTracker(), list: createLoadTracker() };
  return { board, list, loads, subscription: createVoteSubscription(gates, loads) };
}

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

describe("createVoteSubscription", () => {
  it("ouverture réussie puis premier abonnement : le classement relu une fois après l'ouverture, ni grille ni mon vote", async () => {
    const { board, list, loads, subscription } = setupSubscription();
    const openBoard = deferred<number>();
    const openMine = deferred<number>();
    const openGrid = deferred<number>();
    const p1 = loads.board.track(() => openBoard.promise);
    const p2 = loads.list.track(() => openMine.promise);
    const p3 = loads.list.track(() => openGrid.promise);
    subscription.onSubscribed(); // ~100 ms après l'ouverture, les chargements sont encore en vol
    await flush();
    expect(board).not.toHaveBeenCalled(); // pas en même temps que la lecture d'ouverture
    openBoard.resolve(1);
    openMine.resolve(1);
    openGrid.resolve(1);
    await Promise.all([p1, p2, p3]);
    await flush();
    expect(board).toHaveBeenCalledTimes(1);
    expect(list).not.toHaveBeenCalled();
  });

  it("tour 3 : vote entre la lecture d'ouverture et l'abonnement, le compteur est à jour", async () => {
    let server = 5;
    const live = createLiveBoard<{ total: number }>();
    let shownTotal = 0;
    const readBoard = async () => {
      const token = live.begin();
      const fresh = { total: server };
      await Promise.resolve();
      const r = live.loaded(token, fresh);
      shownTotal = r.live?.total ?? r.board.total;
    };
    const loads = { board: createLoadTracker(), list: createLoadTracker() };
    const gates = {
      board: createRefreshGate({ run: () => loads.board.track(readBoard), minMs: 10_000 }),
      list: createRefreshGate({ run: async () => undefined, minMs: 10_000 }),
    };
    const subscription = createVoteSubscription(gates, loads);
    await loads.board.track(readBoard); // ouverture : 5 voix
    expect(shownTotal).toBe(5);
    server = 6; // un vote, avant que l'abonnement soit confirmé : aucun message reçu
    subscription.onSubscribed();
    await flush();
    await flush();
    expect(shownTotal).toBe(6);
  });

  it("ouverture hors ligne puis retour du réseau : le premier abonnement recharge ce qui a échoué", async () => {
    const { board, list, loads, subscription } = setupSubscription();
    await loads.board.track(() => Promise.reject(new Error("réseau"))).catch(() => undefined);
    await loads.list.track(() => Promise.resolve(1));
    await loads.list.track(() => Promise.reject(new Error("réseau"))).catch(() => undefined);
    subscription.onSubscribed();
    await flush();
    expect(board).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledTimes(1);
  });

  it("une grille en échec à l'ouverture (mine réussi en même temps) se recharge", async () => {
    const { list, loads, subscription } = setupSubscription();
    const grid = deferred<number>();
    const mine = deferred<number>();
    const p1 = loads.list.track(() => grid.promise).catch(() => undefined);
    const p2 = loads.list.track(() => mine.promise);
    subscription.onSubscribed();
    grid.reject(new Error("réseau"));
    mine.resolve(1);
    await Promise.all([p1, p2]);
    await flush();
    expect(list).toHaveBeenCalledTimes(1);
  });

  it("reconnexion : recharge toujours tout (messages manqués), par les portes", async () => {
    vi.useFakeTimers();
    try {
      const { board, list, loads, subscription } = setupSubscription();
      await loads.board.track(() => Promise.resolve(1));
      await loads.list.track(() => Promise.resolve(1));
      subscription.onSubscribed();
      await flush();
      expect(board).toHaveBeenCalledTimes(1);
      expect(list).not.toHaveBeenCalled();
      subscription.onSubscribed();
      await flush();
      expect(list).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(10_000); // le classement : à la fin de la fenêtre de sa porte
      expect(board).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("branchement dans VoteScreen", () => {
  const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "VoteScreen.tsx"), "utf8");

  it("l'abonnement confirmé passe par createVoteSubscription, avec les portes et les chargements suivis", () => {
    expect(source).toMatch(/createVoteSubscription\(gates\.current, loads\)/);
    expect(source).toMatch(/useChannel\([\s\S]*?\(\) => subscription\.current\?\.onSubscribed\(\),\s*\);/);
  });

  it("les trois chargements sont suivis et ordonnés", () => {
    expect(source.match(/loads\.board\.track\(/g)?.length).toBe(1);
    expect(source.match(/loads\.list\.track\(/g)?.length).toBe(2);
    expect(source).toMatch(/liveBoard\.loaded\(token, fresh\)/);
    expect(source).toMatch(/mineOrder\.settle\(/);
    expect(source).toMatch(/candidatesOrder\.settle\(/);
  });
});
