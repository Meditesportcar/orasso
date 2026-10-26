// Lot R5a : règles communes des styles (nom, clé normalisée, masculin, familles, types) et libellés accordés.
import { describe, expect, it } from "vitest";
import { styleLabels } from "../labels/styles.fr";
import { categoryProposalSchema } from "../schemas/styles";
import { makesForType } from "../schemas/vehicle";
import {
  categoryLabelFor,
  choiceGroups,
  cleanStyleName,
  groupByFamily,
  styleFitsType,
  styleKey,
  styleTypesLabel,
  vehicleStyleGroups,
} from "./styles";

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
    // Tour 2 : une marque sans modèle de la liste vaut pour tous les types.
    expect(makesForType([{ isOther: false, vehicleTypes: [] }], "truck")).toHaveLength(1);
  });

  it("tour 2 : fiche à modifier : styles refusés ou en pause déjà posés, gardés et décochables", () => {
    const opt = (id: string, over: Record<string, unknown> = {}) => ({
      id,
      label: id,
      family: "genre" as const,
      allowedVehicleTypes: null,
      allowedCountries: null,
      eligible: true,
      refusal: null,
      reason: null,
      ...over,
    });
    const options = [
      opt("4x4", { eligible: false, refusal: "type", reason: "Ne convient pas à ce type de véhicule" }),
      opt("drift", { eligible: false, refusal: "type", reason: "Ne convient pas à ce type de véhicule" }),
      opt("poids-lourd"),
      opt("ancienne", { family: "epoque", eligible: false, refusal: "age", reason: "Véhicule trop récent" }),
      opt("allemande", { allowedCountries: ["DE"], eligible: false, refusal: "country" }),
      opt("suedoise", { allowedCountries: ["SE"] }),
    ];
    const current = [
      { id: "4x4", label: "4x4" },
      { id: "jdm", label: "JDM", family: "pays" as const, paused: true },
      { id: "moto", label: "Moto", family: "genre" as const, paused: true },
    ];
    const groups = vehicleStyleGroups(options, current, { keepRefused: true, origins: true });
    const flat = groups.flatMap((g) => g.rows.map((r) => `${g.family}:${r.id}:${r.eligible}:${r.kept || r.paused}`));
    expect(flat).toEqual([
      "epoque:ancienne:false:false",
      "genre:4x4:true:true",
      "genre:poids-lourd:true:false",
      "genre:moto:true:true",
      "pays:suedoise:true:false",
      "pays:jdm:true:true",
    ]);
    // Type ou marque changés : le style refusé n'est plus gardé.
    const changed = vehicleStyleGroups(options, current, { keepRefused: false, origins: false });
    expect(changed.flatMap((g) => g.rows.map((r) => r.id))).toEqual(["ancienne", "poids-lourd", "moto", "jdm"]);
  });

  it("tour 2 : centres d'intérêt et critères : par famille, pays en dernier, types restreints, pause gardée si choisie", () => {
    expect(styleTypesLabel(["truck"])).toBe("camion");
    expect(styleTypesLabel(["offroad"])).toBe("voiture");
    expect(styleTypesLabel(["moto", "truck"])).toBe("moto, camion");
    expect(styleTypesLabel(null)).toBeNull();
    const o = (id: string, label: string, family: string, types: string[] | null, over = {}) => ({
      id,
      label,
      family: family as "genre",
      allowedVehicleTypes: types,
      allowedCountries: null as string[] | null,
      eligible: true,
      refusal: null,
      reason: null,
      ...over,
    });
    const options = [
      o("americain", "Américain", "genre", ["truck"]),
      o("americaine", "Américaine", "pays", null, { allowedCountries: ["US"] }),
      o("youngtimer", "Youngtimer", "epoque", null),
      o("moto", "Moto", "genre", ["moto"], { paused: true }),
      o("utilitaire", "Utilitaire", "genre", ["truck"], { paused: true }),
    ];
    const groups = choiceGroups(options, ["moto"]);
    expect(groups.map((g) => [g.family, g.rows.map((r) => r.label)])).toEqual([
      ["epoque", ["Youngtimer"]],
      ["genre", ["Américain · camion", "Moto"]],
      ["pays", ["Américaine"]],
    ]);
  });
});
