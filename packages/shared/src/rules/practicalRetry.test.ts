import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createFollowTracker,
  createSingleTimer,
  PRACTICAL_MIN_GAP_MS,
  practicalReadAllowed,
  practicalRetryDelay,
  shouldRetryPractical,
  weatherFollowKey,
} from "./practicalRetry";

describe("relances de Pratique (R8q, tour 3)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("espacées : 15 s, 30 s, 60 s, puis toutes les 2 minutes", () => {
    expect([0, 1, 2, 3, 4, 9].map(practicalRetryDelay)).toEqual([15_000, 30_000, 60_000, 120_000, 120_000, 120_000]);
    expect(practicalRetryDelay(-3)).toBe(15_000);
  });

  it("sur une erreur réseau seulement, écran affiché et appli au premier plan", () => {
    expect(shouldRetryPractical({ network: true, focused: true, foreground: true })).toBe(true);
    // Un 403 (compte suspendu), un 429 ou un 404 ne se relancent pas.
    expect(shouldRetryPractical({ network: false, focused: true, foreground: true })).toBe(false);
    expect(shouldRetryPractical({ network: true, focused: false, foreground: true })).toBe(false);
    expect(shouldRetryPractical({ network: true, focused: true, foreground: false })).toBe(false);
  });

  it("jamais deux lectures à moins de 15 s l'une de l'autre : moins de 240 lectures par heure et par écran", () => {
    expect(practicalReadAllowed(0, 1)).toBe(true);
    expect(practicalReadAllowed(1_000, 1_000 + PRACTICAL_MIN_GAP_MS - 1)).toBe(false);
    expect(practicalReadAllowed(1_000, 1_000 + PRACTICAL_MIN_GAP_MS)).toBe(true);
  });

  it("une seule minuterie : en programmer une autre annule la précédente, annuler arrête tout", () => {
    const timer = createSingleTimer();
    const calls: string[] = [];
    timer.schedule(() => calls.push("a"), 500);
    timer.schedule(() => calls.push("b"), 500);
    vi.advanceTimersByTime(600);
    expect(calls).toEqual(["b"]);
    // Une chaîne d'attente d'identité qui se reprogramme reste unique, et rien ne survit au démontage.
    let tries = 0;
    const wait = () => {
      tries += 1;
      timer.schedule(wait, 500);
    };
    wait();
    wait();
    vi.advanceTimersByTime(1_600);
    expect(tries).toBe(2 + 3);
    timer.cancel();
    vi.advanceTimersByTime(5_000);
    expect(tries).toBe(2 + 3);
    expect(timer.pending()).toBe(false);
  });

  it("suivi de la météo : une tentative par lieu, remise à zéro au changement de compte, écho d'un geste ignoré", () => {
    let t = 1_000;
    const tracker = createFollowTracker(() => t, 10_000);
    expect(tracker.shouldFollow(null)).toBe(false);
    expect(tracker.shouldFollow("Perpignan")).toBe(true);
    expect(tracker.shouldFollow("Perpignan")).toBe(false);
    // Un autre compte reprend le même lieu : la première position n'est pas ignorée.
    tracker.reset();
    expect(tracker.shouldFollow("Perpignan")).toBe(true);
    // Un geste dans « Pratique » donne sa case à la météo : le lieu qui en résulte n'est pas relu.
    tracker.echo();
    expect(tracker.shouldFollow("Canet-en-Roussillon")).toBe(false);
    t += 11_000;
    expect(tracker.shouldFollow("Argelès-sur-Mer")).toBe(true);
  });

  it("tour 5 : deux cases distinctes qui portent toutes deux « Ma position » : la seconde est suivie ; la même case rafraîchie, rien", () => {
    const tracker = createFollowTracker(() => 0, 0);
    const a = weatherFollowKey({ lat: 42.5, lng: 3.0 });
    const b = weatherFollowKey({ lat: 42.7, lng: 2.9 });
    expect(a).not.toBe(b);
    expect(tracker.shouldFollow(a)).toBe(true);
    // Un rafraîchissement de la météo (même case, autre heure de prévision, même libellé) ne relance rien.
    expect(tracker.shouldFollow(weatherFollowKey({ lat: 42.5, lng: 3.0 }))).toBe(false);
    expect(tracker.shouldFollow(b)).toBe(true);
    expect(weatherFollowKey(null)).toBeNull();
  });
});
