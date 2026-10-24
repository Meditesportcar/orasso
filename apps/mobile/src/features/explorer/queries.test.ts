import { effectiveWhere, habitualWhere } from "@orasso/shared";
import { describe, expect, it } from "vitest";
import {
  activeFilters,
  dayBound,
  emptyEventFilters,
  eventQuery,
  placeKey,
  proQuery,
  shouldAsk,
  whenRange,
} from "./queries";

// Mercredi 21 octobre 2026, 15 h à Paris.
const NOW = new Date("2026-10-21T13:00:00Z");

describe("réglages de l'Explorer v2 → API", () => {
  it("rien de réglé : tout, par date (lot R2), 20 par page, le nombre en tout sur la première page", () => {
    const q = eventQuery("", emptyEventFilters, null, "list", NOW);
    expect(q).toMatchObject({ sort: "date", limit: 20, withTotal: "1" });
    expect(eventQuery("", emptyEventFilters, null, "list", NOW, "page2").withTotal).toBeUndefined();
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

  it("pros : un métier, le tri, le lieu (jamais « partout » ni « around » envoyés à l'annuaire)", () => {
    const q = proQuery("", "detailing", "distance", { lat: 42.7, lng: 2.9 }, "list", undefined, {
      where: { kind: "me", km: 100 },
      coin: ["66"],
    });
    expect(q).toMatchObject({ activity: "detailing", sort: "distance", radiusKm: 100, lat: 42.7, limit: 20 });
    const away = proQuery("", "", "name", null, "list", undefined, {
      where: { kind: "dept", code: "34" },
      coin: ["66"],
    });
    expect(away).toMatchObject({ departments: "34", sort: "name" });
    expect(away).not.toHaveProperty("around");
    const all = proQuery("", "", "distance", null, "map", undefined, { where: { kind: "all" }, coin: ["66"] });
    expect(all).not.toHaveProperty("everywhere");
    expect(all.limit).toBe(100);
  });

  it("compte les filtres actifs", () => {
    expect(activeFilters(emptyEventFilters)).toBe(0);
    expect(activeFilters({ ...emptyEventFilters, format: "show", followed: true })).toBe(2);
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

// Lot R2 : « Où chercher ? » → API.
describe("« Où chercher ? » → API", () => {
  const here = { lat: 42.7, lng: 2.9 };
  const coin = ["66", "11"];
  it("Autour de moi : la position et la distance ; Mon coin et Ailleurs : des départements entiers ; Partout", () => {
    const me = eventQuery("", emptyEventFilters, here, "list", NOW, undefined, "date", {
      where: { kind: "me", km: 75 },
      coin,
    });
    expect(me).toMatchObject({ lat: 42.7, lng: 2.9, radiusKm: 75 });
    expect(me.everywhere).toBeUndefined();
    const mine = eventQuery("", emptyEventFilters, here, "list", NOW, undefined, "date", {
      where: { kind: "mine" },
      coin,
    });
    expect(mine).toMatchObject({ departments: "66,11" });
    expect(mine.lat).toBeUndefined();
    expect(mine.radiusKm).toBeUndefined();
    const away = eventQuery("", emptyEventFilters, here, "list", NOW, undefined, "distance", {
      where: { kind: "dept", code: "75" },
      coin,
    });
    expect(away).toMatchObject({ departments: "75", around: "75" });
    const all = eventQuery("", emptyEventFilters, here, "list", NOW, undefined, "date", {
      where: { kind: "all" },
      coin,
    });
    expect(all).toMatchObject({ everywhere: "1", lat: 42.7 });
    expect(all.radiusKm).toBeUndefined();
  });

  it("réglages habituels : la distance des préférences autour de moi, sinon mon coin, ou partout", () => {
    expect(habitualWhere({ radiusKm: 100 }, true, true)).toEqual({ kind: "me", km: 100 });
    expect(habitualWhere({ radiusKm: 100 }, false, true)).toEqual({ kind: "mine" });
    expect(habitualWhere({ radiusKm: null }, true, true)).toEqual({ kind: "all" });
    expect(habitualWhere(null, false, false)).toEqual({ kind: "all" });
    // « Autour de moi » sans position retombe sur mon coin ; une recherche cherche partout tant que rien n'est choisi.
    const habit = { kind: "mine" } as const;
    const opts = { positionOn: false, hasCoin: true, searching: false };
    expect(effectiveWhere({ kind: "me", km: 50 }, habit, opts)).toEqual({ kind: "mine" });
    expect(effectiveWhere(null, habit, { ...opts, searching: true })).toEqual({ kind: "all" });
    expect(effectiveWhere({ kind: "dept", code: "11" }, habit, { ...opts, searching: true })).toEqual({
      kind: "dept",
      code: "11",
    });
  });

  it("cache : par lieu, jamais pour « Autour de moi »", () => {
    expect(placeKey({ where: { kind: "mine" }, coin })).toBe("coin.66+11");
    expect(placeKey({ where: { kind: "dept", code: "2A" }, coin })).toBe("d2A");
    expect(placeKey({ where: { kind: "all" }, coin })).toBe("partout");
    expect(placeKey({ where: { kind: "me", km: 10 }, coin })).toBeNull();
  });
});
