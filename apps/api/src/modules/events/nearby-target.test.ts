import { profilePosition } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import { nearbyTarget } from "./nearby";

// Règle du coordinateur (23/10) : l'alerte « nouvel événement » part toujours des départements choisis ; « Partout »
// lève seulement la limite de distance, dans ces départements ; sans département, aucune alerte.
describe("alerte « nouvel événement » : départements choisis", () => {
  const perpignan = profilePosition(["66"]) ?? { lat: 42.7, lng: 2.9 };
  const lille = profilePosition(["59"]) ?? { lat: 50.6, lng: 3.1 };

  it("départements avec une distance : le centre du coin à moins de la distance", () => {
    expect(nearbyTarget({ departments: ["66"], radiusKm: 50 }, { department: "66", position: perpignan })).toBe(true);
    expect(nearbyTarget({ departments: ["66"], radiusKm: 50 }, { department: "59", position: lille })).toBe(false);
  });

  it("départements avec « Partout » : tout l'intérieur de ces départements, rien au-dehors", () => {
    expect(nearbyTarget({ departments: ["66", "59"], radiusKm: null }, { department: "59", position: lille })).toBe(
      true,
    );
    expect(nearbyTarget({ departments: ["66"], radiusKm: null }, { department: "59", position: lille })).toBe(false);
    expect(nearbyTarget({ departments: ["66"], radiusKm: null }, { department: null, position: perpignan })).toBe(
      false,
    );
  });

  it("aucun département : aucune alerte, même avec « Partout »", () => {
    expect(nearbyTarget({ departments: [], radiusKm: null }, { department: "66", position: perpignan })).toBe(false);
    expect(nearbyTarget({ departments: [], radiusKm: 200 }, { department: "66", position: perpignan })).toBe(false);
  });
});
