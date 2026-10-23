import { vehicleDrivetrains } from "@orasso/shared";
import { describe, expect, it } from "vitest";
import { vehicleEngines } from "./vehicle-engines";
import { vehicleReference } from "./vehicle-reference";

const referenceKeys = new Set(
  vehicleReference.flatMap((make) =>
    make.models.flatMap((model) => model.generations.map((g) => `${make.name}|${model.name}|${g.name}`)),
  ),
);

describe("motorisations du seed (lot M1)", () => {
  it("chaque clé existe dans le référentiel", () => {
    const unknown = Object.keys(vehicleEngines).filter((key) => !referenceKeys.has(key));
    expect(unknown).toEqual([]);
  });

  it("au moins 150 générations couvertes, chacune avec au moins une motorisation", () => {
    const entries = Object.values(vehicleEngines);
    expect(entries.length).toBeGreaterThanOrEqual(150);
    expect(entries.filter((engines) => engines.length === 0)).toEqual([]);
  });

  it("pas de doublon de nom par génération", () => {
    const duplicates = Object.entries(vehicleEngines).filter(
      ([, engines]) => new Set(engines.map((e) => e.name)).size !== engines.length,
    );
    expect(duplicates.map(([key]) => key)).toEqual([]);
  });

  it("valeurs dans les limites du schéma de véhicule", () => {
    for (const [key, engines] of Object.entries(vehicleEngines)) {
      for (const e of engines) {
        const label = `${key} ${e.name}`;
        expect(e.name.trim(), label).not.toBe("");
        if (e.powerHp !== null) expect(e.powerHp, label).toBeGreaterThanOrEqual(1);
        if (e.powerHp !== null) expect(e.powerHp, label).toBeLessThanOrEqual(2500);
        if (e.weightKg !== null) expect(e.weightKg, label).toBeGreaterThanOrEqual(50);
        if (e.weightKg !== null) expect(e.weightKg, label).toBeLessThanOrEqual(40000);
        if (e.drivetrain !== null) expect(vehicleDrivetrains, label).toContain(e.drivetrain);
      }
    }
  });
});
