import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { departments } from "@orasso/shared";
import { describe, expect, it } from "vitest";
import { franceDepartmentByCode, franceDepartments, franceMapCredit, franceMapViewBox } from "./departments";

describe("carte de France (lot 41)", () => {
  it("96 départements : métropole et Corse (2A, 2B)", () => {
    expect(franceDepartments).toHaveLength(96);
    expect(franceDepartmentByCode["2A"]?.name).toBeTruthy();
    expect(franceDepartmentByCode["2B"]?.name).toBeTruthy();
    expect(franceDepartmentByCode["66"]?.name).toBe("Pyrénées-Orientales");
  });

  it("codes uniques, tracés non vides", () => {
    const codes = franceDepartments.map((d) => d.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const d of franceDepartments) {
      expect(d.d.length, d.code).toBeGreaterThan(20);
      expect(d.d.startsWith("m") || d.d.startsWith("M"), d.code).toBe(true);
    }
  });

  it("chaque code de la carte est un département accepté par l'API", () => {
    for (const d of franceDepartments) expect(departments as readonly string[], d.code).toContain(d.code);
  });

  it("la boîte de la carte et le crédit CC BY 4.0 sont renseignés", () => {
    expect(franceMapViewBox).toBe("0 0 613 585");
    expect(franceMapCredit).toBe("Carte : Victor Cazanave, CC BY 4.0");
  });

  it("le fichier de licence est présent, aucune adresse de CDN dans le code", () => {
    const license = resolve(import.meta.dirname, "LICENSE-france-departments.md");
    expect(existsSync(license)).toBe(true);
    expect(readFileSync(license, "utf8")).toMatch(/CC BY 4\.0/);
    for (const file of ["departments.ts", "FranceMapNative.tsx", "FranceMapWeb.tsx"]) {
      expect(readFileSync(resolve(import.meta.dirname, file), "utf8")).not.toMatch(
        new RegExp(["jsdeli", "vr"].join(""), "i"),
      );
    }
  });
});
