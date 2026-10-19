import { describe, expect, it } from "vitest";

import { isFullMoon, moonPhase, nearestFullMoon } from "./moon";
import { DAY, HOUR } from "./time";

// Pleines lunes connues (instants UTC publiés par l'IMCCE / la NASA).
const FULL_MOONS = [
  "2024-01-25T17:54:00Z",
  "2024-08-19T18:26:00Z",
  "2025-03-14T06:55:00Z",
  "2025-10-07T03:48:00Z",
  "2026-01-03T10:03:00Z",
].map((s) => new Date(s));

describe("phase de la Lune", () => {
  it.each(FULL_MOONS)("pleine lune du %s : phase ≈ 0,5, à moins de 15 h du calcul", (date) => {
    expect(Math.abs(moonPhase(date) - 0.5)).toBeLessThan(0.025);
    expect(Math.abs(nearestFullMoon(date).getTime() - date.getTime())).toBeLessThan(15 * HOUR);
    expect(isFullMoon(date)).toBe(true);
    // La veille au soir et le lendemain matin comptent encore (± 1 jour, avec la marge du calcul moyen).
    expect(isFullMoon(new Date(date.getTime() - 9 * HOUR))).toBe(true);
    expect(isFullMoon(new Date(date.getTime() + 9 * HOUR))).toBe(true);
  });

  it("une semaine avant ou après, ce n'est pas la pleine lune", () => {
    for (const date of FULL_MOONS) {
      expect(isFullMoon(new Date(date.getTime() - 7 * DAY))).toBe(false);
      expect(isFullMoon(new Date(date.getTime() + 7 * DAY))).toBe(false);
      expect(isFullMoon(new Date(date.getTime() + 3 * DAY))).toBe(false);
    }
  });

  it("nouvelle lune (éclipse du 8 avril 2024) : phase proche de 0 ou de 1", () => {
    const p = moonPhase(new Date("2024-04-08T18:21:00Z"));
    expect(Math.min(p, 1 - p)).toBeLessThan(0.025);
  });

  it("phase toujours entre 0 et 1, y compris avant la date de référence", () => {
    for (const s of ["1990-05-01T00:00:00Z", "2000-01-01T00:00:00Z", "2031-07-14T22:00:00Z"]) {
      const p = moonPhase(new Date(s));
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(1);
    }
  });
});
