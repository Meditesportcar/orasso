import { describe, expect, it } from "vitest";

import { parseStoryAuthorKey, storyAuthorKeyOf } from "../schemas/stories";
import { type AuthorKind, authorKeyOf, authorKeyOfPersona, authorKinds, parseAuthorKey } from "./authors";

const ID = "3f2b1c0a-1111-4222-8333-444455556666";
const idOf = (kind: AuthorKind) => (kind === "user" ? "kenji_66" : ID);

describe("clés d'auteur des stories = clés d'auteur", () => {
  it.each(authorKinds)("%s : la même écriture et la même lecture", (kind) => {
    const key = authorKeyOf(kind, idOf(kind));
    expect(storyAuthorKeyOf(kind, idOf(kind))).toBe(key);
    expect(parseStoryAuthorKey(key)).toEqual({ kind, id: idOf(kind), key });
    expect(parseAuthorKey(key)).toEqual({ kind, id: idOf(kind), key });
  });
  it("v: et m: veulent un UUID strict, comme s: et p:", () => {
    for (const letter of ["s", "p", "v", "m"]) {
      expect(parseStoryAuthorKey(`${letter}:pas-un-uuid`)).toBeNull();
      expect(parseStoryAuthorKey(`${letter}:${ID.toUpperCase()}`)?.id).toBe(ID);
    }
    expect(parseStoryAuthorKey(`e:${ID}`)).toBeNull();
    expect(parseStoryAuthorKey(`x:${ID}`)).toBeNull();
  });
});

describe("authorKeyOfPersona", () => {
  it("la casquette de GET /me donne la clé d'auteur", () => {
    expect(authorKeyOfPersona({ kind: "organizer", id: ID })).toBe(`s:${ID}`);
    expect(authorKeyOfPersona({ kind: "pro", id: ID })).toBe(`p:${ID}`);
    expect(authorKeyOfPersona({ kind: "provider", id: ID })).toBe(`v:${ID}`);
    expect(authorKeyOfPersona({ kind: "media", id: ID })).toBe(`m:${ID}`);
  });
  it("passionné et visiteur : aucune clé", () => {
    expect(authorKeyOfPersona({ kind: "fan", id: "fan" })).toBeNull();
    expect(authorKeyOfPersona({ kind: "visitor", id: "visitor" })).toBeNull();
  });
});
