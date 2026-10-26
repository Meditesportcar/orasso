// Lot R5a : règles communes des styles (nom, clé normalisée, masculin, familles, types) et libellés accordés.
import { describe, expect, it } from "vitest";
import { styleLabels } from "../labels/styles.fr";
import { categoryProposalSchema } from "../schemas/styles";
import { makesForType } from "../schemas/vehicle";
import { categoryLabelFor, cleanStyleName, groupByFamily, styleFitsType, styleKey } from "./styles";

describe("styles", () => {
  it("nom tapé : nettoyé comme les noms du lot R4a, 2 à 24 caractères", () => {
    expect(cleanStyleName("  Café​   racer \u0007")).toBe("Café racer");
    expect(cleanStyleName("b")).toBeNull();
    expect(cleanStyleName("x".repeat(30))).toHaveLength(24);
    expect(categoryProposalSchema.safeParse({ label: " a ", vehicleType: "moto" }).success).toBe(false);
    expect(categoryProposalSchema.parse({ label: " Bobber ", vehicleType: "moto" }).label).toBe("Bobber");
  });

  it("clé normalisée : sans accents, casse, espaces ni ponctuation", () => {
    expect(styleKey("Café racer")).toBe("caferacer");
    expect(styleKey("CAFE-RACER")).toBe("caferacer");
    expect(styleKey("Enduro / Cross")).toBe("endurocross");
    expect(styleKey("Super-motard")).toBe(styleKey("supermotard"));
  });

  it("au masculin pour un camion quand le style en a un", () => {
    const ancienne = { label: "Ancienne", labelM: "Ancien" };
    expect(categoryLabelFor(ancienne, "truck")).toBe("Ancien");
    expect(categoryLabelFor(ancienne, "moto")).toBe("Ancienne");
    expect(categoryLabelFor({ label: "Drift", labelM: null }, "truck")).toBe("Drift");
    expect(styleLabels.dimmed(["Youngtimer", "Ancien"], "ton camion", 2008, true)).toBe(
      "Youngtimer et Ancien sont grisés : ton camion est de 2008.",
    );
    expect(styleLabels.dimmed(["Ancienne"], "ta moto", 2019, false)).toBe("Ancienne est grisée : ta moto est de 2019.");
  });

  it("familles dans l'ordre, sans les pays ni les familles vides ; types admis", () => {
    const rows = [
      { id: "a", family: "pratique" as const },
      { id: "b", family: "epoque" as const },
      { id: "c", family: "pays" as const },
      { id: "d", family: "epoque" as const },
    ];
    expect(groupByFamily(rows).map((g) => [g.family, g.rows.map((r) => r.id)])).toEqual([
      ["epoque", ["b", "d"]],
      ["pratique", ["a"]],
    ]);
    expect(styleFitsType(null, "truck")).toBe(true);
    expect(styleFitsType(["offroad"], "car")).toBe(true);
    expect(styleFitsType(["offroad"], "moto")).toBe(false);
    expect(styleFitsType(["moto", "truck"], "truck")).toBe(true);
  });

  it("marques d'un type : celles qui ont un modèle de ce type, « Autre » toujours", () => {
    const makes = [
      { name: "Seat", isOther: false, vehicleTypes: ["car" as const] },
      { name: "Honda", isOther: false, vehicleTypes: ["car" as const, "moto" as const] },
      { name: "Autre", isOther: true, vehicleTypes: [] },
    ];
    expect(makesForType(makes, "moto").map((m) => m.name)).toEqual(["Honda", "Autre"]);
    expect(makesForType(makes, "car").map((m) => m.name)).toEqual(["Seat", "Honda", "Autre"]);
  });
});
