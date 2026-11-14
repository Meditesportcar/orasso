import { describe, expect, it } from "vitest";
import { selectViewerActions } from "./select";

type Role = "media" | "organizer" | "tagged" | "member";
const act = (id: string, roles: Role[]) => ({ id, roles });
// Comme le registre réel : « Identifier une voiture » aux rôles média et organisateur (R9f), reprise et officiel à l'organisateur (R9g).
const byRole = [act("tag-identify", ["media", "organizer"]), act("tag-mine", ["tagged"]), act("tag-list", ["member"])];
const organizerOnly = [act("repost", ["organizer"]), act("official", ["organizer"])];
const ids = (role: Role, organizer: boolean) =>
  selectViewerActions(byRole, organizerOnly, role, organizer, "organizer").map((a) => a.id);

describe("actions de la visionneuse", () => {
  it("le rôle organisateur (droits du compte) sans la casquette : l'identification seulement, jamais reprise ni officiel", () => {
    expect(ids("organizer", false)).toEqual(["tag-identify"]);
  });
  it("un responsable sous une autre casquette, rôle membre : aucune action d'organisateur", () => {
    expect(ids("member", false)).toEqual(["tag-list"]);
    expect(ids("tagged", false)).toEqual(["tag-mine"]);
  });
  it("sous la bonne casquette : l'identification puis les actions de l'organisateur", () => {
    expect(ids("organizer", true)).toEqual(["tag-identify", "repost", "official"]);
  });
  it("le média auteur qui porte la casquette : un seul « Identifier une voiture », plus les actions R9g", () => {
    expect(ids("media", true)).toEqual(["tag-identify", "repost", "official"]);
  });
  it("casquette de l'organisateur mais rôle membre ou identifié : leur action du rôle + les actions R9g, sans identification posée", () => {
    expect(ids("member", true)).toEqual(["tag-list", "repost", "official"]);
    expect(ids("tagged", true)).toEqual(["tag-mine", "repost", "official"]);
  });
  it("les identifiants rendus sont uniques, quel que soit le cumul", () => {
    for (const role of ["media", "organizer", "tagged", "member"] as Role[]) {
      for (const organizer of [false, true]) {
        const list = ids(role, organizer);
        expect(new Set(list).size).toBe(list.length);
      }
    }
  });
});
