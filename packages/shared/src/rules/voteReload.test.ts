import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createPacedRun, createVoteReloader, VOTE_RELOAD_MIN_MS } from "./voteReload";

/** Sans gigue (hasard à 0) sauf mention : les tests de temps lisent des départs exacts. */
const noJitter = { random: () => 0 };

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
    }, noJitter);
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
    }, noJitter);
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
    }, noJitter);
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
    }, noJitter);
    await expect(reloader.message("votes.closed")).rejects.toThrow("coupure");
    fail = false;
    void reloader.message("votes.changed");
    await vi.advanceTimersByTimeAsync(VOTE_RELOAD_MIN_MS);
    expect(reads).toEqual([true, true]);
  });

  it("une première lecture de 25 s : les départs restent espacés d'au moins 10 s (pas 0, 25, 30)", async () => {
    const starts: number[] = [];
    const reloader = createVoteReloader(async () => {
      starts.push(Date.now());
      await new Promise((r) => setTimeout(r, starts.length === 1 ? 25_000 : 100));
    }, noJitter);
    void reloader.message("votes.changed"); // t = 0 : part tout de suite, dure 25 s
    await vi.advanceTimersByTimeAsync(1_000);
    void reloader.message("votes.changed"); // t = 1 s : attend derrière la lecture lente
    await vi.advanceTimersByTimeAsync(24_000); // t = 25 s : la lecture finit, la suivante part (10 s écoulées depuis 0)
    expect(starts).toEqual([0, 25_000]);
    await vi.advanceTimersByTimeAsync(1_000);
    void reloader.message("votes.changed"); // t = 26 s : doit attendre 35 s, pas partir à 26
    await vi.advanceTimersByTimeAsync(20_000);
    expect(starts).toEqual([0, 25_000, 35_000]);
    for (let i = 1; i < starts.length; i++)
      expect((starts[i] as number) - (starts[i - 1] as number)).toBeGreaterThanOrEqual(VOTE_RELOAD_MIN_MS);
  });

  it("une lecture lente de 25 s puis une demande à 5 s : la suivante attend la fin de la lecture (jamais deux à la fois)", async () => {
    let running = 0;
    let maxRunning = 0;
    const reloader = createVoteReloader(async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((r) => setTimeout(r, 25_000));
      running--;
    }, noJitter);
    void reloader.message("votes.changed");
    await vi.advanceTimersByTimeAsync(5_000);
    void reloader.message("votes.changed");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(maxRunning).toBe(1);
  });

  it("gigue : un message du canal part après 0 à 2 s ; un geste de la personne (retour au premier plan) part sans attendre", async () => {
    const reads: number[] = [];
    const reloader = createVoteReloader(async () => void reads.push(Date.now()), { random: () => 0.5 });
    void reloader.message("votes.changed");
    await vi.advanceTimersByTimeAsync(999);
    expect(reads).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(reads).toEqual([1_000]); // 0,5 × 2 s
    // Un geste : sans gigue, à l'échéance exacte du délai minimal (10 s après le départ de 1 s).
    await vi.advanceTimersByTimeAsync(2_000);
    void reloader.refresh();
    await vi.advanceTimersByTimeAsync(8_000);
    expect(reads).toEqual([1_000, 11_000]);
  });

  it("un geste qui rejoint une relecture du canal en attente lui retire la gigue", async () => {
    const reads: number[] = [];
    const reloader = createVoteReloader(async () => void reads.push(Date.now()), { random: () => 0.99 });
    void reloader.message("votes.changed"); // gigue de ~2 s
    await vi.advanceTimersByTimeAsync(100);
    void reloader.refresh();
    await vi.advanceTimersByTimeAsync(0);
    expect(reads).toEqual([100]);
  });

  it("la gigue est tirée au hasard entre 0 et 2 s (150 téléphones, 150 départs différents)", async () => {
    const starts = new Set<number>();
    for (let i = 0; i < 50; i++) {
      const reloader = createVoteReloader(async () => void starts.add(Date.now()), {
        random: () => i / 50,
      });
      void reloader.message("votes.changed");
    }
    await vi.advanceTimersByTimeAsync(2_000);
    expect(starts.size).toBe(50);
    expect(Math.min(...starts)).toBe(0);
    expect(Math.max(...starts)).toBeLessThan(2_000);
  });

  it("grille chargée, candidats changés, panne, message suivant : la grille est relue (la relecture de l'appli ne rejette jamais, l'enveloppe lève)", async () => {
    // Imite l'enveloppe de `useVote` : `grid.reload()` absorbe l'erreur (résultat null), l'échec est noté à part et relevé.
    let gridDown = false;
    let gridFailed = false;
    const gridReads: string[] = [];
    const gridReload = async () => {
      if (gridDown) {
        gridFailed = true;
        return null;
      }
      gridFailed = false;
      gridReads.push("ok");
      return [];
    };
    const reloader = createVoteReloader(async (withGrid) => {
      if (withGrid) await gridReload();
      if (withGrid && gridFailed) throw new Error("grid_reload_failed");
    }, noJitter);
    gridDown = true;
    await expect(reloader.message("votes.candidates.changed")).rejects.toThrow("grid_reload_failed");
    gridDown = false; // le réseau revient ; un simple message de voix suffit à relire la grille
    void reloader.message("votes.changed");
    await vi.advanceTimersByTimeAsync(VOTE_RELOAD_MIN_MS);
    expect(gridReads).toEqual(["ok"]);
  });

  it("reconnexion du canal : départ décalé dans [0, 2 s] avec la grille ; le premier plan reste immédiat (tour 4)", async () => {
    const reads: Array<[number, boolean]> = [];
    const reloader = createVoteReloader(async (g) => void reads.push([Date.now(), g]), { random: () => 0.75 });
    void reloader.reconnect();
    await vi.advanceTimersByTimeAsync(1_499);
    expect(reads).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(reads).toEqual([[1_500, true]]); // 0,75 × 2 s, grille comprise
    const other = createVoteReloader(async (g) => void reads.push([Date.now(), g]), { random: () => 0.75 });
    void other.refresh();
    await vi.advanceTimersByTimeAsync(0);
    expect(reads[1]).toEqual([1_500, true]); // premier plan : immédiat
    for (const r of [0, 0.5, 0.999]) {
      const t0 = Date.now();
      const at: number[] = [];
      const x = createVoteReloader(async () => void at.push(Date.now() - t0), { random: () => r });
      void x.reconnect();
      await vi.advanceTimersByTimeAsync(2_000);
      expect(at).toHaveLength(1);
      expect(at[0]).toBeLessThan(2_000);
    }
  });

  it("démontage : une demande en attente puis cancel() ne lance aucune lecture, même après le délai (tour 4)", async () => {
    const reads: number[] = [];
    const reloader = createVoteReloader(async () => void reads.push(Date.now()), { random: () => 0.5 });
    void reloader.message("votes.changed"); // part à 1 s
    await vi.advanceTimersByTimeAsync(1_000);
    void reloader.message("votes.changed"); // en attente derrière le délai de 10 s
    const waiting = reloader.message("votes.changed");
    reloader.cancel();
    await expect(waiting).rejects.toThrow("vote_reload_cancelled");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(reads).toEqual([1_000]);
    expect(vi.getTimerCount()).toBe(0);
    // Le relecteur reste utilisable (remontage).
    void reloader.refresh();
    await vi.advanceTimersByTimeAsync(0);
    expect(reads.length).toBe(2);
  });

  it("createPacedRun : le premier appel part tout de suite, les suivants n'en font qu'un", async () => {
    const run = vi.fn(async () => "ok");
    const paced = createPacedRun(run, 10_000);
    await paced.request();
    expect(run).toHaveBeenCalledTimes(1);
    const a = paced.request();
    const b = paced.request();
    expect(a).toBe(b);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await a).toBe("ok");
    expect(run).toHaveBeenCalledTimes(2);
  });
});
