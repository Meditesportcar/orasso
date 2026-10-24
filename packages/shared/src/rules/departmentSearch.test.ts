import { describe, expect, it } from "vitest";
import { departments } from "../enums";
import {
  AWAY_RECENT_MAX,
  DEPARTMENT_MATCHES_SHOWN,
  foldSearch,
  matchDepartments,
  pushRecentDepartment,
  readRecentDepartments,
} from "./departmentSearch";

// Un extrait de la liste (les noms complets sont dans le design-system, testés là aussi), dans l'ordre des numéros.
const LIST = [
  { code: "11", name: "Aude" },
  { code: "18", name: "Cher" },
  { code: "21", name: "Côte-d'Or" },
  { code: "22", name: "Côtes-d'Armor" },
  { code: "2A", name: "Corse-du-Sud" },
  { code: "2B", name: "Haute-Corse" },
  { code: "34", name: "Hérault" },
  { code: "64", name: "Pyrénées-Atlantiques" },
  { code: "65", name: "Hautes-Pyrénées" },
  { code: "66", name: "Pyrénées-Orientales" },
  { code: "974", name: "La Réunion" },
];
const codes = (q: string) => matchDepartments(LIST, q).map((d) => d.code);
const isDepartment = (c: string) => (departments as readonly string[]).includes(c);

describe("Ailleurs : la recherche d'un département (lot R4d)", () => {
  it("sans accents ni majuscules", () => {
    expect(foldSearch("  Hérault ")).toBe("herault");
    expect(codes("HÉRAULT")).toEqual(["34"]);
  });

  it("le début du numéro : « 34 », « 2a », « 97 »", () => {
    expect(codes("34")).toEqual(["34"]);
    expect(codes("2a")).toEqual(["2A"]);
    expect(codes("2")).toEqual(["21", "22", "2A", "2B"]);
    expect(codes("97")).toEqual(["974"]);
  });

  it("le début d'un mot du nom : « her » trouve Hérault, pas Cher", () => {
    expect(codes("her")).toEqual(["34"]);
    expect(codes("reunion")).toEqual(["974"]);
    expect(codes("corse")).toEqual(["2A", "2B"]);
  });

  it("« pyrenees » : les noms qui commencent par lui d'abord, puis Hautes-Pyrénées", () => {
    expect(codes("pyrenees")).toEqual(["64", "66", "65"]);
    expect(codes("pyrenees orientales")).toEqual(["66"]);
  });

  it("« cote d'or » : espace, tiret et apostrophe se valent ; Côtes-d'Armor ne correspond pas", () => {
    expect(codes("cote d'or")).toEqual(["21"]);
    expect(codes("cote-d’or")).toEqual(["21"]);
    expect(codes("cote")).toEqual(["21", "22"]);
  });

  it("le milieu d'un mot ne compte pas ; un texte vide ne trouve rien", () => {
    expect(codes("rault")).toEqual([]);
    expect(codes("")).toEqual([]);
    expect(codes("  ")).toEqual([]);
    expect(DEPARTMENT_MATCHES_SHOWN).toBe(5);
  });
});

describe("Ailleurs : les récents (lot R4d)", () => {
  it("le plus récent en tête, sans doublon, 3 au plus", () => {
    let list: string[] = [];
    for (const code of ["11", "34", "09", "34", "66"]) list = pushRecentDepartment(list, code);
    expect(list).toEqual(["66", "34", "09"]);
    expect(list).toHaveLength(AWAY_RECENT_MAX);
    expect(pushRecentDepartment(["11", "34", "09"], "11")).toEqual(["11", "34", "09"]);
  });

  it("une valeur gardée abîmée est nettoyée : départements connus, sans doublon, 3 au plus", () => {
    expect(readRecentDepartments(["11", "99", 34, "11", "2A", "974", "66"], isDepartment)).toEqual(["11", "2A", "974"]);
    expect(readRecentDepartments("11", isDepartment)).toEqual([]);
    expect(readRecentDepartments(null, isDepartment)).toEqual([]);
  });
});
