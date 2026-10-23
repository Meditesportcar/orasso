import { describe, expect, it } from "vitest";

import { fitWordSize, NARROW_EM, WIDE_EM } from "./fit";

describe("fitWordSize (lot M5, retour 01 : un mot ne se coupe jamais)", () => {
  it("le mot le plus long tient sur la largeur, quitte à baisser le corps", () => {
    const width = 190;
    const size = fitWordSize("Rassemblement de Narbonne", width, 19, 12, WIDE_EM);
    expect("Rassemblement".length * WIDE_EM * size).toBeLessThanOrEqual(width);
    expect(size).toBeLessThan(19);
  });

  it("un titre court garde la taille maximale ; le plancher est respecté", () => {
    expect(fitWordSize("Nocturne de Canet", 190, 19, 12, WIDE_EM)).toBe(19);
    expect(fitWordSize("Anticonstitutionnellement", 120, 19, 12, WIDE_EM)).toBe(12);
  });

  it("le compte à rebours : « J-6 » en grand, « Aujourd'hui » plus petit", () => {
    expect(fitWordSize("J-6", 120, 48, 24, NARROW_EM)).toBe(48);
    expect(fitWordSize("Aujourd'hui", 120, 48, 24, NARROW_EM)).toBeLessThan(48);
  });

  it("largeur inconnue (avant la mesure) : la taille maximale", () => {
    expect(fitWordSize("Rassemblement", 0, 19, 12, WIDE_EM)).toBe(19);
  });
});
