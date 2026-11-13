import { describe, expect, it } from "vitest";
import { actorKeyOfSpace, casquetteRows, isPageCasquette, resolveStoryAuthor, storyAuthorAllowed } from "./casquettes";
import { storyBody } from "./storyPublish";

const kindLabel = (kind: string) =>
  ({ organizer: "Organisateur", pro: "Pro", provider: "Prestataire", media: "Média" })[kind] ?? kind;
const entries = [
  { kind: "fan", id: "fan", label: "Passionné", logoUrl: null },
  { kind: "organizer", id: "s1", label: "Roues Libres 66", logoUrl: "https://x/rl.png" },
  { kind: "pro", id: "p1", label: "Atelier Têt Detailing", logoUrl: null },
  { kind: "provider", id: "v1", label: "La Brasa", logoUrl: null },
  { kind: "media", id: "m1", label: "Objectif 66", logoUrl: null },
  { kind: "admin", id: "admin", label: "Administration", logoUrl: null },
  { kind: "organizer", id: "survol", label: "Autre structure", logoUrl: null, assisted: true },
];
const base = { base: "fan" as const, pseudo: "Damien_66", avatarUrl: null, kindLabel };

describe("casquetteRows : les lignes de la feuille « Mes casquettes »", () => {
  it("« Moi · pseudo » d'abord, puis chaque casquette de page dans l'ordre de l'API, avec son type", () => {
    const rows = casquetteRows(entries, { ...base, activeKind: "organizer", activeId: "s1" });
    expect(rows.map((r) => r.title)).toEqual([
      "Moi · Damien_66",
      "Roues Libres 66",
      "Atelier Têt Detailing",
      "La Brasa",
      "Objectif 66",
    ]);
    expect(rows.map((r) => r.subtitle)).toEqual([
      "Ton compte de passionné",
      "Organisateur",
      "Pro",
      "Prestataire",
      "Média",
    ]);
  });
  it("le visiteur : « Ton compte de visiteur »", () => {
    const rows = casquetteRows(entries, { ...base, base: "visitor", activeKind: "visitor", activeId: null });
    expect(rows[0]?.subtitle).toBe("Ton compte de visiteur");
  });
  it("une seule ligne est active : la casquette (par son identifiant) ou « Moi »", () => {
    const two = [...entries, { kind: "organizer", id: "s2", label: "Autre", logoUrl: null }];
    const on = casquetteRows(two, { ...base, activeKind: "organizer", activeId: "s2" });
    expect(on.filter((r) => r.active).map((r) => r.key)).toEqual(["organizer:s2"]);
    const me = casquetteRows(two, { ...base, activeKind: "fan", activeId: null });
    expect(me.filter((r) => r.active).map((r) => r.key)).toEqual(["me"]);
    const provider = casquetteRows(two, { ...base, activeKind: "provider", activeId: null });
    expect(provider.filter((r) => r.active).map((r) => r.key)).toEqual(["provider:v1"]);
  });
  it("l'administration et le survol en assistance ne sont jamais proposés", () => {
    const rows = casquetteRows(entries, { ...base, activeKind: "fan", activeId: null });
    expect(rows.some((r) => r.kind === "admin" || r.title === "Autre structure")).toBe(false);
  });
  it("l'avatar du compte est le logo de « Moi »", () => {
    const rows = casquetteRows(entries, { ...base, avatarUrl: "https://x/a.png", activeKind: "fan", activeId: null });
    expect(rows[0]?.logoUrl).toBe("https://x/a.png");
  });
  it("isPageCasquette : quatre types", () => {
    expect(["organizer", "pro", "provider", "media"].every(isPageCasquette)).toBe(true);
    expect(["fan", "visitor", "admin"].some(isPageCasquette)).toBe(false);
  });
});

describe("resolveStoryAuthor : l'auteur d'une story lancée depuis « Publier » (R9n, tour 1)", () => {
  const two = [
    { kind: "organizer", id: "s1", label: "Roues Libres 66" },
    { kind: "organizer", id: "s2", label: "MéditeSportCar" },
    { kind: "pro", id: "p1", label: "Atelier" },
    { kind: "provider", id: "v1", label: "La Brasa" },
    { kind: "media", id: "m1", label: "Sud Cars" },
    { kind: "organizer", id: "survol", label: "Survolée", assisted: true },
  ];
  it("deux structures du même compte : la clé choisie, pas la casquette active", () => {
    expect(resolveStoryAuthor("s:s2", two)).toEqual({
      kind: "page",
      persona: "organizer",
      id: "s2",
      name: "MéditeSportCar",
      key: "s:s2",
    });
    expect(resolveStoryAuthor("s:s1", two)).toMatchObject({ id: "s1", name: "Roues Libres 66" });
  });
  it("pro, prestataire et média : la ligne du compte", () => {
    expect(resolveStoryAuthor("p:p1", two)).toMatchObject({ persona: "pro", id: "p1" });
    expect(resolveStoryAuthor("v:v1", two)).toMatchObject({ persona: "provider", name: "La Brasa" });
    expect(resolveStoryAuthor("m:m1", two)).toMatchObject({ persona: "media" });
  });
  it("passionné actif avec ?structure= : la clé de la structure se résout contre les casquettes du compte", () => {
    expect(resolveStoryAuthor("s:s1", two)).not.toBeNull();
  });
  it("me : la personne ; vide, inconnu, d'un autre compte, survolé : null (la casquette active)", () => {
    expect(resolveStoryAuthor("me", two)).toEqual({ kind: "me" });
    expect(resolveStoryAuthor(undefined, two)).toBeNull();
    expect(resolveStoryAuthor("", two)).toBeNull();
    expect(resolveStoryAuthor("s:autre", two)).toBeNull();
    expect(resolveStoryAuthor("v:autre", two)).toBeNull();
    expect(resolveStoryAuthor("s:survol", two)).toBeNull();
    expect(resolveStoryAuthor("u:quelquun", two)).toBeNull();
    expect(resolveStoryAuthor("sans-deux-points", two)).toBeNull();
  });
});

describe("storyAuthorAllowed : l'auteur figé garde-t-il ses droits ? (R9n, tour 2)", () => {
  const entries = [
    { kind: "organizer", id: "s1" },
    { kind: "pro", id: "p1" },
    { kind: "provider", id: "v1" },
    { kind: "organizer", id: "survol", assisted: true },
  ];
  it("la personne : toujours ; une page : tant que sa ligne est dans le compte", () => {
    expect(storyAuthorAllowed({ persona: "fan" }, [])).toBe(true);
    expect(storyAuthorAllowed({ persona: "organizer", structureId: "s1" }, entries)).toBe(true);
    expect(storyAuthorAllowed({ persona: "pro", proId: "p1" }, entries)).toBe(true);
    expect(storyAuthorAllowed({ persona: "provider" }, entries)).toBe(true);
  });
  it("structure quittée, fiche supprimée, survol : non", () => {
    expect(storyAuthorAllowed({ persona: "organizer", structureId: "s9" }, entries)).toBe(false);
    expect(storyAuthorAllowed({ persona: "organizer", structureId: "survol" }, entries)).toBe(false);
    expect(storyAuthorAllowed({ persona: "pro", proId: "p1" }, [])).toBe(false);
    expect(storyAuthorAllowed({ persona: "media" }, entries)).toBe(false);
  });
});

describe("le corps envoyé à l'API suit l'auteur figé (R9n, tour 2, point 9)", () => {
  const base = {
    uploadKey: "k",
    frame: { x: 0, y: 0, scale: 1 },
    rects: [],
    noPlate: true,
    audience: "public",
    crewId: null,
    caption: "salut",
    place: "",
    vehicleId: null,
    eventId: null,
    tags: [],
  } as never;
  it("auteur figé = structure : le corps porte structureId ; « Publier en mon nom » : persona fan, sans structureId", () => {
    const page = storyBody({
      ...(base as object),
      author: { persona: "organizer", structureId: "s1", name: "X" },
    } as never);
    expect(page).toMatchObject({ persona: "organizer", structureId: "s1" });
    const me = storyBody({ ...(base as object), author: { persona: "fan" } } as never);
    expect(me.persona).toBe("fan");
    expect(me).not.toHaveProperty("structureId");
  });
});

describe("suspension pendant la rédaction d'une story (R9n, tour 3)", () => {
  it("l'auteur figé (structure) perd ses droits au rafraîchissement : envoi bloqué ; « Publier en mon nom » : corps personnel", () => {
    const frozen = { persona: "organizer", structureId: "s1", name: "Roues Libres 66" } as const;
    const open = [{ kind: "organizer", id: "s1" }];
    expect(storyAuthorAllowed(frozen, open)).toBe(true);
    // Le rafraîchissement de GET /me remonte la structure suspendue.
    const suspended = [{ kind: "organizer", id: "s1", suspended: true }];
    expect(storyAuthorAllowed(frozen, suspended)).toBe(false);
    // Aucun envoi n'est fait tant qu'il est bloqué ; après le choix explicite, l'auteur est la personne et le corps est personnel.
    const choice = { persona: "fan" } as const;
    expect(storyAuthorAllowed(choice, suspended)).toBe(true);
    const body = storyBody({
      uploadKey: "k",
      frame: { x: 0, y: 0, scale: 1 },
      rects: [],
      noPlate: true,
      audience: "public",
      crewId: null,
      author: choice,
      caption: "",
      place: "",
      vehicleId: null,
      eventId: null,
      tags: [],
    } as never);
    expect(body.persona).toBe("fan");
    expect(body).not.toHaveProperty("structureId");
  });
});

describe("actorKeyOfSpace : la casquette que porte un espace du site (R9h, T48)", () => {
  it("une clé d'auteur par espace : s: p: m: v:", () => {
    expect(actorKeyOfSpace({ space: "organizer", id: "s1" })).toBe("s:s1");
    expect(actorKeyOfSpace({ space: "pro", id: "p1" })).toBe("p:p1");
    expect(actorKeyOfSpace({ space: "media", id: "m1" })).toBe("m:m1");
    expect(actorKeyOfSpace({ space: "provider", id: "v1" })).toBe("v:v1");
  });
  it("nulle hors d'un espace de casquette ou sans identifiant", () => {
    expect(actorKeyOfSpace({ space: null, id: "s1" })).toBeNull();
    expect(actorKeyOfSpace({ space: undefined, id: undefined })).toBeNull();
    expect(actorKeyOfSpace({ space: "organizer", id: null })).toBeNull();
    expect(actorKeyOfSpace({ space: "organizer", id: "" })).toBeNull();
  });
  it("nulle en mode assistance et pour une page suspendue : on n'agit jamais au nom d'une page survolée ou suspendue", () => {
    expect(actorKeyOfSpace({ space: "organizer", id: "s1", assisted: true })).toBeNull();
    expect(actorKeyOfSpace({ space: "organizer", id: "s1", suspended: true })).toBeNull();
    expect(actorKeyOfSpace({ space: "organizer", id: "s1", assisted: false, suspended: false })).toBe("s:s1");
  });
});
