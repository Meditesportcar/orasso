// Horloge centrale de l'appli (lot 34a) : avec et sans l'en-tête de l'API.
import { CLOCK_OFFSET_HEADER, formatClockOffset } from "@orasso/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applyClockHeader,
  clockAvailable,
  clockOffsetMs,
  now,
  nowMs,
  resetClockForTests,
  restoreClockOffset,
  setClockOffset,
  subscribeClock,
} from "./clock";

afterEach(() => {
  resetClockForTests();
  vi.useRealTimers();
});

describe("horloge centrale", () => {
  it("sans en-tête : exactement l'heure de l'appareil", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-17T10:00:00Z"));
    expect(clockOffsetMs()).toBe(0);
    expect(now().toISOString()).toBe("2026-10-17T10:00:00.000Z");
    expect(nowMs()).toBe(Date.now());
    // Une réponse sans l'en-tête (API sans horloge simulée) ne change rien.
    applyClockHeader(null);
    expect(clockOffsetMs()).toBe(0);
    expect(now().getTime()).toBe(Date.now());
  });

  it("avec l'en-tête : l'heure du serveur, en avance de ce décalage", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-17T10:00:00Z"));
    applyClockHeader(String(2 * 86_400_000 + 4 * 3_600_000));
    expect(now().toISOString()).toBe("2026-10-19T14:00:00.000Z");
    vi.advanceTimersByTime(60_000);
    expect(now().toISOString()).toBe("2026-10-19T14:01:00.000Z");
    expect(formatClockOffset(clockOffsetMs())).toBe("+2 j 4 h");
  });

  it("le décalage disparaît quand l'API cesse de l'annoncer, et la valeur illisible vaut zéro", () => {
    applyClockHeader("3600000");
    expect(clockOffsetMs()).toBe(3_600_000);
    applyClockHeader("0");
    expect(clockOffsetMs()).toBe(0);
    applyClockHeader("3600000");
    applyClockHeader(null);
    expect(clockOffsetMs()).toBe(0);
    applyClockHeader("abc");
    expect(clockOffsetMs()).toBe(0);
    expect(setClockOffset(-5)).toBe(false);
    expect(clockOffsetMs()).toBe(0);
  });

  it("hors ligne : le dernier décalage connu est repris au lancement, tant qu'aucune réponse ne le contredit", () => {
    restoreClockOffset(7_200_000);
    expect(clockOffsetMs()).toBe(7_200_000);
    // Une réponse arrive : elle prime, et un décalage gardé relu ensuite ne la remplace pas.
    applyClockHeader("60000");
    restoreClockOffset(7_200_000);
    expect(clockOffsetMs()).toBe(60_000);
  });

  it("prévient les écrans à chaque changement, pas quand la valeur ne bouge pas", () => {
    const listener = vi.fn();
    const stop = subscribeClock(listener);
    applyClockHeader("1000");
    applyClockHeader("1000");
    applyClockHeader("2000");
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
    applyClockHeader("0");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("l'horloge est proposée dès que l'API envoie l'en-tête, même à 0 (lot 35d)", () => {
    expect(clockAvailable()).toBe(false);
    const listener = vi.fn();
    const stop = subscribeClock(listener);
    applyClockHeader("0");
    expect(clockAvailable()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    applyClockHeader("0");
    expect(listener).toHaveBeenCalledTimes(1);
    applyClockHeader(null);
    expect(clockAvailable()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
  });

  it("l'en-tête est celui de l'API", () => {
    expect(CLOCK_OFFSET_HEADER).toBe("x-orasso-clock-offset");
  });
});
