import { describe, expect, it, vi } from "vitest";

import { createRefreshGate } from "./refreshGate";

function setup(minMs = 10_000) {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  let active = 0;
  let maxActive = 0;
  const run = vi.fn(async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((r) => setTimeout(r, 200));
    active -= 1;
  });
  const gate = createRefreshGate({ run, minMs });
  return { gate, run, maxActive: () => maxActive };
}

describe("createRefreshGate", () => {
  it("dix pointages rapprochés : un rechargement tout de suite, un seul de rattrapage ensuite", async () => {
    const { gate, run, maxActive } = setup();
    for (let i = 0; i < 10; i++) {
      gate.request();
      await vi.advanceTimersByTimeAsync(100);
    }
    await vi.advanceTimersByTimeAsync(300);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(run).toHaveBeenCalledTimes(2); // le dernier rafraîchissement est garanti
    await vi.advanceTimersByTimeAsync(60_000);
    expect(run).toHaveBeenCalledTimes(2);
    expect(maxActive()).toBe(1);
    vi.useRealTimers();
  });

  it("ne lance jamais deux chargements à la fois, même fenêtre écoulée", async () => {
    const { gate, run, maxActive } = setup(50);
    gate.request();
    await vi.advanceTimersByTimeAsync(60);
    gate.request(); // le premier tourne encore (200 ms)
    await vi.advanceTimersByTimeAsync(1_000);
    expect(run).toHaveBeenCalledTimes(2);
    expect(maxActive()).toBe(1);
    vi.useRealTimers();
  });

  it("une demande après la fenêtre repart tout de suite", async () => {
    const { gate, run } = setup();
    gate.request();
    await vi.advanceTimersByTimeAsync(11_000);
    gate.request();
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("un échec du chargement ne bloque pas les suivants", async () => {
    vi.useFakeTimers();
    const run = vi.fn().mockRejectedValueOnce(new Error("503")).mockResolvedValue(undefined);
    const gate = createRefreshGate({ run, minMs: 100 });
    gate.request();
    await vi.advanceTimersByTimeAsync(10);
    gate.request();
    await vi.advanceTimersByTimeAsync(200);
    expect(run).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("dispose annule l'attente", async () => {
    const { gate, run } = setup();
    gate.request();
    await vi.advanceTimersByTimeAsync(300);
    gate.request();
    gate.dispose();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(run).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
