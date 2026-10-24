import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { departments, matchDepartments } from "@orasso/shared";
import { describe, expect, it } from "vitest";
import { departmentChoices, departmentLabel } from "./choices";
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

  it("la liste a les 101 départements, outre-mer compris, les mêmes codes que l'API", () => {
    expect(departmentChoices).toHaveLength(101);
    expect(new Set(departmentChoices.map((d) => d.code))).toEqual(new Set(departments));
    expect(departmentLabel({ code: "66", name: "Pyrénées-Orientales" })).toBe("66 · Pyrénées-Orientales");
    expect(departmentChoices.at(-1)).toEqual({ code: "976", name: "Mayotte" });
  });
});

describe("« Ailleurs » : la recherche sur les 101 départements (lot R4d)", () => {
  const codes = (q: string) => matchDepartments(departmentChoices, q).map((d) => d.code);
  it("« 34 », « her », « pyrenees », « cote d'or », « 2a », l'outre-mer", () => {
    expect(codes("34")).toEqual(["34"]);
    expect(codes("her")).toEqual(["34"]);
    expect(codes("pyrenees")).toEqual(["64", "66", "65"]);
    expect(codes("cote d'or")).toEqual(["21"]);
    expect(codes("2a")).toEqual(["2A"]);
    expect(codes("reunion")).toEqual(["974"]);
    expect(codes("aude")).toEqual(["11"]);
  });
});
