import { describe, expect, it } from "vitest";
import { vehicleUpdateSchema } from "../schemas/vehicle";
import {
  bodyColorByName,
  bodyColorFamilies,
  bodyColors,
  formatPreparation,
  parsePreparation,
  vehiclePreparations,
} from "./vehicleAdd";

describe("nuancier des couleurs de carrosserie", () => {
  it("donne des noms uniques, courts et rangés dans une famille connue", () => {
    const names = bodyColors.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
    for (const c of bodyColors) {
      expect(c.name.length).toBeLessThanOrEqual(40);
      expect(bodyColorFamilies).toContain(c.family);
      expect(c.hex).toMatch(/^#[0-9a-f]{6}$/);
      if (c.finish === "duo" || c.finish === "chameleon") expect(c.hex2).toMatch(/^#[0-9a-f]{6}$/);
    }
    for (const f of bodyColorFamilies) expect(bodyColors.some((c) => c.family === f)).toBe(true);
    expect(bodyColors.length).toBeGreaterThanOrEqual(40);
  });

  it("retrouve une teinte par son nom, sans casse ni accent, et les anciens noms", () => {
    expect(bodyColorByName("gris NARDO")).toBeNull();
    expect(bodyColorByName("bleu de france")?.name).toBe("Bleu de France");
    expect(bodyColorByName("Cameleon")?.name).toBe("Caméléon");
    expect(bodyColorByName("Blanche")?.name).toBe("Blanc");
    expect(bodyColorByName("Rouge")?.family).toBe("red");
    expect(bodyColorByName("")).toBeNull();
    expect(bodyColorByName(null)).toBeNull();
  });
});

describe("préparation", () => {
  it("s'écrit en texte lisible et se relit", () => {
    const text = formatPreparation(["wheels", "exhaust", "suspension"]);
    expect(text).toBe("Échappement · Suspension · Jantes");
    expect(parsePreparation(text)).toEqual({ items: ["exhaust", "suspension", "wheels"], note: "" });
    expect(formatPreparation([], "")).toBeNull();
    const withNote = formatPreparation(["engine"], "Reprogrammation stage 1");
    expect(parsePreparation(withNote)).toEqual({ items: ["engine"], note: "Reprogrammation stage 1" });
  });

  it("garde un texte libre d'avant comme note", () => {
    expect(parsePreparation("Échappement inox, intercooler, reprogrammation.")).toEqual({
      items: [],
      note: "Échappement inox, intercooler, reprogrammation.",
    });
    expect(parsePreparation("Jantes, freins")).toEqual({ items: ["wheels", "brakes"], note: "" });
    expect(parsePreparation(null)).toEqual({ items: [], note: "" });
  });

  it("tient dans le champ de l'API", () => {
    const all = formatPreparation([...vehiclePreparations]) ?? "";
    expect(vehicleUpdateSchema.shape.preparation.safeParse(all).success).toBe(true);
  });
});
