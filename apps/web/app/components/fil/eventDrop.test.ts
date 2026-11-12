import { describe, expect, it } from "vitest";

import { mustDropChosenEvent } from "./eventDrop";

describe("événement choisi absent de la liste relue (P14a)", () => {
  it("envoi libre : l'événement absent est retiré", () => {
    expect(mustDropChosenEvent({ uncertain: false, chosenEventId: "e1", readableIds: ["e2"] })).toBe(true);
  });
  it("envoi incertain repris : l'événement reste affiché", () => {
    expect(mustDropChosenEvent({ uncertain: true, chosenEventId: "e1", readableIds: ["e2"] })).toBe(false);
  });
  it("événement encore dans la liste, aucun choix ou liste non lue : rien à retirer", () => {
    expect(mustDropChosenEvent({ uncertain: false, chosenEventId: "e1", readableIds: ["e1"] })).toBe(false);
    expect(mustDropChosenEvent({ uncertain: false, chosenEventId: null, readableIds: ["e1"] })).toBe(false);
    expect(mustDropChosenEvent({ uncertain: false, chosenEventId: "e1", readableIds: null })).toBe(false);
  });
});
