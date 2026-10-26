import { describe, expect, it } from "vitest";
import { goDestination, kmToEvent } from "./whereGo";

const base = { title: "Cars & Coffee", lat: 42.7, lng: 3.03, addressLine: "Promenade de la Plage", city: "Canet" };

describe("goDestination", () => {
  it("garde les coordonnées et l'adresse quand les deux existent", () => {
    expect(goDestination(base)).toMatchObject({ lat: 42.7, lng: 3.03, addressLine: "Promenade de la Plage" });
  });
  it("passe par l'adresse sans coordonnées", () => {
    expect(goDestination({ ...base, lat: null, lng: null })).toMatchObject({
      lat: null,
      addressLine: "Promenade de la Plage",
    });
  });
  it("passe par les coordonnées sans adresse", () => {
    expect(goDestination({ ...base, addressLine: null })).toMatchObject({ lat: 42.7, addressLine: null });
  });
  it("ne propose rien sans adresse ni coordonnées, même avec une ville", () => {
    expect(goDestination({ ...base, lat: null, lng: null, addressLine: null })).toBeNull();
    expect(goDestination({ ...base, lat: null, lng: null, addressLine: "  " })).toBeNull();
  });
});

describe("kmToEvent", () => {
  it("calcule à vol d'oiseau, sur le téléphone", () => {
    const km = kmToEvent({ lat: 42.6887, lng: 2.8948 }, { lat: 42.7, lng: 3.03 });
    expect(km).toBeGreaterThan(10);
    expect(km).toBeLessThan(13);
  });
  it("ne dit jamais NaN : coordonnées absentes (undefined) ou invalides", () => {
    expect(kmToEvent({ lat: 1, lng: 1 }, {})).toBeNull();
    expect(kmToEvent({ lat: 1, lng: 1 }, { lat: undefined, lng: 3 })).toBeNull();
    expect(kmToEvent({ lat: Number.NaN, lng: 1 }, { lat: 2, lng: 3 })).toBeNull();
    expect(goDestination({ title: "x" })).toBeNull();
  });
  it("répond null sans position ou sans coordonnées", () => {
    expect(kmToEvent(null, { lat: 42.7, lng: 3.03 })).toBeNull();
    expect(kmToEvent({ lat: 1, lng: 1 }, { lat: null, lng: null })).toBeNull();
  });
});
