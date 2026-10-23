import { describe, expect, it } from "vitest";

import { appReturn, withReturn } from "./closeTo";

describe("retour du ✕ (lot M7, tour 2)", () => {
  it("garde un chemin de l'appli", () => {
    expect(appReturn("/evenement/abc/bilan")).toBe("/evenement/abc/bilan");
    expect(appReturn("/boite/orga")).toBe("/boite/orga");
  });
  it("refuse une adresse extérieure ou absente", () => {
    for (const bad of ["//evil.example", "https://evil.example", "evenement", "/\\evil", "", undefined, null, 3]) {
      expect(appReturn(bad)).toBeNull();
    }
  });
  it("ajoute le retour à l'adresse, encodé", () => {
    expect(withReturn("/notes", "/evenement/abc/bilan")).toBe("/notes?retour=%2Fevenement%2Fabc%2Fbilan");
    expect(withReturn("/modeles?x=1", "/boite/orga")).toBe("/modeles?x=1&retour=%2Fboite%2Forga");
  });
});
