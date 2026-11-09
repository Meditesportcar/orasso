import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { rankingZoneState, runAtDeadline } from "./voteScreen";

describe("minuterie de la clôture du vote", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("relit une seule fois, à l'échéance, sans message du serveur", () => {
    vi.setSystemTime(new Date("2026-11-10T22:59:00Z"));
    const run = vi.fn();
    runAtDeadline(new Date("2026-11-10T23:00:00Z"), run, () => new Date());
    vi.advanceTimersByTime(59_000);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2_000); // l'échéance et la marge sont passées
    expect(run).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(3_600_000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("une échéance déjà passée ne déclenche rien ; l'annulation arrête la minuterie", () => {
    vi.setSystemTime(new Date("2026-11-10T23:30:00Z"));
    const late = vi.fn();
    runAtDeadline(new Date("2026-11-10T23:00:00Z"), late, () => new Date());
    runAtDeadline(null, late, () => new Date());
    const early = vi.fn();
    const stop = runAtDeadline(new Date("2026-11-11T00:00:00Z"), early, () => new Date());
    stop();
    vi.advanceTimersByTime(3_600_000);
    expect(late).not.toHaveBeenCalled();
    expect(early).not.toHaveBeenCalled();
  });

  it("une échéance lointaine se ré-arme (le délai d'une minuterie est plafonné) et part à l'heure", () => {
    vi.setSystemTime(new Date("2026-11-01T10:00:00Z"));
    const run = vi.fn();
    runAtDeadline(new Date("2026-11-10T23:00:00Z"), run, () => new Date());
    vi.advanceTimersByTime(9 * 24 * 3_600_000);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(13 * 3_600_000 + 5_000);
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe("classement après le vote", () => {
  it("servi : on l'affiche", () => {
    expect(rankingZoneState({ voted: true, rankingHidden: false, loadFailed: false })).toBe("ready");
    expect(rankingZoneState({ voted: false, rankingHidden: false, loadFailed: false })).toBe("ready");
  });
  it("pas voté : « s'affiche après ton vote »", () => {
    expect(rankingZoneState({ voted: false, rankingHidden: true, loadFailed: false })).toBe("hidden");
  });
  it("vote réussi, relecture en cours ou échouée (HTTP, réseau) : jamais un écran vide sans explication", () => {
    expect(rankingZoneState({ voted: true, rankingHidden: true, loadFailed: false })).toBe("loading");
    expect(rankingZoneState({ voted: true, rankingHidden: true, loadFailed: true })).toBe("failed");
  });
});
