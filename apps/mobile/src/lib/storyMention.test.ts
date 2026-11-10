import { describe, expect, it } from "vitest";

import { mentionStructure } from "./storyMention";

describe("mentionStructure : la structure visée par « Ajouter à ma story »", () => {
  const fan = { kind: "fan" };
  const club = { kind: "organizer", id: "s-club" };
  const asso = { kind: "organizer", id: "s-asso" };

  it("depuis la casquette passionné (aucune structure gérée) : aucun bouton", () => {
    expect(mentionStructure([fan], "s-club")).toBeNull();
  });

  it("avec deux structures : toujours celle de la mention, jamais l'autre", () => {
    expect(mentionStructure([fan, club, asso], "s-asso")).toBe("s-asso");
    expect(mentionStructure([fan, club, asso], "s-club")).toBe("s-club");
  });

  it("une structure que je ne gère pas, ou une mention sans structure : aucun bouton", () => {
    expect(mentionStructure([fan, club], "s-asso")).toBeNull();
    expect(mentionStructure([fan, club], null)).toBeNull();
    expect(mentionStructure([{ kind: "pro", id: "s-club" }], "s-club")).toBeNull();
    // Un survol en mode assistance (super admin) n'est pas une structure que je gère.
    expect(mentionStructure([{ kind: "organizer", id: "s-club", assisted: true }], "s-club")).toBeNull();
  });
});
