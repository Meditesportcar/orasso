import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createThrottledRun, createVoteReloader, VOTE_RELOAD_MIN_MS } from "./voteReload";

describe("relectures d'un vote (charge du jour J)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => vi.useRealTimers());

  it("un message par seconde pendant 30 s : au plus 3 relectures, la grille seulement sur les trois événements qui la changent", async () => {
    const reads: boolean[] = [];
    const reloader = createVoteReloader(async (withGrid) => {
      reads.push(withGrid);
    });
    // 30 messages (t = 0 … 29 s) : des voix, et trois événements qui changent la grille (t = 5, 15, 25).
    const gridAt: Record<number, string> = { 5: "votes.opened", 15: "votes.candidates.changed", 25: "votes.closed" };
    for (let t = 0; t < 30; t++) {
      void reloader.message(gridAt[t] ?? "votes.changed");
      await vi.advanceTimersByTimeAsync(t === 29 ? 999 : 1_000); // on s'arrête juste avant la 30e seconde
    }
    // t = 0 (partie tout de suite), 10, 20 : trois lectures sur les 30 s.
    expect(reads).toHaveLength(3);
    // Chaque lecture de grille correspond à un événement qui la change, aucune à une simple voix.
    expect(reads).toEqual([false, true, true]);
    // La dernière demande (t = 25, closed) est servie à 30 s, avec la grille.
    await vi.advanceTimersByTimeAsync(1);
    expect(reads).toEqual([false, true, true, true]);
  });

  it("des voix seules ne relisent jamais la grille", async () => {
    const reads: boolean[] = [];
    const reloader = createVoteReloader(async (withGrid) => {
      reads.push(withGrid);
    });
    for (let t = 0; t < 60; t++) {
      void reloader.message("theme_votes.changed");
      await vi.advanceTimersByTimeAsync(1_000);
    }
    expect(reads.length).toBeLessThanOrEqual(7);
    expect(reads.every((g) => g === false)).toBe(true);
  });

  it("le retour au premier plan relit la grille, mais respecte le délai minimal", async () => {
    const reads: boolean[] = [];
    const reloader = createVoteReloader(async (withGrid) => {
      reads.push(withGrid);
    });
    void reloader.message("votes.changed");
    await vi.advanceTimersByTimeAsync(1_000);
    void reloader.refresh();
    expect(reads).toEqual([false]);
    await vi.advanceTimersByTimeAsync(VOTE_RELOAD_MIN_MS);
    expect(reads).toEqual([false, true]);
  });

  it("une relecture de grille qui échoue est refaite à la suivante", async () => {
    const reads: boolean[] = [];
    let fail = true;
    const reloader = createVoteReloader(async (withGrid) => {
      reads.push(withGrid);
      if (fail) throw new Error("coupure");
    });
    await expect(reloader.message("votes.closed")).rejects.toThrow("coupure");
    fail = false;
    void reloader.message("votes.changed");
    await vi.advanceTimersByTimeAsync(VOTE_RELOAD_MIN_MS);
    expect(reads).toEqual([true, true]);
  });

  it("createThrottledRun : le premier appel part tout de suite, les suivants n'en font qu'un", async () => {
    const run = vi.fn(async () => "ok");
    const throttled = createThrottledRun(run, 10_000);
    await throttled();
    expect(run).toHaveBeenCalledTimes(1);
    const a = throttled();
    const b = throttled();
    expect(a).toBe(b);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await a).toBe("ok");
    expect(run).toHaveBeenCalledTimes(2);
  });
});
