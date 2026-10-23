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

  it("sans JavaScript : l'ordre enregistré est conservé (favori en tête), décochés retirés, nouveaux à la fin", () => {
    const base: [string, string][] = [
      ["departmentBoxes", "1"],
      ["departmentInitial", "66,11,2A"],
    ];
    // Les cases arrivent dans l'ordre de la liste (11, 2A, 66) : rien modifié → ordre inchangé, le favori 66 reste premier.
    expect(
      readDepartmentsField(form([...base, ["departmentBox", "11"], ["departmentBox", "2A"], ["departmentBox", "66"]])),
    ).toEqual(["66", "11", "2A"]);
    // 11 décoché, 09 et 34 ajoutés : ils passent derrière, dans l'ordre reçu.
    expect(
      readDepartmentsField(
        form([
          ...base,
          ["departmentBox", "09"],
          ["departmentBox", "2A"],
          ["departmentBox", "34"],
          ["departmentBox", "66"],
        ]),
      ),
    ).toEqual(["66", "2A", "09", "34"]);
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
