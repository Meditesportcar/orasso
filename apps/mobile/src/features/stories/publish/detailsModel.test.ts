import { storyAudienceOptions } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import { audienceOption, chooseAudience, initialDetails } from "./detailsModel";

const crews = [
  { id: "c1", name: "Roussillon Drift", members: 6 },
  { id: "c2", name: "Solo", members: 1 },
];
const options = storyAudienceOptions({ persona: "fan" }, "public", crews);

describe("détails d'une story", () => {
  it("par défaut : « Mes abonnés », rien d'autre", () => {
    const d = initialDetails(options);
    expect(d).toEqual({ caption: "", place: "", vehicleId: null, eventId: null, tags: [], audienceKey: "followers" });
  });

  it("une clé de public disparue retombe sur la première option", () => {
    expect(audienceOption(options, "crew:absent")?.key).toBe("followers");
    expect(audienceOption([], "followers")).toBeUndefined();
  });

  it("choisir un crew retire les identifiés et l'événement ; revenir à « Mes abonnés » retire les identifiés", () => {
    const state = { ...initialDetails(options), tags: [{ id: "u1", pseudo: "Kenji_66" }], eventId: "e1" };
    const crew = chooseAudience(state, options, "crew:c1");
    expect(crew.dropped).toBe(true);
    expect(crew.state).toMatchObject({ audienceKey: "crew:c1", tags: [], eventId: null });
    const withTag = { ...crew.state, tags: [{ id: "u2", pseudo: "Nina_34" }] };
    const back = chooseAudience(withTag, options, "followers");
    expect(back.dropped).toBe(true);
    expect(back.state.tags).toEqual([]);
    // Le même public rechoisi ne retire rien.
    const same = chooseAudience(state, options, "followers");
    expect(same.dropped).toBe(false);
    expect(same.state.tags).toHaveLength(1);
  });

  it("sans option (rien chargé), rien ne change", () => {
    const state = initialDetails([]);
    expect(chooseAudience(state, [], "x")).toEqual({ state, dropped: false });
  });
});
