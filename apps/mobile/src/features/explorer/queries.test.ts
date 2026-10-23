import { describe, expect, it } from "vitest";

import {
  activeFilters,
  dayBound,
  effectiveAround,
  emptyEventFilters,
  emptyProFilters,
  eventQuery,
  placeKey,
  proQuery,
  shouldAsk,
  whenRange,
} from "./queries";

// Mercredi 21 octobre 2026, 15 h à Paris.
const NOW = new Date("2026-10-21T13:00:00Z");

describe("réglages de l'Explorer v2 → API", () => {
  it("rien de réglé : tout, du plus proche au plus loin (distance), 20 par page", () => {
    const q = eventQuery("", emptyEventFilters, null, "list", NOW);
    expect(q).toMatchObject({ sort: "distance", limit: 20 });
    expect(q.q).toBeUndefined();
    expect(q.lat).toBeUndefined();
    expect(q.followed).toBeUndefined();
    expect(q.from).toBeUndefined();
  });

  it("format, Quand, Mes affinités, Structures suivies, position et carte (100 résultats)", () => {
    const q = eventQuery(
      "  rivesaltes ",
      { format: "exhibition", when: "weekend", affinity: true, followed: true },
      { lat: 42.7, lng: 2.9 },
      "map",
      NOW,
      "abc",
    );
    expect(q).toMatchObject({
      q: "rivesaltes",
      format: "exhibition",
      sort: "affinity",
      followed: "1",
      lat: 42.7,
      lng: 2.9,
      limit: 100,
      cursor: "abc",
      from: "2026-10-23T22:00:00.000Z",
      to: "2026-10-25T22:59:00.000Z",
    });
  });

  it("Quand : ce week-end (en cours le samedi et le dimanche), ce mois-ci, toutes dates", () => {
    expect(whenRange("all", NOW)).toEqual({});
    // Dimanche 25 octobre : le week-end en cours (samedi 24 à 0 h).
    expect(whenRange("weekend", new Date("2026-10-25T10:00:00Z")).from).toBe("2026-10-23T22:00:00.000Z");
    expect(whenRange("month", NOW)).toEqual({ from: NOW.toISOString(), to: "2026-10-31T22:59:00.000Z" });
    expect(whenRange("month", new Date("2026-12-10T10:00:00Z")).to).toBe("2026-12-31T22:59:00.000Z");
  });

  it("dates : minuit de Paris au début, 23 h 59 à la fin, illisible = ignorée", () => {
    expect(dayBound("2026-07-14", false)).toBe("2026-07-13T22:00:00.000Z");
    expect(dayBound("2026-07-14", true)).toBe("2026-07-14T21:59:00.000Z");
    expect(dayBound("14/07/2026", false)).toBeUndefined();
    expect(dayBound("2026-13-01", false)).toBeUndefined();
    expect(dayBound("", true)).toBeUndefined();
  });

  it("pros : activité, département, distance", () => {
    const q = proQuery("", { activity: "detailing", department: "34", radiusKm: 25 }, "distance", null, "list");
    expect(q).toMatchObject({ activity: "detailing", department: "34", sort: "distance", radiusKm: 25, limit: 20 });
  });

  it("compte les filtres actifs", () => {
    expect(activeFilters(emptyEventFilters)).toBe(0);
    expect(activeFilters({ ...emptyEventFilters, format: "show", followed: true })).toBe(2);
    expect(activeFilters({ ...emptyProFilters, activity: "parts" })).toBe(1);
  });
});

describe("position : « Plus tard » retenu", () => {
  it("ne redemande qu'après sept jours", () => {
    const day = 86_400_000;
    expect(shouldAsk(null, NOW.getTime())).toBe(true);
    expect(shouldAsk(NOW.getTime() - 2 * day, NOW.getTime())).toBe(false);
    expect(shouldAsk(NOW.getTime() - 7 * day, NOW.getTime())).toBe(true);
  });
});

// Lot M4, tour 2 : « Autour de… » (temporaire) et la distance propre à l'Explorer.
describe("« Autour de… » → API", () => {
  const here = { lat: 42.7, lng: 2.9 };
  it("Mon coin : ni position ni département envoyés (l'API part du secteur du compte) ; rayon ou partout", () => {
    const q = eventQuery("", emptyEventFilters, here, "list", NOW, undefined, "distance", {
      around: { kind: "mine" },
      radiusKm: 50,
    });
    expect(q.lat).toBeUndefined();
    expect(q.around).toBeUndefined();
    expect(q.radiusKm).toBe(50);
    expect(q.everywhere).toBeUndefined();
    const all = eventQuery("", emptyEventFilters, here, "list", NOW, undefined, "date", {
      around: { kind: "mine" },
      radiusKm: null,
    });
    expect(all.everywhere).toBe("1");
    expect(all.radiusKm).toBeUndefined();
  });

  it("Autour de moi : la position ; Ailleurs : le département, sans la position", () => {
    const me = eventQuery("", emptyEventFilters, here, "list", NOW, undefined, "distance", {
      around: { kind: "me" },
      radiusKm: 25,
    });
    expect(me).toMatchObject({ lat: 42.7, lng: 2.9, radiusKm: 25 });
    const elsewhere = eventQuery("", emptyEventFilters, here, "list", NOW, undefined, "distance", {
      around: { kind: "dept", code: "75" },
      radiusKm: null,
    });
    expect(elsewhere).toMatchObject({ around: "75", everywhere: "1" });
    expect(elsewhere.lat).toBeUndefined();
  });

  it("le choix par défaut suit la position ; « Autour de moi » sans position retombe sur Mon coin", () => {
    expect(effectiveAround(null, true)).toEqual({ kind: "me" });
    expect(effectiveAround(null, false)).toEqual({ kind: "mine" });
    expect(effectiveAround({ kind: "me" }, false)).toEqual({ kind: "mine" });
    expect(effectiveAround({ kind: "dept", code: "11" }, true)).toEqual({ kind: "dept", code: "11" });
  });

  it("cache : par point de départ et distance, jamais pour « Autour de moi »", () => {
    expect(placeKey({ around: { kind: "mine" }, radiusKm: null })).toBe("coin.partout");
    expect(placeKey({ around: { kind: "dept", code: "2A" }, radiusKm: 100 })).toBe("d2A.100");
    expect(placeKey({ around: { kind: "me" }, radiusKm: 10 })).toBeNull();
  });
});
