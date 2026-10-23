import { describe, expect, it } from "vitest";
import { preloadOrder } from "./swipe";

describe("préchargement des onglets (lot M3)", () => {
  it("précharge les voisins de l'onglet ouvert d'abord, sans lui", () => {
    expect(preloadOrder(["explorer", "sorties", "accueil", "garage", "profil"], "accueil")).toEqual([
      "sorties",
      "garage",
      "explorer",
      "profil",
    ]);
  });
  it("part du premier onglet si l'ouvert est inconnu", () => {
    expect(preloadOrder(["a", "b", "c"], undefined)).toEqual(["a", "b", "c"]);
  });
});
