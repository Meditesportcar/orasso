import type { Preferences } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import { draftFrom, mergeFresh, patchOf } from "./preferencesDraft";

const prefs = (over: Partial<Preferences> = {}): Preferences => ({
  eventFormats: [],
  radiusKm: 50,
  departments: ["66"],
  interests: [],
  newEvents: true,
  seenAt: null,
  ...over,
});

describe("brouillon de « Tes préférences »", () => {
  it("cache périmé puis réponse retardée : les champs touchés restent, les autres se mettent à jour", () => {
    // Le brouillon est parti de la copie en cache (périmée).
    const stale = prefs({ eventFormats: ["gathering"], radiusKm: 50, departments: ["66"] });
    let draft = draftFrom(stale);
    // La personne règle la distance avant que la réponse fraîche n'arrive.
    draft = { ...draft, radiusKm: 80 };
    const touched = { radiusKm: true } as const;
    // La réponse fraîche arrive : autres types, autre coin, autre distance.
    const fresh = prefs({ eventFormats: ["night"], radiusKm: 120, departments: ["11", "66"], interests: ["a"] });
    const next = mergeFresh(draft, touched, fresh);
    expect(next.radiusKm).toBe(80);
    expect(next.eventFormats).toEqual(["night"]);
    expect(next.departments).toEqual(["11", "66"]);
    expect(next.interests).toEqual(["a"]);
    // L'enregistrement n'envoie que ce qui a été touché.
    expect(patchOf(next, touched)).toEqual({ radiusKm: 80 });
  });

  it("sans brouillon, la première valeur lue le crée ; sans toucher à rien, rien n'est envoyé", () => {
    const draft = mergeFresh(null, {}, prefs({ radiusKm: null }));
    expect(draft.radiusKm).toBeNull();
    expect(patchOf(draft, {})).toEqual({});
  });

  it("« Partout en France » touché : null est envoyé ; non touché, la distance n'est jamais envoyée", () => {
    const draft = { ...draftFrom(prefs()), radiusKm: null };
    expect(patchOf(draft, { radiusKm: true })).toEqual({ radiusKm: null });
    expect(patchOf(draft, { newEvents: true })).toEqual({ newEvents: true });
  });

  it("deux réponses fraîches de suite gardent toujours les champs touchés", () => {
    let draft = draftFrom(prefs());
    const touched = { newEvents: true, interests: true } as const;
    draft = { ...draft, newEvents: false, interests: ["x"] };
    draft = mergeFresh(draft, touched, prefs({ radiusKm: 100, newEvents: true, interests: [] }));
    draft = mergeFresh(draft, touched, prefs({ radiusKm: 150, newEvents: true, interests: ["y"] }));
    expect(draft).toMatchObject({ radiusKm: 150, newEvents: false, interests: ["x"] });
  });
});
