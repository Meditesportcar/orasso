import { describe, expect, it } from "vitest";

import {
  activeFilters,
  dayBound,
  emptyEventFilters,
  emptyProFilters,
  eventQuery,
  proQuery,
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
