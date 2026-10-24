import { describe, expect, it } from "vitest";

import { certificationLostByChange } from "./garage";
import { vehicleName, versionAlreadyIn } from "./vehicleName";

describe("nom d'un véhicule (lot R4e, tour 2)", () => {
  it("marque, modèle, génération, puis la version", () => {
    expect(vehicleName({ make: "Volkswagen", model: "Golf", generation: "Mk4", version: "GTI" })).toBe(
      "Volkswagen Golf Mk4 GTI",
    );
    expect(vehicleName({ make: "Peugeot", model: "207", version: "CC" })).toBe("Peugeot 207 CC");
    expect(vehicleName({ make: "BMW", model: "Série 3", generation: "E36" })).toBe("BMW Série 3 E36");
    expect(vehicleName({})).toBe("Autre véhicule");
    expect(vehicleName({}, { fallback: "Véhicule" })).toBe("Véhicule");
  });

  it("la version n'est pas répétée : mots entiers, sans casse ni accents", () => {
    expect(vehicleName({ make: "Volkswagen", model: "Golf GTI", version: "GTI" })).toBe("Volkswagen Golf GTI");
    expect(vehicleName({ make: "Peugeot", model: "207 CC", version: "cc" })).toBe("Peugeot 207 CC");
    expect(vehicleName({ make: "Volkswagen", model: "Golf", generation: "Mk4", version: "mk4" })).toBe(
      "Volkswagen Golf Mk4",
    );
    expect(vehicleName({ make: "Renault", model: "Clio", generation: "Phase 2", version: "phase 2" })).toBe(
      "Renault Clio Phase 2",
    );
    expect(vehicleName({ make: "Citroën", model: "Saxo", version: "Citroen" })).toBe("Citroën Saxo");
    // Un morceau de mot n'est pas le mot : « CC » n'est pas dans « 207CC ».
    expect(vehicleName({ make: "Peugeot", model: "207CC", version: "CC" })).toBe("Peugeot 207CC CC");
    expect(versionAlreadyIn("GTI Clubsport", ["Golf", "GTI"])).toBe(false);
  });

  it("génération montrée ailleurs : hors du nom, mais comptée pour ne pas répéter la version", () => {
    expect(
      vehicleName(
        { model: "Golf", generation: "Mk4", version: "GTI" },
        { withGeneration: false, fallback: "Véhicule" },
      ),
    ).toBe("Golf GTI");
    expect(vehicleName({ model: "Golf", generation: "Mk4", version: "Mk4" }, { withGeneration: false })).toBe("Golf");
  });

  it("certification : la version est un champ surveillé (absente d'une ancienne demande = vide)", () => {
    const base = {
      makeId: "m",
      modelId: "md",
      generationId: null,
      year: 2002,
      engine: null,
      powerHp: null,
      weightKg: null,
      categoryIds: [],
      photoIds: [],
    };
    expect(certificationLostByChange(base, { ...base, version: "GTI" })).toBe(true);
    expect(certificationLostByChange({ ...base, version: "GTI" }, { ...base, version: " GTI " })).toBe(false);
    expect(certificationLostByChange(base, { ...base, version: null })).toBe(false);
  });
});
