import { describe, expect, it } from "vitest";
import { matchTokens, searchFold, searchTokens, searchWords, tokenScore } from "./vehicleSearch";

describe("recherche « Marque ou modèle » (lot R3c)", () => {
  it("sans accents ni casse", () => {
    expect(searchFold("Mégane Citroën ŠKODA")).toBe("megane citroen skoda");
  });

  it("indexe les mots collés, leurs morceaux et le nom entier", () => {
    expect(searchWords("MX-5")).toEqual(expect.arrayContaining(["mx5", "mx", "5"]));
    expect(searchWords("Série 3")).toEqual(expect.arrayContaining(["serie3", "serie", "3"]));
    expect(searchWords("E36/7")).toEqual(expect.arrayContaining(["e367", "e36", "7"]));
  });

  it("un numéro romain ou un « Mk4 » vaut aussi son chiffre ; un « X » en tête reste une lettre", () => {
    expect(searchWords("Mk4")).toContain("4");
    expect(searchWords("Mk4")).toContain("iv"); // tour 2 : « golfiv », « golf-iv »
    expect(searchTokens("golf-iv")).toEqual([["golfiv"]]);
    expect(searchWords("Golf IV")).toContain("4");
    expect(searchWords("I (T7)")).toContain("1");
    expect(searchWords("Evo X")).toContain("10");
    expect(searchWords("X 350")).not.toContain("10");
  });

  it("la saisie : mots collés, romain doublé de son chiffre, 6 mots au plus", () => {
    expect(searchTokens("  MX-5  ")).toEqual([["mx5"]]);
    expect(searchTokens("golf IV")).toEqual([["golf"], ["iv", "4"]]);
    expect(searchTokens("a b c d e f g h")).toHaveLength(6);
    expect(searchTokens(" - ")).toEqual([]);
  });

  it("note : identique 3, début de mot 1, absent 0", () => {
    expect(tokenScore(["207"], ["207"])).toBe(3);
    expect(tokenScore(["20"], ["207"])).toBe(1);
    expect(tokenScore(["308"], ["207"])).toBe(0);
  });

  it("chaque mot doit se trouver, et un au moins au niveau le plus précis", () => {
    const make = searchWords("Volkswagen");
    const model = searchWords("Golf");
    const gen = searchWords("Mk4");
    expect(matchTokens(searchTokens("golf 4"), [make, model, gen])).toBe(6);
    expect(matchTokens(searchTokens("golf"), [make, model, gen])).toBe(0);
    expect(matchTokens(searchTokens("golf 5"), [make, model, gen])).toBe(0);
    expect(matchTokens(searchTokens("golf"), [make, model])).toBe(3);
    expect(matchTokens([], [make])).toBe(0);
  });
});
