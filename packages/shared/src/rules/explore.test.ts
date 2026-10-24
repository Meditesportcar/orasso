import { describe, expect, it } from "vitest";
import { homeWidgetIds, homeWidgetOffered, NEARBY_STATIONS_ENABLED } from "../home";
import {
  clampKm,
  dateStrip,
  dayLabel,
  isEventOver,
  notOver,
  readWhere,
  roadTime,
  sameWhere,
  shownStart,
  upcomingEndBound,
  whereQuery,
} from "./explore";

const HOUR = 3_600_000;
const now = new Date();
const at = (ms: number) => new Date(now.getTime() + ms).toISOString();

describe("Explorer : un événement terminé ne se montre plus (lot R1)", () => {
  it("terminé quand sa fin est passée, plusieurs jours compris (la fin du dernier jour)", () => {
    expect(isEventOver({ endsAt: at(-HOUR) }, now)).toBe(true);
    expect(isEventOver({ endsAt: at(HOUR) }, now)).toBe(false);
    // Commencé hier, fini demain (plusieurs jours) : encore là.
    expect(isEventOver({ endsAt: new Date(now.getTime() + 24 * HOUR) }, now)).toBe(false);
    // Date illisible : on ne cache rien.
    expect(isEventOver({ endsAt: "?" }, now)).toBe(false);
  });

  it("une liste du cache perd ses événements finis, dans le même ordre", () => {
    const list = [
      { id: "a", endsAt: at(2 * HOUR) },
      { id: "b", endsAt: at(-2 * HOUR) },
      { id: "c", endsAt: at(5 * HOUR) },
    ];
    expect(notOver(list, now).map((e) => e.id)).toEqual(["a", "c"]);
  });

  it("la borne basse des « à venir » ne remonte jamais avant maintenant (« Ce week-end » le dimanche)", () => {
    const saturday = new Date(now.getTime() - 30 * HOUR);
    expect(upcomingEndBound(saturday, now)).toBe(now);
    const later = new Date(now.getTime() + 30 * HOUR);
    expect(upcomingEndBound(later, now)).toBe(later);
    expect(upcomingEndBound(undefined, now)).toBe(now);
  });
});

describe("stations de lavage et de carburant retirées pour l'instant (lot R1, décision de Damien)", () => {
  it("le réglage est coupé : ni lavage ni carburant, les autres widgets restent", () => {
    expect(NEARBY_STATIONS_ENABLED).toBe(false);
    expect(homeWidgetIds.filter((id) => !homeWidgetOffered(id))).toEqual(["wash", "fuel"]);
    expect(homeWidgetIds.every((id) => homeWidgetOffered(id, true))).toBe(true);
  });
});

describe("lot R2 : « Où chercher ? » et les dates de la carte", () => {
  // Samedi 24 octobre 2026, 10 h à Paris.
  const now = new Date("2026-10-24T08:00:00Z");

  it("la distance se range sur le curseur (10 à 200 km, par 5)", () => {
    expect(clampKm(3)).toBe(10);
    expect(clampKm(102)).toBe(100);
    expect(clampKm(999)).toBe(200);
    expect(clampKm(Number.NaN)).toBe(100);
    expect(roadTime(40)).toBe("≈ 30 min de route");
    expect(roadTime(100)).toBe("≈ 1,4 h de route");
  });

  it("les paramètres de l'API : position et rayon, départements entiers, ou partout", () => {
    const here = { lat: 42.7, lng: 2.9 };
    expect(whereQuery({ kind: "me", km: 50 }, here, ["66"])).toEqual({ lat: 42.7, lng: 2.9, radiusKm: 50 });
    expect(whereQuery({ kind: "mine" }, here, ["66", "11"])).toEqual({ departments: "66,11" });
    expect(whereQuery({ kind: "dept", code: "34" }, null, ["66"])).toEqual({ departments: "34", around: "34" });
    expect(whereQuery({ kind: "all" }, null, ["66"])).toEqual({ everywhere: "1" });
    // Autour de moi sans position : partout (l'écran retombe d'abord sur Mon coin, voir `effectiveWhere`).
    expect(whereQuery({ kind: "me", km: 50 }, null, ["66"])).toEqual({ everywhere: "1" });
    expect(sameWhere({ kind: "me", km: 50 }, { kind: "me", km: 50 })).toBe(true);
    expect(sameWhere({ kind: "me", km: 50 }, { kind: "me", km: 75 })).toBe(false);
    expect(readWhere({ kind: "me", km: 75, lat: 1 }, () => true)).toEqual({ kind: "me", km: 75 });
    expect(readWhere({ kind: "dept", code: "zz" }, (c) => c === "66")).toBeNull();
  });

  it("dates en clair : aujourd'hui, demain, puis « Dim. 1 nov. »", () => {
    expect(dayLabel("2026-10-24T17:00:00Z", now)).toBe("Aujourd'hui");
    expect(dayLabel("2026-10-25T22:30:00Z", now)).toBe("Demain");
    expect(dayLabel("2026-11-01T09:00:00Z", now)).toBe("Dim. 1 nov.");
    expect(dayLabel("2026-08-15T09:00:00Z", now)).toBe("Sam. 15 août");
  });

  it("la frise : un jour par date, dans l'ordre ; un événement en cours compte pour aujourd'hui", () => {
    const strip = dateStrip(
      [
        { startsAt: "2026-11-01T09:00:00Z" },
        { startsAt: "2026-10-24T17:00:00Z" },
        { startsAt: "2026-10-22T08:00:00Z" },
        { startsAt: "2026-11-01T14:00:00Z" },
      ],
      now,
    );
    expect(strip).toEqual([
      { key: "2026-10-24", label: "Aujourd'hui", count: 2 },
      { key: "2026-11-01", label: "Dim. 1 nov.", count: 2 },
    ]);
    expect(shownStart("2026-10-22T08:00:00Z", now)).toEqual(now);
  });
});
