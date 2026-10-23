import { describe, expect, it } from "vitest";
import { shareFormats } from "../garage";
import { categoryRefusalLabels, certificationLineLabels, certificationMissingLabels } from "../labels/garage.fr";
import {
  type CategoryRule,
  categoryAllowedForVehicle,
  categoryRefusal,
  certificationEligibility,
  certificationInactive,
  certificationLine,
  certificationLostByChange,
  OFFROAD_TYPE,
  SHARE_CHAR_WIDTH,
  SHARE_MARGIN,
  shareImageLayout,
  type VehicleFacts,
} from "./garage";

const NOW = new Date("2026-10-16T10:00:00Z");
const any: CategoryRule = {
  minVehicleAge: null,
  allowedVehicleTypes: null,
  allowedCountries: null,
  makeMode: "any",
  allowedMakeIds: [],
};
const peugeot: VehicleFacts = {
  vehicleType: "car",
  year: 1989,
  makeId: "m-peugeot",
  makeCountry: "FR",
  makeIsOther: false,
};
const toyota: VehicleFacts = { ...peugeot, makeId: "m-toyota", makeCountry: "JP" };
const autre: VehicleFacts = { ...peugeot, makeId: "m-autre", makeCountry: null, makeIsOther: true };

const supercar: CategoryRule = { ...any, makeMode: "whitelist", allowedMakeIds: ["m-ferrari", "m-porsche"] };
const jdm: CategoryRule = { ...any, allowedCountries: ["JP"] };
const youngtimer: CategoryRule = { ...any, minVehicleAge: 20 };
const moto: CategoryRule = { ...any, allowedVehicleTypes: ["moto"] };

describe("categoryAllowedForVehicle", () => {
  it("Peugeot + supercar refusé (liste blanche), Toyota + JDM accepté", () => {
    expect(categoryRefusal(supercar, peugeot, NOW)).toBe("make");
    expect(categoryAllowedForVehicle(jdm, toyota, NOW)).toBe(true);
    expect(categoryRefusal(jdm, peugeot, NOW)).toBe("country");
  });

  it("Porsche + supercar accepté (marque de la liste blanche)", () => {
    expect(categoryAllowedForVehicle(supercar, { ...peugeot, makeId: "m-porsche", makeCountry: "DE" }, NOW)).toBe(true);
  });

  it("2015 + youngtimer refusé, 1995 accepté ; année inconnue refusée", () => {
    expect(categoryRefusal(youngtimer, { ...toyota, year: 2015 }, NOW)).toBe("age");
    expect(categoryAllowedForVehicle(youngtimer, { ...toyota, year: 1995 }, NOW)).toBe(true);
    expect(categoryRefusal(youngtimer, { ...toyota, year: null }, NOW)).toBe("age");
  });

  it("lot M1, tour 2 : « 4x4 » convient aux camions et aux tout-terrain du référentiel, pas aux autres voitures", () => {
    const fourByFour: CategoryRule = { ...any, allowedVehicleTypes: ["truck", OFFROAD_TYPE] };
    expect(categoryRefusal(fourByFour, toyota, NOW)).toBe("type");
    expect(categoryRefusal(fourByFour, { ...toyota, offroad: false }, NOW)).toBe("type");
    expect(categoryRefusal(fourByFour, { ...toyota, offroad: true }, NOW)).toBeNull();
    expect(categoryRefusal(fourByFour, { ...toyota, vehicleType: "truck" }, NOW)).toBeNull();
    // Un tout-terrain reste une voiture : « Moto » ne lui convient pas.
    expect(categoryRefusal(moto, { ...toyota, offroad: true }, NOW)).toBe("type");
  });

  it("type : la catégorie moto ne convient pas à une voiture", () => {
    expect(categoryRefusal(moto, toyota, NOW)).toBe("type");
    expect(categoryAllowedForVehicle(moto, { ...toyota, vehicleType: "moto" }, NOW)).toBe(true);
  });

  it("marque « Autre » : pays et liste blanche ne refusent pas, l'âge et le type s'appliquent toujours", () => {
    expect(categoryAllowedForVehicle(supercar, autre, NOW)).toBe(true);
    expect(categoryAllowedForVehicle(jdm, autre, NOW)).toBe(true);
    expect(categoryRefusal(youngtimer, { ...autre, year: 2020 }, NOW)).toBe("age");
    expect(categoryRefusal(moto, autre, NOW)).toBe("type");
  });

  it("pays de marque inconnu (hors « Autre ») : le pays ne refuse pas", () => {
    expect(categoryAllowedForVehicle(jdm, { ...toyota, makeCountry: null }, NOW)).toBe(true);
  });

  it("chaque refus a un libellé français", () => {
    for (const r of ["age", "type", "country", "make"] as const) expect(categoryRefusalLabels[r]).toBeTruthy();
  });
});

describe("certificationEligibility", () => {
  const ok = {
    status: "active",
    photoCount: 3,
    description: "Supra Mk4 préparée sur route et sur circuit.",
    categoryCount: 1,
    plateTransferPending: false,
    certified: false,
    hasPendingRequest: false,
  };

  it("grade Sport et conditions réunies : accepté", () => {
    expect(certificationEligibility({ grade: "sport" }, ok)).toEqual({ ok: true, missing: [] });
    expect(certificationEligibility({ grade: "legende" }, ok).ok).toBe(true);
  });

  it("sous le grade Sport : refusé (route, rodage)", () => {
    expect(certificationEligibility({ grade: "route" }, ok).missing).toEqual(["grade"]);
    expect(certificationEligibility({ grade: "rodage" }, ok).ok).toBe(false);
  });

  it("liste tout ce qui manque", () => {
    const r = certificationEligibility(
      { grade: "sport" },
      { ...ok, status: "sold", photoCount: 2, description: "  ", categoryCount: 0 },
    );
    expect(r.missing).toEqual(["status", "photos", "description", "category"]);
    for (const m of r.missing) expect(certificationMissingLabels[m]).toBeTruthy();
  });

  it("demande déjà en cours, déjà certifié, plaque en attente", () => {
    expect(certificationEligibility({ grade: "sport" }, { ...ok, hasPendingRequest: true }).missing).toEqual([
      "pending",
    ]);
    expect(certificationEligibility({ grade: "sport" }, { ...ok, certified: true }).missing).toEqual(["certified"]);
    expect(certificationEligibility({ grade: "sport" }, { ...ok, plateTransferPending: true }).missing).toEqual([
      "plate",
    ]);
  });
});

describe("certificationLostByChange", () => {
  const base = {
    makeId: "m",
    modelId: "mo",
    generationId: "g",
    year: 1995,
    engine: "2JZ-GTE",
    powerHp: 330,
    weightKg: 1500,
    categoryIds: ["a", "b"],
    photoIds: ["p1", "p2", "p3"],
  };

  it("aucun changement, ou ordre des catégories et photos : pas de perte", () => {
    expect(certificationLostByChange(base, { ...base })).toBe(false);
    expect(certificationLostByChange(base, { ...base, categoryIds: ["b", "a"], photoIds: ["p3", "p1", "p2"] })).toBe(
      false,
    );
  });

  it("champs techniques : perte", () => {
    for (const change of [
      { powerHp: 400 },
      { weightKg: 1400 },
      { year: 1996 },
      { engine: "1JZ" },
      { makeId: "x" },
      { modelId: "x" },
      { generationId: null },
    ]) {
      expect(certificationLostByChange(base, { ...base, ...change })).toBe(true);
    }
  });

  it("catégories et photos ajoutées ou retirées : perte", () => {
    expect(certificationLostByChange(base, { ...base, categoryIds: ["a"] })).toBe(true);
    expect(certificationLostByChange(base, { ...base, photoIds: [...base.photoIds, "p4"] })).toBe(true);
    expect(certificationLostByChange(base, { ...base, photoIds: ["p1", "p2"] })).toBe(true);
  });

  it("moteur vide, null ou espaces : même valeur", () => {
    expect(certificationLostByChange({ ...base, engine: null }, { ...base, engine: "  " })).toBe(false);
  });
});

describe("certificationInactive", () => {
  it("certifiée depuis moins de six mois : jamais perdue", () => {
    expect(certificationInactive(new Date("2026-06-01T00:00:00Z"), null, NOW)).toBe(false);
  });
  it("certifiée depuis plus de six mois, sans entrée récente : perdue", () => {
    expect(certificationInactive(new Date("2026-01-01T00:00:00Z"), null, NOW)).toBe(true);
    expect(certificationInactive(new Date("2026-01-01T00:00:00Z"), new Date("2026-03-01T00:00:00Z"), NOW)).toBe(true);
  });
  it("une entrée dans les six derniers mois garde la certification", () => {
    expect(certificationInactive(new Date("2026-01-01T00:00:00Z"), new Date("2026-08-15T00:00:00Z"), NOW)).toBe(false);
  });
});

describe("shareImageLayout", () => {
  const long = "Mercedes-Benz SLK 230 Kompressor R170";

  it("nom court : une ligne à la taille maximale ou presque", () => {
    expect(shareImageLayout("GTI", "post")).toEqual({ lines: ["GTI"], fontSize: 96 });
    const l = shareImageLayout("Peugeot 205 GTI", "post");
    expect(l.lines).toEqual(["Peugeot 205 GTI"]);
    expect(l.fontSize).toBeGreaterThanOrEqual(90);
  });

  it("nom long : deux lignes entières, jamais tronquées, qui tiennent dans la largeur", () => {
    for (const format of shareFormats) {
      const l = shareImageLayout(long, format);
      expect(l.lines).toHaveLength(2);
      expect(l.lines.join(" ")).toBe(long);
      const widest = Math.max(...l.lines.map((x) => x.length)) * l.fontSize * SHARE_CHAR_WIDTH;
      expect(widest).toBeLessThanOrEqual(1080 - SHARE_MARGIN * 2);
      expect(l.fontSize).toBeGreaterThanOrEqual(60);
    }
  });

  it("jamais plus de deux lignes, même pour un nom très long (le corps baisse)", () => {
    const huge = "Volkswagen Transporter T3 Multivan Syncro Westfalia Joker Special Edition";
    const l = shareImageLayout(huge, "story");
    expect(l.lines.length).toBeLessThanOrEqual(2);
    expect(l.lines.join(" ")).toBe(huge);
    expect(l.fontSize).toBeLessThan(96);
  });

  it("un seul mot très long : ligne unique, corps réduit, pas de coupe au milieu", () => {
    const l = shareImageLayout("Hispano-Suiza-Alfonso-Treize-Cinquante", "post");
    expect(l.lines).toHaveLength(1);
    expect(l.fontSize).toBeLessThan(96);
  });
});

describe("certificationLine (lot M5, ligne d'état du Garage)", () => {
  const facts = (missing: Parameters<typeof certificationLine>[0]["missing"], photoCount = 3) => ({
    line: certificationLine({ certified: false, missing }, photoCount),
    photoCount,
    missing,
  });

  it("un ancien véhicule (vendu, souvenir, accidenté) : impossible, quoi qu'il manque d'autre", () => {
    const { line } = facts(["grade", "status", "photos"], 1);
    expect(line).toEqual({ kind: "impossible" });
    expect(certificationLineLabels.headline(line)).toBe("Certification impossible");
    expect(certificationLineLabels.detail(line, { photoCount: 1, missing: ["status"] })).toMatch(/ancien véhicule/);
  });

  it("ce qui manque en premier : les photos, puis la description, la catégorie, la plaque, le grade", () => {
    const a = facts(["grade", "photos", "description"], 2);
    expect(a.line).toEqual({ kind: "missing", first: "photos", photosMissing: 1, count: 3 });
    expect(certificationLineLabels.headline(a.line)).toBe("Certification : il manque 1 photo");
    expect(certificationLineLabels.detail(a.line, a)).toBe("2 sur 3 photos · description ✗ · grade Sport ✗");
    expect(certificationLineLabels.headline(facts(["photos"], 0).line)).toBe("Certification : il manque 3 photos");
    expect(certificationLineLabels.headline(facts(["grade", "description"]).line)).toBe(
      "Certification : il manque la description",
    );
    expect(certificationLineLabels.headline(facts(["grade"]).line)).toBe("Certification : il faut le grade Sport");
  });

  it("certifié, demande en cours, prête", () => {
    expect(certificationLine({ certified: true, missing: ["certified"] }, 3)).toEqual({ kind: "certified" });
    expect(certificationLine({ certified: false, missing: ["pending"] }, 3)).toEqual({ kind: "pending" });
    expect(certificationLine({ certified: false, missing: [] }, 3)).toEqual({ kind: "ready" });
  });

  it("la règle de l'API : 3 photos et une description, et un véhicule actif", () => {
    const base = {
      status: "active",
      photoCount: 3,
      description: "Ma Supra",
      categoryCount: 1,
      plateTransferPending: false,
      certified: false,
      hasPendingRequest: false,
    };
    expect(certificationEligibility({ grade: "sport" }, base).ok).toBe(true);
    expect(certificationEligibility({ grade: "sport" }, { ...base, photoCount: 2 }).missing).toEqual(["photos"]);
    expect(certificationEligibility({ grade: "sport" }, { ...base, description: " " }).missing).toEqual([
      "description",
    ]);
    for (const status of ["sold", "keepsake", "wrecked"])
      expect(certificationEligibility({ grade: "sport" }, { ...base, status }).missing).toContain("status");
  });
});
