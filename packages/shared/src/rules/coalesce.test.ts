import { describe, expect, it, vi } from "vitest";

import { createCoalescedRun } from "./coalesce";

/** Une lecture dont chaque réponse est donnée à la main, dans l'ordre de départ. */
function slowReads() {
  const answers: Array<(v: string) => void> = [];
  let started = 0;
  const run = () => {
    started++;
    return new Promise<string>((resolve) => answers.push(resolve));
  };
  return { run, answers, started: () => started };
}

describe("createCoalescedRun", () => {
  it("un message par seconde, lectures de 2 s : une seule lecture à la fois et chaque réponse s'applique", async () => {
    const reads = slowReads();
    const applied: string[] = [];
    const reload = createCoalescedRun(reads.run);
    const ask = () => void reload().then((v) => applied.push(v));
    ask(); // t=0
    ask(); // t=1 : la première court encore
    ask(); // t=2
    ask(); // t=3
    expect(reads.started()).toBe(1);
    reads.answers[0]?.("a");
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(applied).toContain("a"); // la première réponse s'applique
    expect(reads.started()).toBe(2); // une seule lecture en attente, relancée à la fin de la précédente
    reads.answers[1]?.("b");
    await new Promise((r) => setTimeout(r, 0));
    expect(applied).toEqual(["a", "b", "b", "b"]);
    expect(reads.started()).toBe(2);
  });

  it("une demande après la fin d'une lecture en lance une nouvelle", async () => {
    const reads = slowReads();
    const reload = createCoalescedRun(reads.run);
    const first = reload();
    reads.answers[0]?.("a");
    await first;
    const second = reload();
    expect(reads.started()).toBe(2);
    reads.answers[1]?.("b");
    expect(await second).toBe("b");
  });

  it("une lecture qui échoue ne bloque pas la suivante", async () => {
    let calls = 0;
    const reload = createCoalescedRun(async () => {
      calls++;
      if (calls === 1) throw new Error("coupure");
      return "ok";
    });
    await expect(reload()).rejects.toThrow("coupure");
    expect(await reload()).toBe("ok");
  });

  it("un message par seconde pendant 10 s, lectures de 2 s : l'écran se met à jour et finit sur la dernière lecture", async () => {
    vi.useFakeTimers();
    try {
      let version = 0; // l'état du serveur, qui change à chaque message
      let shown = 0;
      let applied = 0;
      const reload = createCoalescedRun(async () => {
        const seen = version;
        await new Promise((r) => setTimeout(r, 2_000));
        return seen;
      });
      for (let t = 0; t < 10; t++) {
        version++;
        void reload().then((v) => {
          shown = v;
          applied++;
        });
        await vi.advanceTimersByTimeAsync(1_000);
      }
      await vi.advanceTimersByTimeAsync(10_000);
      expect(applied).toBeGreaterThanOrEqual(5);
      expect(shown).toBe(10);
    } finally {
      vi.useRealTimers();
    }
  });
});
