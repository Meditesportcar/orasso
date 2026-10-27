import { describe, expect, it } from "vitest";
import { LABEL_ROOM, tabBarLabelFits, tabLabelFit } from "./tabLabel";

const exhibitor = ["Explorer", "Sorties", "Accueil", "Garage", "Profil"];
const organizer = ["Événements", "Tri", "Direct", "Équipe", "Structure"];
const pro = ["Missions", "Candidatures", "Accueil", "Vitrine", "Profil"];

describe("tabBarLabelFits (lot R6-police, police du système agrandie)", () => {
  it("à l'échelle 1, rien ne change : l'ajustement de chaque libellé", () => {
    for (const set of [exhibitor, organizer, pro]) {
      expect(tabBarLabelFits(set, 1)).toEqual(set.map(tabLabelFit));
    }
  });

  it("à 1,3, le même corps pour les cinq, et le plus long tient sur une ligne", () => {
    for (const set of [exhibitor, organizer, pro]) {
      const fits = tabBarLabelFits(set, 1.3);
      expect(new Set(fits.map((f) => JSON.stringify(f))).size).toBe(1);
      const f = fits[0] ?? {};
      const size = (f.fontSize ?? 9.5) * 1.3;
      const em = f.fontFamily ? 0.75 : 0.874;
      const longest = Math.max(...set.map((l) => l.length));
      expect(longest * em * size).toBeLessThanOrEqual(LABEL_ROOM + 1e-9);
    }
  });

  it("« Explorer » reste en 115 %, en corps réduit", () => {
    const [f] = tabBarLabelFits(exhibitor, 1.3);
    expect(f?.fontFamily).toBeUndefined();
    expect(f?.fontSize).toBeLessThan(9.5);
  });
});
