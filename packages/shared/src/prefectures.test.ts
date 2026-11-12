import { describe, expect, it } from "vitest";

import { departments } from "./enums";
import { departmentCentroids, distanceKm } from "./geo";
import { departmentPrefectures } from "./prefectures";

describe("préfectures (T10)", () => {
  it("un code pour chaque département, ni manquant ni en trop", () => {
    expect(Object.keys(departmentPrefectures).sort()).toEqual([...departments].sort());
  });

  it("chaque préfecture est à moins de 120 km du centre de son département (attrape une faute de frappe)", () => {
    for (const [code, p] of Object.entries(departmentPrefectures)) {
      const centre = departmentCentroids[code];
      expect(centre, code).toBeDefined();
      if (!centre) continue;
      // La Guyane (973) : le centre est au milieu de la forêt, Cayenne sur la côte.
      expect(distanceKm(p, centre), `${code} ${p.city}`).toBeLessThan(code === "973" ? 200 : 120);
    }
  });

  it("valeurs figées", () => {
    expect(departmentPrefectures["66"]?.city).toBe("Perpignan");
    expect(departmentPrefectures["2A"]?.city).toBe("Ajaccio");
    expect(departmentPrefectures["974"]?.city).toBe("Saint-Denis");
  });

  it("des noms et des coordonnées à deux décimales", () => {
    for (const [code, p] of Object.entries(departmentPrefectures)) {
      expect(p.city.length, code).toBeGreaterThan(2);
      expect(Math.round(p.lat * 100) / 100, code).toBe(p.lat);
      expect(Math.round(p.lng * 100) / 100, code).toBe(p.lng);
    }
  });
});
