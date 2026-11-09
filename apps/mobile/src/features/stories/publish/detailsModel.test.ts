import { storyAudienceOptions } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import {
  audienceLost,
  audienceOption,
  audienceOptionDisabled,
  chooseAudience,
  type DetailsState,
  initialDetails,
  settleAudience,
  withPlace,
} from "./detailsModel";

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

  it("un public disparu (crew quitté ou supprimé) reste invalide : jamais de bascule d'office vers « Mes abonnés »", () => {
    expect(audienceOption(options, "crew:absent")).toBeUndefined();
    expect(audienceLost(options, "crew:absent")).toBe(true);
    expect(audienceLost(options, "crew:c1")).toBe(false);
    expect(audienceLost(options, "followers")).toBe(false);
    // Le crew choisi disparaît des options : l'état garde la clé (donc reste invalide), rien n'est réécrit.
    const withoutC1 = storyAudienceOptions({ persona: "fan" }, "public", [crews[1] as (typeof crews)[number]]);
    const chosen = { ...initialDetails(options), audienceKey: "crew:c1", caption: "Belle sortie" };
    expect(settleAudience(chosen, withoutC1)).toBe(chosen);
    expect(audienceLost(withoutC1, chosen.audienceKey)).toBe(true);
  });

  it("crew disparu, « Mes abonnés » seul restant : l'option est sélectionnable, puis la ligne d'erreur disparaît", () => {
    const only = storyAudienceOptions({ persona: "fan" }, "public", []);
    expect(only).toHaveLength(1);
    const lostState = { ...initialDetails(options), audienceKey: "crew:c1" };
    expect(audienceLost(only, lostState.audienceKey)).toBe(true);
    expect(audienceOptionDisabled(only, lostState.audienceKey, false)).toBe(false);
    // Pendant l'envoi, elle reste inactive.
    expect(audienceOptionDisabled(only, lostState.audienceKey, true)).toBe(true);
    const next = chooseAudience(lostState, only, "followers");
    expect(next.state.audienceKey).toBe("followers");
    expect(audienceLost(only, next.state.audienceKey)).toBe(false);
    // Choix déjà valide et option unique : rien à changer, inactive.
    expect(audienceOptionDisabled(only, "followers", false)).toBe(true);
    // Plusieurs options : jamais inactive hors envoi.
    expect(audienceOptionDisabled(options, "followers", false)).toBe(false);
  });

  it("au tout début, la première option du moment est prise (« Public » pour un organisateur) ; ensuite plus d'office", () => {
    const start = initialDetails([]);
    expect(start.audienceKey).toBe("");
    expect(audienceLost([], start.audienceKey)).toBe(false);
    const orga = storyAudienceOptions({ persona: "organizer", structureId: "s1" }, "public", []);
    expect(settleAudience(start, orga).audienceKey).toBe("public");
    expect(settleAudience({ ...start, audienceKey: "followers" }, orga).audienceKey).toBe("followers");
  });

  it("un nouveau choix après un public perdu retire les identifiés", () => {
    const lost: DetailsState = {
      ...initialDetails(options),
      audienceKey: "crew:gone",
      tags: [{ id: "u1", pseudo: "K" }],
    };
    const next = chooseAudience(lost, options, "followers");
    expect(next.state).toMatchObject({ audienceKey: "followers", tags: [] });
    expect(next.dropped).toBe(true);
  });

  it("« Ma ville » arrivée en retard ne change que le lieu : audience, légende et identifiés d'aujourd'hui restent", () => {
    // Le résultat est une mise à jour fonctionnelle : elle s'applique à l'état du moment où il arrive.
    const apply = withPlace("Perpignan");
    const meanwhile: DetailsState = {
      ...initialDetails(options),
      audienceKey: "crew:c1",
      caption: "Tapé pendant la lecture",
      tags: [{ id: "u2", pseudo: "Nina_34" }],
    };
    expect(apply(meanwhile)).toEqual({ ...meanwhile, place: "Perpignan" });
    // Le même lieu ne crée pas un nouvel état.
    expect(withPlace("Perpignan")({ ...meanwhile, place: "Perpignan" })).toEqual({ ...meanwhile, place: "Perpignan" });
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
