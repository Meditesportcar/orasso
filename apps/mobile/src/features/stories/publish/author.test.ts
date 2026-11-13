import { describe, expect, it } from "vitest";

import { askedPageUnavailable, authorOf, storyAuthorFor, storyHeaderPlain, storyPublishHref } from "./author";

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

describe("storyPublishHref : la barre des stories", () => {
  it("avec acteur : sa clé", () => {
    expect(storyPublishHref("s:abc", "organizer")).toBe("/story/publier?auteur=s%3Aabc");
  });
  it("casquette de base : l'adresse d'avant, sans paramètre (l'écran du passionné ne change pas)", () => {
    expect(storyPublishHref(null, "fan")).toBe("/story/publier");
    expect(storyPublishHref(null, "visitor")).toBe("/story/publier");
    expect(storyPublishHref(null, "admin")).toBe("/story/publier");
  });
  it("page sans acteur (suspendue, survol) : auteur=me, explicitement, et l'auteur est la personne", () => {
    const href = storyPublishHref(null, "organizer");
    expect(href).toBe("/story/publier?auteur=me");
    const orga = { kind: "organizer", structureId: "s-1" } as const;
    expect(storyAuthorFor({ kind: "me" }, null, orga, "Suspendue")).toEqual({ persona: "fan" });
  });
});

describe("storyHeaderPlain : l'en-tête de l'écran de story", () => {
  it("passionné (casquette de base) qui passe par Publication → Story (auteur=me) : « Visible 24 h » comme avant", () => {
    expect(storyHeaderPlain({ persona: "fan" }, "fan")).toBe(true);
    expect(storyHeaderPlain({ persona: "fan" }, "visitor")).toBe(true);
  });
  it("une page, ou la personne sous une casquette de page : « en tant que »", () => {
    expect(storyHeaderPlain({ persona: "organizer", structureId: "s", name: "X" }, "organizer")).toBe(false);
    expect(storyHeaderPlain({ persona: "fan" }, "organizer")).toBe(false);
  });
});

describe("askedPageUnavailable : une page demandée que le compte ne tient pas", () => {
  it("une clé de page sans casquette correspondante : indisponible (jamais un repli silencieux)", () => {
    for (const key of ["s:abc", "p:abc", "v:abc", "m:abc"]) expect(askedPageUnavailable(key, null)).toBe(true);
  });
  it("une page résolue, 'me', une clé inconnue ou l'absence de paramètre : non", () => {
    const page = { kind: "page", persona: "organizer", id: "s-1", name: "X", key: "s:s-1" } as const;
    expect(askedPageUnavailable("s:s-1", page)).toBe(false);
    expect(askedPageUnavailable("me", { kind: "me" })).toBe(false);
    expect(askedPageUnavailable("x:abc", null)).toBe(false);
    expect(askedPageUnavailable("s:", null)).toBe(false);
    expect(askedPageUnavailable(undefined, null)).toBe(false);
    expect(askedPageUnavailable("", null)).toBe(false);
  });
});
