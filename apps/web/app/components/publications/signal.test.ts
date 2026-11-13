import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { afterPostChanged, notifyPostChanged } from "./signal";

describe("afterPostChanged (P41)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("lance l'action une fois après le délai, même après plusieurs changements", () => {
    const run = vi.fn();
    const stop = afterPostChanged("p1", run, 2000);
    notifyPostChanged("p1");
    vi.advanceTimersByTime(1000);
    notifyPostChanged("p1");
    vi.advanceTimersByTime(1999);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(1);
    stop();
  });

  it("ignore une autre publication", () => {
    const run = vi.fn();
    const stop = afterPostChanged("p1", run, 2000);
    notifyPostChanged("p2");
    vi.advanceTimersByTime(5000);
    expect(run).not.toHaveBeenCalled();
    stop();
  });

  it("quitter la page annule l'échéance en cours : aucun rechargement ensuite", () => {
    const run = vi.fn();
    const stop = afterPostChanged("p1", run, 2000);
    notifyPostChanged("p1");
    vi.advanceTimersByTime(500);
    stop();
    vi.advanceTimersByTime(5000);
    expect(run).not.toHaveBeenCalled();
    notifyPostChanged("p1");
    vi.advanceTimersByTime(5000);
    expect(run).not.toHaveBeenCalled();
  });
});
