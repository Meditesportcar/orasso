import { MAX_DEPARTMENTS } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import { departmentLimitReached, toggleDepartment } from "./model";
import { pendingCasquette, pendingPath } from "./pending";

describe("le profil choisi mène à sa barre", () => {
  it("pro, organisateur, prestataire, média : la casquette manque tant qu'elle n'existe pas", () => {
    for (const p of ["pro", "organizer", "provider", "media"] as const) {
      expect(pendingCasquette(p, ["visitor"], 0), p).toBe(p);
      expect(pendingCasquette(p, ["visitor", p], 0), `${p} créé`).toBeNull();
    }
  });
  it("exposant : sa voiture, jusqu'à ce qu'il en ait une ; visiteur et comptes anciens : rien", () => {
    expect(pendingCasquette("exhibitor", ["visitor"], 0)).toBe("vehicle");
    expect(pendingCasquette("exhibitor", ["fan"], 1)).toBeNull();
    expect(pendingCasquette("visitor", ["visitor"], 0)).toBeNull();
    expect(pendingCasquette(null, ["visitor"], 0)).toBeNull();
  });
  it("chaque tâche pointe vers un écran de création existant ", () => {
    expect(pendingPath).toEqual({
      pro: "/pro-nouvelle",
      organizer: "/structure/nouvelle",
      provider: "/prestataire/nouveau",
      media: "/media/nouveau",
      vehicle: "/vehicule/nouveau",
    });
  });
});

describe("limite de départements", () => {
  it("20 au plus : ajouter le 21e est refusé, retirer reste possible", () => {
    const full = Array.from({ length: MAX_DEPARTMENTS }, (_, i) => String(i + 1).padStart(2, "0"));
    expect(departmentLimitReached(full, "99")).toBe(true);
    expect(departmentLimitReached(full, "01")).toBe(false);
    expect(toggleDepartment(full, "01")).toHaveLength(MAX_DEPARTMENTS - 1);
    expect(departmentLimitReached(full.slice(1), "99")).toBe(false);
  });
});
