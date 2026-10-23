import { describe, expect, it } from "vitest";

import {
  clampPreferenceRadius,
  isEverywhere,
  PREFERENCE_RADIUS,
  preferenceFilterCount,
  preferencesUpdateSchema,
} from "./preferences";

describe("« Tes préférences » : une seule borne de distance", () => {
  it("10 à 200 km, ou null (partout en France) ; le reste est refusé", () => {
    const ok = (radiusKm: unknown) => preferencesUpdateSchema.safeParse({ radiusKm }).success;
    expect(ok(10)).toBe(true);
    expect(ok(200)).toBe(true);
    expect(ok(null)).toBe(true);
    expect(ok(5)).toBe(false);
    expect(ok(201)).toBe(false);
    expect(ok(300)).toBe(false);
    expect(PREFERENCE_RADIUS.max).toBe(200);
  });

  it("isEverywhere ne lit que la distance null", () => {
    expect(isEverywhere({ radiusKm: null })).toBe(true);
    expect(isEverywhere({ radiusKm: 50 })).toBe(false);
    expect(isEverywhere(null)).toBe(false);
  });

  it("le curseur d'un compte « Partout » repart de 50 km ; sinon la distance est ramenée à la plage", () => {
    expect(clampPreferenceRadius(null)).toBe(50);
    expect(clampPreferenceRadius(3)).toBe(10);
    expect(clampPreferenceRadius(87)).toBe(90);
  });

  it("la pastille « Filtres » ne compte pas la distance quand elle est « Partout »", () => {
    expect(preferenceFilterCount({ eventFormats: [], radiusKm: 50 })).toBe(1);
    expect(preferenceFilterCount({ eventFormats: [], radiusKm: null })).toBe(0);
    expect(preferenceFilterCount({ eventFormats: ["gathering"], radiusKm: null })).toBe(1);
  });
});
