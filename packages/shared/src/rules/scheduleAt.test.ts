import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MAX_TIMER_MS, scheduleAt } from "./scheduleAt";

describe("scheduleAt : minuteur jusqu'à une heure", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date("2026-11-01T10:00:00Z") }));
  afterEach(() => vi.useRealTimers());

  it("échéance à 13 jours : réarmé par étapes, déclenché à l'échéance et pas avant", () => {
    const fire = vi.fn();
    const target = Date.now() + 13 * 86_400_000;
    scheduleAt(target, Date.now, fire);
    vi.advanceTimersByTime(MAX_TIMER_MS);
    expect(fire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(13 * 86_400_000 - MAX_TIMER_MS - 1_000);
    expect(fire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2_000);
    expect(fire).toHaveBeenCalledTimes(1);
  });

  it("téléphone en avance de 10 min sur le serveur : l'heure serveur estimée décide", () => {
    const skew = -10 * 60_000; // serveur = téléphone - 10 min
    const serverNow = () => Date.now() + skew;
    const fire = vi.fn();
    scheduleAt(serverNow() + 60 * 60_000, serverNow, fire);
    vi.advanceTimersByTime(59 * 60_000);
    expect(fire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2 * 60_000);
    expect(fire).toHaveBeenCalledTimes(1);
  });

  it("téléphone en retard de 10 min : on se réveille à l'heure du serveur, pas 10 min trop tard", () => {
    const skew = 10 * 60_000; // serveur = téléphone + 10 min
    const serverNow = () => Date.now() + skew;
    const fire = vi.fn();
    scheduleAt(serverNow() + 30 * 60_000, serverNow, fire);
    vi.advanceTimersByTime(29 * 60_000);
    expect(fire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2 * 60_000);
    expect(fire).toHaveBeenCalledTimes(1);
  });

  it("annulation : rien ne part ; échéance passée : immédiat", () => {
    const fire = vi.fn();
    const cancel = scheduleAt(Date.now() + 1_000, Date.now, fire);
    cancel();
    vi.advanceTimersByTime(5_000);
    expect(fire).not.toHaveBeenCalled();
    scheduleAt(Date.now() - 1, Date.now, fire);
    expect(fire).toHaveBeenCalledTimes(1);
  });
});
