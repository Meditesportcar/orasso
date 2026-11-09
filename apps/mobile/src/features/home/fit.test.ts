import { wideWordEm } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import { fitWideTitleSize, fitWordSize, NARROW_EM, WIDE_EM } from "./fit";

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

describe("fitWideTitleSize (lot R7-0, tour 2 : « RASSEMBLEMEN / T DU LYDIA »)", () => {
  const info = 162; // colonne du ticket « Ta prochaine sortie » à 384 px
  it("le mot le plus large tient dans la colonne, police du système à 1 comme à 1,3", () => {
    for (const fontScale of [1, 1.15, 1.3]) {
      const size = fitWideTitleSize("Rassemblement du Lydia", info, fontScale, 19, 8);
      expect(wideWordEm("Rassemblement", 1.1) * size * fontScale).toBeLessThanOrEqual(info);
      expect(size).toBeLessThan(19);
      expect(size).toBeGreaterThanOrEqual(8);
    }
  });
  it("un titre court garde le corps du jeton ; largeur inconnue : le maximum", () => {
    expect(fitWideTitleSize("Expo JDM", info, 1, 19, 8)).toBe(19);
    expect(fitWideTitleSize("Rassemblement", 0, 1, 19, 8)).toBe(19);
  });
  it("une police agrandie fait baisser le corps, jamais sous le plancher", () => {
    expect(fitWideTitleSize("Rassemblement du Lydia", info, 1.3, 19, 8)).toBeLessThan(
      fitWideTitleSize("Rassemblement du Lydia", info, 1, 19, 8),
    );
    expect(fitWideTitleSize("Anticonstitutionnellement", 100, 1.3, 19, 8)).toBe(8);
  });
});
