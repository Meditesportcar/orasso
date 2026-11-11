import { describe, expect, it } from "vitest";

import { explicitProfileTab, profileTabFromParam, visibleProfileTab } from "./profile-tabs.fr";

describe("onglets d'un profil : l'adresse (`?onglet=`)", () => {
  it("explicitProfileTab : seuls les trois onglets connus ; le reste est ignoré", () => {
    expect(explicitProfileTab("garage")).toBe("garage");
    expect(explicitProfileTab("sorties")).toBe("sorties");
    expect(explicitProfileTab("publications")).toBe("publications");
    expect(explicitProfileTab("n'importe quoi")).toBeNull();
    expect(explicitProfileTab("")).toBeNull();
    expect(explicitProfileTab(null)).toBeNull();
    expect(explicitProfileTab(undefined)).toBeNull();
  });
  it("profileTabFromParam : « publications » est reconnu, le reste ouvre le Garage", () => {
    expect(profileTabFromParam("publications")).toBe("publications");
    expect(profileTabFromParam("sorties")).toBe("sorties");
    expect(profileTabFromParam("x")).toBe("garage");
  });
  it("visibleProfileTab : « Publications » existe pour tous, sans véhicule le Garage devient « Sorties »", () => {
    expect(visibleProfileTab("publications", false)).toBe("publications");
    expect(visibleProfileTab("publications", true)).toBe("publications");
    expect(visibleProfileTab("garage", false)).toBe("sorties");
    expect(visibleProfileTab("garage", true)).toBe("garage");
  });
});
