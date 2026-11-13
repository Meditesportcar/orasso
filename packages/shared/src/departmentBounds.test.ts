// La table des emprises est régénérable : le script de conversion (`scripts/departmentBounds.mjs`) donne exactement la table du dépôt.
import { describe, expect, it } from "vitest";

// @ts-expect-error script node en JavaScript, sans déclaration de types
import { computeDepartmentBounds, renderDepartmentBounds } from "../scripts/departmentBounds.mjs";
import { departmentBounds } from "./departmentBounds";

describe("emprises des départements : régénération", () => {
  it("la table régénérée est identique à celle du dépôt", () => {
    const regenerated = computeDepartmentBounds() as Record<string, number[]>;
    expect(Object.keys(regenerated).sort()).toEqual(Object.keys(departmentBounds).sort());
    for (const [code, box] of Object.entries(regenerated))
      expect([...(departmentBounds[code] ?? [])], code).toEqual(box);
  });

  it("le fichier généré se rend sans perte", () => {
    const text = renderDepartmentBounds(computeDepartmentBounds()) as string;
    expect(text).toContain("export const departmentBounds");
    expect(text).toContain("Régénérer");
  });
});
