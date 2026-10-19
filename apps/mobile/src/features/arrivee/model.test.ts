import { tabSets } from "@orasso/design-system";
import { departmentHint, departmentWhy, mainProfiles, mainProfileTiles, namePrivacy, pseudoHint } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import {
  arriveeStore,
  centerTabOf,
  emptyIdentity,
  favoriteOf,
  identityReady,
  profileTileOrder,
  tabSetOfProfile,
  toggleDepartment,
} from "./model";

describe("départements choisis", () => {
  it("toucher ajoute, retoucher retire ; le premier choisi est le favori", () => {
    let list: string[] = [];
    list = toggleDepartment(list, "66");
    list = toggleDepartment(list, "11");
    expect(list).toEqual(["66", "11"]);
    expect(favoriteOf(list)).toBe("66");
    list = toggleDepartment(list, "66");
    expect(list).toEqual(["11"]);
    expect(favoriteOf(list)).toBe("11");
    expect(favoriteOf([])).toBeNull();
  });
});

describe("identité obligatoire", () => {
  const ok = {
    pseudo: "Kenji_66",
    firstName: "Julien",
    lastName: "Martí",
    email: "julien@orasso.test",
    password: "motdepasse-test-123",
    terms: true,
  };
  it("tout rempli et pseudo libre : prêt", () => {
    expect(identityReady(ok, true)).toBe(true);
  });
  it("sans prénom, sans nom, sans conditions, pseudo pris ou mot de passe court : pas prêt", () => {
    expect(identityReady({ ...ok, firstName: "  " }, true)).toBe(false);
    expect(identityReady({ ...ok, lastName: "" }, true)).toBe(false);
    expect(identityReady({ ...ok, terms: false }, true)).toBe(false);
    expect(identityReady(ok, false)).toBe(false);
    expect(identityReady({ ...ok, password: "court" }, true)).toBe(false);
    expect(identityReady(emptyIdentity, true)).toBe(false);
  });
});

describe("profils", () => {
  it("six tuiles, chacune avec sa barre d'onglets, son centre et ses textes", () => {
    expect(profileTileOrder).toHaveLength(6);
    for (const p of mainProfiles) {
      expect(mainProfileTiles[p].title, p).toBeTruthy();
      expect(departmentWhy[p], p).toMatch(/même sans GPS\.$/);
      expect(departmentHint[p], p).toMatch(/^Touche les départements/);
      expect(pseudoHint[p], p).toMatch(/^C'est lui qu'on voit/);
      expect(namePrivacy[p], p).toBeTruthy();
      expect(tabSets[tabSetOfProfile[p]]).toHaveLength(5);
      expect(centerTabOf(p), p).toBeTruthy();
    }
    expect(centerTabOf("organizer")).toBe("live");
    expect(centerTabOf("exhibitor")).toBe("home");
  });

  it("le prototype : l'exposant est préchoisi, la réinitialisation efface tout", () => {
    expect(arriveeStore.get().profile).toBe("exhibitor");
    arriveeStore.set({ profile: "media", departments: ["66"] });
    expect(arriveeStore.get().profile).toBe("media");
    arriveeStore.reset();
    expect(arriveeStore.get().profile).toBe("exhibitor");
    expect(arriveeStore.get().departments).toEqual([]);
  });
});
