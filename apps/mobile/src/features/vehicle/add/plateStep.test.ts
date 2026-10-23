import { vehicleWizardLabels as L } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import { type Draft, type DraftPhoto, emptyDraft, type PlateReading } from "./model";
import { detectionPatch, plateHelp, plateSuggestion, plateWarning, prefillPatch, typedPlate } from "./plateStep";

const photo = (over: Partial<DraftPhoto> = {}): DraftPhoto => ({
  key: "p",
  uri: "file:///p.jpg",
  width: 1000,
  height: 750,
  rects: [],
  ...over,
});
const rect = { x: 0.4, y: 0.6, w: 0.2, h: 0.05 };
const read = (plate: string, over: Partial<PlateReading> = {}): PlateReading => ({
  plate,
  fixes: 0,
  valid: true,
  ambiguous: false,
  probable: false,
  area: 0.01,
  ...over,
});
const found = (plate: string, over: Partial<PlateReading> = {}) => ({
  ...read(plate, over),
  rect,
  stripped: 0,
  tier: 0,
});

/** Un passage sur l'étape : le préremplissage s'applique, comme l'effet de `StepPlate` au montage. */
const visit = (d: Draft): Draft => ({ ...d, ...(prefillPatch(d) ?? {}) });

describe("étape Plaque (lot M2)", () => {
  it("la détection pose les cadres reconnus en Automatique et garde les lectures", () => {
    expect(detectionPatch(photo(), [found("W623AX")], "auto")).toEqual({
      detected: [rect],
      detection: "found",
      rects: [rect],
      readings: [read("W623AX")],
    });
    expect(detectionPatch(photo(), [found("W623AX")], "manual").rects).toEqual([]);
    expect(detectionPatch(photo(), null, "auto")).toMatchObject({ detection: "unavailable", readings: [] });
    expect(detectionPatch(photo(), [], "auto")).toMatchObject({ detection: "none", readings: [] });
  });

  it("une plaque probable n'est jamais appliquée : ni cadre, ni numéro ; elle reste une donnée à vérifier", () => {
    const patch = detectionPatch(photo(), [found("MAB1234", { probable: true, valid: false })], "auto");
    expect(patch).toMatchObject({ detected: [], rects: [], detection: "none" });
    expect(patch.readings).toEqual([read("MAB1234", { probable: true, valid: false })]);
    expect(plateSuggestion([photo(patch)])).toBeNull();
  });

  it("numéro proposé : la plaque reconnue au format lisible ; rien pour un non immatriculé", () => {
    const photos = [photo({ readings: [read("MAB1234", { probable: true })] }), photo({ readings: [read("W623AX")] })];
    expect(plateSuggestion(photos)).toBe("W-623-AX");
    expect(plateSuggestion(photos.slice(0, 1))).toBeNull();
    expect(plateSuggestion([photo()])).toBeNull();
    expect(plateSuggestion(photos, true)).toBeNull();
  });

  it("préremplissage : une fois, jamais par-dessus une saisie, même effacée, même après un aller-retour", () => {
    const withPhoto = { ...emptyDraft(), photos: [photo({ readings: [read("W623AX")] })] };
    const first = visit(withPhoto);
    expect(first.plate).toBe("W-623-AX");
    expect(plateHelp(first)).toBe(L.plateRead);
    // Effacé à la main, puis retour à l'étape Photos et de nouveau Plaque (l'étape est remontée) : reste vide.
    const cleared = { ...first, ...typedPlate("") };
    expect(visit(visit(cleared)).plate).toBe("");
    // Saisie à la main : gardée, et l'aide ne dit plus « Lu sur ta photo ».
    const typed = visit({ ...first, ...typedPlate("W-623-AX") });
    expect(typed.plate).toBe("W-623-AX");
    expect(plateHelp(typed)).toBeNull();
    // Fiche existante (modification) : jamais préremplie.
    expect(prefillPatch({ ...withPhoto, plateTouched: true })).toBeNull();
  });

  it("format étranger : avertissement doux, jamais remplacé par « Lu sur ta photo »", () => {
    for (const p of ["AE-665-GH", "ae665gh", "W-623-AX", "WW-123-AB", "1234 AB 66", "12 CD 345", "F AB-123-CD 66"]) {
      expect(plateWarning(p), p).toBeNull();
    }
    expect(plateWarning("M-AB 1234")).toBe(L.plateForeign);
    expect(plateWarning("")).toBeNull();
    const foreign = { ...emptyDraft(), plate: "M-AB 1234", photos: [photo({ readings: [read("W623AX")] })] };
    expect(plateHelp(foreign)).toBe(L.plateForeign);
  });
});
