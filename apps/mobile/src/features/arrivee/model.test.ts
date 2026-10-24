import { tabSets } from "@orasso/design-system";
import { departmentHint, departmentWhy, mainProfiles, mainProfileTiles, namePrivacy, pseudoHint } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import {
  arriveeInitial,
  arriveeStore,
  centerTabOf,
  draftOf,
  emptyIdentity,
  favoriteOf,
  identityBlocker,
  identityReady,
  mergeDraft,
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

describe("lot R3d : ce qui manque, et le brouillon gardé sur l'appareil", () => {
  const ok = {
    pseudo: "Kenji_66",
    firstName: "Julien",
    lastName: "Martí",
    email: "julien@orasso.test",
    password: "123456789",
    terms: true,
  };
  it("9 caractères : la ligne dit qu'il en manque 1 ; 10 : prêt ; départements perdus : Ton coin", () => {
    expect(identityBlocker(ok, "free", ["66"])?.text).toBe("Mot de passe : 10 caractères au moins (il en manque 1).");
    expect(identityBlocker({ ...ok, password: "1234567890" }, "free", ["66"])).toBeNull();
    expect(identityBlocker({ ...ok, password: "1234567890" }, "free", [])?.field).toBe("departments");
    // Vérification du pseudo en panne (réseau) : rien ne bloque, l'API tranche.
    expect(identityBlocker({ ...ok, password: "1234567890" }, "idle", ["66"])).toBeNull();
  });

  it("le brouillon ne contient jamais le mot de passe", () => {
    const draft = draftOf({
      ...arriveeInitial,
      profile: "organizer",
      departments: ["66"],
      identity: ok,
      step: "identite",
    });
    expect(JSON.stringify(draft)).not.toContain("123456789");
    expect("password" in draft.identity).toBe(false);
    expect(draft).toMatchObject({ profile: "organizer", departments: ["66"], step: "identite" });
  });

  it("relu au lancement, il remet les choix sans écraser ce qui a déjà été choisi", () => {
    const stored = JSON.parse(
      JSON.stringify(
        draftOf({
          ...arriveeInitial,
          profile: "organizer",
          departments: ["66", "11"],
          identity: ok,
          next: "/e/x",
          step: "identite",
        }),
      ),
    );
    const back = mergeDraft(arriveeInitial, stored);
    expect(back.profile).toBe("organizer");
    expect(back.departments).toEqual(["66", "11"]);
    expect(back.identity).toEqual({ ...ok, password: "" });
    expect(back.next).toBe("/e/x");
    // Un lien partagé ouvert entre-temps garde sa destination ; un département déjà choisi n'est pas remplacé.
    const kept = mergeDraft({ ...arriveeInitial, next: "/e/autre", departments: ["34"] }, stored);
    expect(kept.next).toBe("/e/autre");
    expect(kept.departments).toEqual(["34"]);
  });

  it("un brouillon illisible ou d'une autre forme est ignoré", () => {
    expect(mergeDraft(arriveeInitial, null)).toBe(arriveeInitial);
    const junk = mergeDraft(arriveeInitial, {
      profile: "pirate",
      departments: ["66", "999", 3],
      identity: { pseudo: 4, password: "volé" },
      next: "https://ailleurs.test",
      step: "tuto",
    });
    expect(junk.profile).toBe("exhibitor");
    expect(junk.departments).toEqual(["66"]);
    expect(junk.identity.password).toBe("");
    expect(junk.identity.pseudo).toBe("");
    expect(junk.next).toBeNull();
    expect(junk.step).toBeNull();
  });
});
