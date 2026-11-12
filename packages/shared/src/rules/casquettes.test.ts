import { describe, expect, it } from "vitest";

import { casquetteRows, isPageCasquette } from "./casquettes";

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
