// Relecture du lot 53 : la carte à épingle native ne pose une position qu'après un geste de l'utilisateur. Le
// comportement natif (MapLibre) se vérifie sur l'APK au lot 58.
import { describe, expect, it } from "vitest";

import { DEFAULT_PIN, pinFromRegion } from "./pinMapTypes";

describe("carte à épingle", () => {
  it("ignore l'ouverture sur le centre par défaut et les déplacements programmés", () => {
    const center = [DEFAULT_PIN.lng, DEFAULT_PIN.lat];
    expect(pinFromRegion({ center, userInteraction: false }, false)).toBeNull();
    expect(pinFromRegion({ center }, false)).toBeNull();
    expect(pinFromRegion(null, true)).toBeNull();
  });

  it("retient le centre après un geste (au début ou à la fin du mouvement)", () => {
    expect(pinFromRegion({ center: [2.9, 42.7], userInteraction: true }, false)).toEqual({ lat: 42.7, lng: 2.9 });
    expect(pinFromRegion({ center: [2.9, 42.7], userInteraction: false }, true)).toEqual({ lat: 42.7, lng: 2.9 });
    expect(pinFromRegion({ center: [Number.NaN, 42.7], userInteraction: true }, true)).toBeNull();
  });
});
