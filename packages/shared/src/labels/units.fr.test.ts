import { describe, expect, it } from "vitest";
import { keepUnits, NBSP } from "./units.fr";

describe("keepUnits (lot R6-police)", () => {
  it("lie un nombre à son unité", () => {
    expect(keepUnits("Mer 28 oct · 7 h")).toBe(`Mer 28 oct · 7${NBSP}h`);
    expect(keepUnits("19 h 30")).toBe(`19${NBSP}h${NBSP}30`);
    expect(keepUnits("arrivée 18 h 30 – 19 h 15")).toBe(`arrivée 18${NBSP}h${NBSP}30 – 19${NBSP}h${NBSP}15`);
    expect(keepUnits("dans 1 h 42")).toBe(`dans 1${NBSP}h${NBSP}42`);
    expect(keepUnits("à 4,8 km de toi")).toBe(`à 4,8${NBSP}km de toi`);
    expect(keepUnits("abonnés 24 h · grades 48 h")).toBe(`abonnés 24${NBSP}h · grades 48${NBSP}h`);
    expect(keepUnits("dans 12 min")).toBe(`dans 12${NBSP}min`);
    expect(keepUnits("150 pts")).toBe(`150${NBSP}pts`);
  });
  it("lie « jour J », quelle que soit la casse", () => {
    expect(keepUnits("Météo prévue sur place le jour J")).toBe(`Météo prévue sur place le jour${NBSP}J`);
    expect(keepUnits("LE JOUR J")).toBe(`LE JOUR${NBSP}J`);
  });
  it("ne touche pas un mot qui commence comme une unité", () => {
    expect(keepUnits("3 sorties, 2 membres, 4 heures")).toBe("3 sorties, 2 membres, 4 heures");
    expect(keepUnits("le jour Jeudi")).toBe("le jour Jeudi");
  });
  it("est idempotent", () => {
    const once = keepUnits("7 h · 4 km");
    expect(keepUnits(once)).toBe(once);
  });
});
