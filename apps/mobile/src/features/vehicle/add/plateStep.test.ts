import { vehicleWizardLabels as L } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import type { DraftPhoto } from "./model";
import { detectionPatch, plateSuggestion, plateWarning } from "./plateStep";

const photo = (over: Partial<DraftPhoto> = {}): DraftPhoto => ({
  key: "p",
  uri: "file:///p.jpg",
  width: 1000,
  height: 750,
  rects: [],
  ...over,
});
const rect = { x: 0.4, y: 0.6, w: 0.2, h: 0.05 };

describe("étape Plaque (lot M2)", () => {
  it("la détection pose les cadres en Automatique et garde les lectures", () => {
    const found = [{ rect, reading: "W623AX", probable: false }];
    expect(detectionPatch(photo(), found, "auto")).toEqual({
      detected: [rect],
      detection: "found",
      rects: [rect],
      readings: [{ reading: "W623AX", probable: false }],
    });
    expect(detectionPatch(photo(), found, "manual").rects).toEqual([]);
    expect(detectionPatch(photo(), null, "auto")).toMatchObject({ detection: "unavailable", readings: [] });
    expect(detectionPatch(photo(), [], "auto")).toMatchObject({ detection: "none", readings: [] });
  });

  it("numéro proposé : la première plaque reconnue, au format lisible ; la probable en dernier recours", () => {
    const photos = [
      photo({ readings: [{ reading: "MAB1234", probable: true }] }),
      photo({ readings: [{ reading: "W623AX", probable: false }] }),
    ];
    expect(plateSuggestion(photos)).toBe("W-623-AX");
    expect(plateSuggestion(photos.slice(0, 1))).toBe("MAB1234");
    expect(plateSuggestion([photo()])).toBeNull();
    expect(plateSuggestion(photos, true)).toBeNull();
  });

  it("format étranger : avertissement doux, jamais pour un format français", () => {
    for (const p of ["AE-665-GH", "ae665gh", "W-623-AX", "WW-123-AB", "1234 AB 66", "12 CD 345"]) {
      expect(plateWarning(p), p).toBeNull();
    }
    expect(plateWarning("M-AB 1234")).toBe(L.plateForeign);
    expect(plateWarning("")).toBeNull();
  });
});
