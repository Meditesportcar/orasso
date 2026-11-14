// Petit lot de fin F : le champ `loading` de la réponse de « Pratique ». Relectures espacées, bornées, puis « Réessayer » ; horloge simulée.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PRACTICAL_LOADING_MAX_READS, PRACTICAL_MIN_GAP_MS, practicalLoadingDelay } from "./practicalRetry";
import { createReadCycle } from "./readCycle";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("calendrier de `loading`", () => {
  it("3, 6, 12, 24 s puis 20 s, jamais sous 15 s après le début, et rien au-delà de la borne", () => {
    const delays: number[] = [];
    for (let i = 0; i < PRACTICAL_LOADING_MAX_READS; i++) delays.push(practicalLoadingDelay(i) as number);
    expect(delays.slice(0, 5)).toEqual([3000, 6000, 12000, 24000, 20000]);
    expect(delays.slice(4).every((d) => d >= PRACTICAL_MIN_GAP_MS)).toBe(true);
    expect(practicalLoadingDelay(PRACTICAL_LOADING_MAX_READS)).toBeNull();
    expect(delays.reduce((a, b) => a + b, 0)).toBeLessThan(6 * 60_000);
  });

  it("tant que loading est vrai : relit aux délais ; borné ; puis exhausted (« Réessayer »), sans autre lecture", () => {
    let runs = 0;
    const cycle = createReadCycle({
      run: () => {
        runs += 1;
        cycle.begin();
        cycle.settled("loading");
      },
      visible: () => true,
    });
    cycle.begin();
    cycle.settled("loading");
    expect(cycle.exhausted()).toBe(false);
    vi.advanceTimersByTime(10 * 60_000);
    expect(runs).toBe(PRACTICAL_LOADING_MAX_READS);
    expect(cycle.exhausted()).toBe(true);
    vi.advanceTimersByTime(60 * 60_000);
    expect(runs).toBe(PRACTICAL_LOADING_MAX_READS);
    cycle.manual();
    expect(cycle.exhausted()).toBe(false);
  });

  it("une réponse complète pendant le chargement arrête les relectures", () => {
    let runs = 0;
    const cycle = createReadCycle({
      run: () => {
        runs += 1;
        cycle.begin();
        cycle.settled(runs >= 3 ? "complete" : "loading");
      },
      visible: () => true,
    });
    cycle.begin();
    cycle.settled("loading");
    vi.advanceTimersByTime(10 * 60_000);
    expect(runs).toBe(3);
    expect(cycle.exhausted()).toBe(false);
  });

  it("partial sans loading : une seule relecture espacée, puis exhausted", () => {
    let runs = 0;
    const cycle = createReadCycle({
      run: () => {
        runs += 1;
        cycle.begin();
        cycle.settled("partialOnce");
      },
      visible: () => true,
    });
    cycle.begin();
    cycle.settled("partialOnce");
    vi.advanceTimersByTime(10 * 60_000);
    expect(runs).toBe(1);
    expect(cycle.exhausted()).toBe(true);
  });

  it("écran masqué : aucune lecture ne part ; elle reprend au retour", () => {
    let visible = false;
    let runs = 0;
    const cycle = createReadCycle({
      run: () => {
        runs += 1;
        cycle.begin();
        cycle.settled("loading");
      },
      visible: () => visible,
    });
    cycle.begin();
    cycle.settled("loading");
    vi.advanceTimersByTime(60_000);
    expect(runs).toBe(0);
    visible = true;
    expect(cycle.resume()).toBe("started");
    expect(runs).toBe(1);
  });
});
