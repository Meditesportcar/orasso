import { describe, expect, it } from "vitest";

import { authorOf, storyAuthorFor } from "./author";

const orga = { kind: "organizer", structureId: "s-1" } as const;

describe("storyAuthorFor : l'auteur d'une story (R9n)", () => {
  it("casquette active avec acteur : la page de la casquette", () => {
    expect(storyAuthorFor(null, "s:s-1", orga, "Roues Libres 66")).toEqual(authorOf(orga, "Roues Libres 66"));
  });
  it("casquette suspendue ou survol (pas d'acteur) : la personne, jamais la structure", () => {
    expect(storyAuthorFor(null, null, orga, "Suspendue")).toEqual({ persona: "fan" });
    expect(storyAuthorFor(null, null, { kind: "provider" }, "La Brasa")).toEqual({ persona: "fan" });
  });
  it("auteur choisi : la page choisie, même sans acteur et quelle que soit la casquette active", () => {
    const choice = { kind: "page", persona: "organizer", id: "s-2", name: "MéditeSportCar", key: "s:s-2" } as const;
    expect(storyAuthorFor(choice, "s:s-1", orga, "Roues Libres 66")).toEqual({
      persona: "organizer",
      structureId: "s-2",
      name: "MéditeSportCar",
    });
    expect(storyAuthorFor(choice, null, { kind: "fan" }, "")).toMatchObject({ structureId: "s-2" });
  });
  it("me : la personne", () => {
    expect(storyAuthorFor({ kind: "me" }, "s:s-1", orga, "x")).toEqual({ persona: "fan" });
  });
});
