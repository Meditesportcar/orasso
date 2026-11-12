import { describe, expect, it } from "vitest";

import { mustDropChosenEvent, shownEvent } from "./eventDrop";

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

describe("événement affiché pendant un envoi incertain (P14a)", () => {
  const held = { id: "e1", title: "Balade" };
  it("la liste relue l'a encore : celui de la liste", () => {
    const listed = { id: "e1", title: "Balade (liste)" };
    expect(shownEvent({ listed, uncertainEventId: "e1", held })).toBe(listed);
  });
  it("absent de la liste pendant l'incertitude : celui gardé avec le corps", () => {
    expect(shownEvent({ listed: null, uncertainEventId: "e1", held })).toBe(held);
  });
  it("sans envoi incertain, ou pour un autre événement : rien", () => {
    expect(shownEvent({ listed: null, uncertainEventId: null, held })).toBeNull();
    expect(shownEvent({ listed: null, uncertainEventId: "e2", held })).toBeNull();
    expect(shownEvent({ listed: null, uncertainEventId: "e1", held: null })).toBeNull();
  });
});
