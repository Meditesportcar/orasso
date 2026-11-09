import { wideWordEm } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import { fitTitle, fitWideTitleSize, fitWordSize, NARROW_EM, TITLE_FLOOR, WIDE_EM } from "./fit";

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

describe("fitTitle (lot R7-0, tour 3 : plancher 11, puis toute la largeur de la carte)", () => {
  const column = 162; // colonne de la carte « Ta prochaine sortie » à 384 px
  const full = 310; // toute la largeur de la carte
  const widest = (title: string) => Math.max(...title.split(/\s+/).map((w) => wideWordEm(w, 1.1)));

  it("jamais sous 11, quel que soit le titre, la colonne ou la police du système", () => {
    for (const title of ["AUTOMOBILE-CLUB", "RASSEMBLEMENT", "Rassemblement du Lydia", "Expo JDM"]) {
      for (const fontScale of [1, 1.15, 1.3]) {
        for (const col of [120, 162, 222]) {
          const r = fitTitle(title, col, full, fontScale, 19);
          expect(r.size).toBeGreaterThanOrEqual(TITLE_FLOOR);
          expect(r.size).toBeLessThanOrEqual(19);
        }
      }
    }
  });

  it("« AUTOMOBILE-CLUB » et « RASSEMBLEMENT » : en colonne s'ils tiennent à 11, sinon toute la largeur, mot jamais coupé", () => {
    for (const title of ["AUTOMOBILE-CLUB", "RASSEMBLEMENT"]) {
      for (const fontScale of [1, 1.15, 1.3]) {
        const r = fitTitle(title, column, full, fontScale, 19);
        const room = (r.full ? full : column) / fontScale;
        expect(widest(title) * r.size).toBeLessThanOrEqual(room);
        // Passe en pleine largeur seulement si le mot ne tenait pas dans la colonne à 11.
        expect(r.full).toBe(widest(title) * TITLE_FLOOR * fontScale > column);
      }
    }
  });

  it("le plus large des deux : « AUTOMOBILE-CLUB » à 1,3 passe sur toute la largeur", () => {
    const r = fitTitle("AUTOMOBILE-CLUB", column, full, 1.3, 19);
    expect(r.full).toBe(true);
    expect(r.size).toBeGreaterThanOrEqual(TITLE_FLOOR);
  });

  it("un titre court reste en colonne au corps maximal ; largeur inconnue : le maximum, en colonne", () => {
    expect(fitTitle("Expo JDM", column, full, 1, 19)).toEqual({ size: 19, full: false });
    expect(fitTitle("RASSEMBLEMENT", 0, 0, 1, 19)).toEqual({ size: 19, full: false });
  });

  it("pleine largeur inconnue : le plancher, en colonne (pas de saut de mise en page à la mesure)", () => {
    expect(fitTitle("AUTOMOBILE-CLUB", 100, 0, 1.3, 19)).toEqual({ size: TITLE_FLOOR, full: false });
  });
});
