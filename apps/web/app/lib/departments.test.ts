import { describe, expect, it } from "vitest";

import { parseDepartmentText, readDepartmentsField } from "./departments";

const form = (entries: [string, string][]) => {
  const f = new FormData();
  for (const [k, v] of entries) f.append(k, v);
  return f;
};

describe("champ « Départements » du site", () => {
  it("saisie libre : numéros séparés, majuscules, sans doublon", () => {
    expect(parseDepartmentText("66, 11 ; 2a 66")).toEqual(["66", "11", "2A"]);
    expect(parseDepartmentText("")).toEqual([]);
  });

  it("sans marqueur (appel direct) : le champ texte seul", () => {
    expect(readDepartmentsField(form([["departments", "66,11"]]))).toEqual(["66", "11"]);
  });

  it("sans JavaScript : les cases cochées, dans l'ordre reçu ; aucune case = liste vide", () => {
    const marker: [string, string] = ["departmentBoxes", "1"];
    expect(
      readDepartmentsField(form([marker, ["departments", "66"], ["departmentBox", "11"], ["departmentBox", "2a"]])),
    ).toEqual(["11", "2A"]);
    expect(readDepartmentsField(form([marker, ["departments", "66"]]))).toEqual([]);
  });

  it("avec JavaScript (`departmentBoxOrder`) : le texte fait foi, même vide", () => {
    const js: [string, string][] = [
      ["departmentBoxes", "1"],
      ["departmentBoxOrder", ""],
    ];
    expect(readDepartmentsField(form([...js, ["departments", "66, 11"]]))).toEqual(["66", "11"]);
    expect(readDepartmentsField(form([...js, ["departments", ""]]))).toEqual([]);
  });
});
