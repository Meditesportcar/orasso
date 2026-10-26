import { describe, expect, it } from "vitest";
import { fitWideWordSize, wideWordEm } from "./wideWord";

describe("pseudo en Archivo large : la chasse de chaque signe (lot R5b, tour 2)", () => {
  it("« R5SD_MNGKQ0 » est plus large que la moyenne de 0,92 corps par signe ; « ILLI » plus étroit", () => {
    expect(wideWordEm("R5sD_mngkq0")).toBeGreaterThan(11 * 0.92);
    expect(wideWordEm("ILLI")).toBeLessThan(4 * 0.92);
    // Minuscules, accents : comptés comme les capitales affichées.
    expect(wideWordEm("élodie")).toBeCloseTo(wideWordEm("ELODIE"), 5);
  });

  it("le corps fait tenir le pseudo dans sa colonne (238 px du site à 390 px), entre le plancher et le plafond", () => {
    const size = fitWideWordSize("R5sD_mngkq0", 238, 32, 14);
    expect(size * wideWordEm("R5sD_mngkq0")).toBeLessThanOrEqual(238);
    expect(fitWideWordSize("Kenji", 238, 32, 14)).toBe(32);
    expect(fitWideWordSize("MMMMMMMMMMMMMMMMMMMMMMMM", 120, 32, 14)).toBe(14);
    expect(fitWideWordSize("Kenji", 0, 32, 14)).toBe(32);
  });
});
