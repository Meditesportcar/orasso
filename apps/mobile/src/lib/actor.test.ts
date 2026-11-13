import { describe, expect, it } from "vitest";

import { actorKeyOf, forbiddenIsCurrent } from "./actor";
import type { AppPersonaEntry } from "./personaModel";

const entries: AppPersonaEntry[] = [
  { kind: "fan", id: "fan", label: "Passionné", logoUrl: null, badge: 0 },
  { kind: "organizer", id: "s-1", label: "Roues Libres 66", logoUrl: null, badge: 0 },
  { kind: "pro", id: "p-1", label: "Atelier", logoUrl: null, badge: 0 },
  { kind: "provider", id: "v-1", label: "La Brasa", logoUrl: null, badge: 0 },
  { kind: "media", id: "m-1", label: "Objectif 66", logoUrl: null, badge: 0 },
  { kind: "admin", id: "admin", label: "Administration", logoUrl: null, badge: 0 },
  { kind: "organizer", id: "s-9", label: "Survolée", logoUrl: null, badge: 0, assisted: true },
];

describe("actorKeyOf : l'acteur d'un appel de la liste blanche", () => {
  it("une clé d'auteur par casquette de page : s:, p:, v:, m:", () => {
    expect(actorKeyOf({ kind: "organizer", structureId: "s-1" }, entries)).toBe("s:s-1");
    expect(actorKeyOf({ kind: "pro", proProfileId: "p-1" }, entries)).toBe("p:p-1");
    expect(actorKeyOf({ kind: "provider" }, entries)).toBe("v:v-1");
    expect(actorKeyOf({ kind: "media", mediaProfileId: "m-1" }, entries)).toBe("m:m-1");
  });
  it("nul pour le passionné, le visiteur et l'administration", () => {
    expect(actorKeyOf({ kind: "fan" }, entries)).toBeNull();
    expect(actorKeyOf({ kind: "visitor" }, entries)).toBeNull();
    expect(actorKeyOf({ kind: "admin" }, entries)).toBeNull();
  });
  it("nul pour le survol en assistance : on n'agit jamais au nom d'une structure survolée", () => {
    expect(actorKeyOf({ kind: "organizer", structureId: "s-9" }, entries)).toBeNull();
  });
  it("nul pour une structure suspendue : la casquette reste, l'en-tête n'est pas posé", () => {
    const suspended: AppPersonaEntry[] = [
      { kind: "organizer", id: "s-2", label: "Suspendue", logoUrl: null, badge: 0, suspended: true },
    ];
    expect(actorKeyOf({ kind: "organizer", structureId: "s-2" }, suspended)).toBeNull();
  });
  it("nul pour une casquette qui n'est plus dans le compte", () => {
    expect(actorKeyOf({ kind: "organizer", structureId: "s-inconnue" }, entries)).toBeNull();
    expect(actorKeyOf({ kind: "pro", proProfileId: "p-1" }, [])).toBeNull();
  });
});

describe("forbiddenIsCurrent : un 403 tardif ne touche pas la casquette en cours", () => {
  it("le refus de A après le passage à B : B reste (rien à relire)", () => {
    const b = { kind: "pro", proProfileId: "p-1" } as const;
    expect(forbiddenIsCurrent("s:s-1", b, entries)).toBe(false);
    expect(forbiddenIsCurrent("p:p-1", b, entries)).toBe(true);
    expect(forbiddenIsCurrent("s:s-1", { kind: "fan" }, entries)).toBe(false);
  });
});
