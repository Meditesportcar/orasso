import { describe, expect, it } from "vitest";

import { activeFilters, dayBound, emptyEventFilters, emptyProFilters, eventQuery, proQuery } from "./queries";

describe("réglages de l'Explorer → API", () => {
  it("rien de réglé : seuls le tri et la taille de page partent", () => {
    const q = eventQuery("", emptyEventFilters, "affinity", null, "list");
    expect(q).toMatchObject({ sort: "affinity", limit: 20 });
    expect(q.q).toBeUndefined();
    expect(q.lat).toBeUndefined();
    expect(q.radiusKm).toBeUndefined();
  });

  it("filtres, texte, position et carte (100 résultats)", () => {
    const q = eventQuery(
      "  rivesaltes ",
      { format: "exhibition", categoryId: "c1", department: "66", from: "2026-11-01", to: "2026-11-30", radiusKm: 50 },
      "distance",
      { lat: 42.7, lng: 2.9 },
      "map",
      "abc",
    );
    expect(q).toMatchObject({
      q: "rivesaltes",
      format: "exhibition",
      categoryId: "c1",
      department: "66",
      sort: "distance",
      radiusKm: 50,
      lat: 42.7,
      lng: 2.9,
      limit: 100,
      cursor: "abc",
    });
    expect(q.from).toMatch(/^2026-10-31T23:00:00\.000Z$|^2026-11-01T0[01]:00:00\.000Z$/);
    expect(q.to).toBeDefined();
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
    expect(activeFilters({ ...emptyEventFilters, format: "show", radiusKm: 10 })).toBe(2);
    expect(activeFilters({ ...emptyProFilters, activity: "parts" })).toBe(1);
  });
});
