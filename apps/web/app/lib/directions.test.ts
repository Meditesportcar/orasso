import { describe, expect, it } from "vitest";
import { routeLinks } from "./directions";

const base = { lat: 42.7, lng: 3.03, addressLine: "Promenade de la Plage", postalCode: "66140", city: "Canet" };

describe("routeLinks", () => {
  it("passe par les coordonnées quand elles existent", () => {
    const l = routeLinks(base);
    expect(l?.maps).toContain("destination=42.7%2C3.03");
    expect(l?.waze).toBe("https://waze.com/ul?ll=42.7,3.03&navigate=yes");
  });
  it("passe par l'adresse sans coordonnées", () => {
    const l = routeLinks({ ...base, lat: null, lng: null });
    expect(l?.maps).toContain(encodeURIComponent("Promenade de la Plage, 66140 Canet"));
    expect(l?.waze).toContain("waze.com/ul?q=");
  });
  it("ne propose rien sans adresse ni coordonnées", () => {
    expect(routeLinks({ ...base, lat: null, lng: null, addressLine: null })).toBeNull();
  });
});
