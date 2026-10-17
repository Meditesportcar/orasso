// Événements sur plusieurs jours (lot 26) : règles pures.
import { describe, expect, it } from "vitest";

import {
  capacityFor,
  checkDayChoice,
  countsOnDay,
  dayFor,
  eveOf,
  formatDayDate,
  freePlaces,
  isMultiDay,
  localDate,
  resolveDays,
} from "./eventDays";

const d1 = {
  id: "d1",
  dayDate: "2027-03-14",
  startsAt: new Date("2027-03-14T08:00:00Z"),
  endsAt: new Date("2027-03-14T17:00:00Z"),
  capacity: null,
};
const d2 = {
  id: "d2",
  dayDate: "2027-03-15",
  startsAt: new Date("2027-03-15T08:00:00Z"),
  endsAt: new Date("2027-03-15T17:00:00Z"),
  capacity: 3,
};
const d3 = {
  id: "d3",
  dayDate: "2027-03-16",
  startsAt: new Date("2027-03-16T08:00:00Z"),
  endsAt: new Date("2027-03-16T17:00:00Z"),
  capacity: null,
};
const days = [d1, d2, d3];

describe("jours d'un événement", () => {
  it("plusieurs jours = au moins deux", () => {
    expect(isMultiDay([])).toBe(false);
    expect(isMultiDay([d1])).toBe(false);
    expect(isMultiDay([d1, d2])).toBe(true);
  });

  it("date locale de Paris et jour du moment", () => {
    expect(localDate(new Date("2027-03-14T23:30:00Z"))).toBe("2027-03-15");
    expect(dayFor(days, new Date("2027-03-15T12:00:00Z"))?.id).toBe("d2");
    expect(dayFor(days, new Date("2027-03-20T12:00:00Z"))).toBeNull();
  });

  it("capacité du jour, sinon celle de l'événement", () => {
    expect(capacityFor({ capacity: 2 }, d1)).toBe(2);
    expect(capacityFor({ capacity: 2 }, d2)).toBe(3);
    expect(capacityFor({ capacity: null }, d1)).toBeNull();
  });

  it("une candidature « tout l'événement » compte chaque jour", () => {
    expect(countsOnDay({ eventDayId: null }, "d2")).toBe(true);
    expect(countsOnDay({ eventDayId: "d2" }, "d2")).toBe(true);
    expect(countsOnDay({ eventDayId: "d1" }, "d2")).toBe(false);
  });
});

describe("places libres", () => {
  it("événement d'un jour : capacité − prises, comme avant", () => {
    expect(freePlaces({ capacity: 10 }, [], [{ eventDayId: null, n: 4 }], null)).toBe(6);
    expect(freePlaces({ capacity: null }, [], [{ eventDayId: null, n: 4 }], null)).toBeNull();
  });

  it("par jour : la capacité du jour moins ce jour et tout l'événement", () => {
    const taken = [
      { eventDayId: null, n: 1 },
      { eventDayId: "d1", n: 1 },
      { eventDayId: "d2", n: 1 },
    ];
    expect(freePlaces({ capacity: 2 }, days, taken, "d1")).toBe(0);
    expect(freePlaces({ capacity: 2 }, days, taken, "d2")).toBe(1);
    expect(freePlaces({ capacity: 2 }, days, taken, "d3")).toBe(1);
    // Tout l'événement : une place libre chaque jour, sinon rien.
    expect(freePlaces({ capacity: 2 }, days, taken, null)).toBe(0);
    expect(freePlaces({ capacity: 3 }, days, taken, null)).toBe(1);
  });

  it("sans limite si aucun jour n'en a", () => {
    expect(freePlaces({ capacity: null }, [d1, d3], [{ eventDayId: null, n: 50 }], null)).toBeNull();
    expect(freePlaces({ capacity: null }, days, [{ eventDayId: null, n: 2 }], null)).toBe(1);
  });

  it("jour inconnu : aucune place", () => {
    expect(freePlaces({ capacity: 2 }, days, [], "autre")).toBe(0);
  });
});

describe("choix du jour à la candidature", () => {
  it("événement d'un jour : jamais de jour", () => {
    expect(checkDayChoice("whole", [], null)).toBeNull();
    expect(checkDayChoice("both", [d1], "d1")).toBe("day_not_allowed");
  });
  it("tout l'événement, par jour, au choix", () => {
    expect(checkDayChoice("whole", days, null)).toBeNull();
    expect(checkDayChoice("whole", days, "d1")).toBe("day_not_allowed");
    expect(checkDayChoice("per_day", days, null)).toBe("day_required");
    expect(checkDayChoice("per_day", days, "d2")).toBeNull();
    expect(checkDayChoice("both", days, null)).toBeNull();
    expect(checkDayChoice("both", days, "d3")).toBeNull();
    expect(checkDayChoice("both", days, "dX")).toBe("unknown_day");
  });
});

describe("veille et bornes", () => {
  it("veille du jour choisi, sinon du premier jour", () => {
    const event = { startsAt: d1.startsAt };
    expect(eveOf(event, days, { eventDayId: null })).toEqual(d1.startsAt);
    expect(eveOf(event, days, { eventDayId: "d2" })).toEqual(d2.startsAt);
  });

  it("jours saisis → instants (heure de Paris), tri, bornes, nocturne après minuit", () => {
    const r = resolveDays([
      { date: "2027-03-15", startTime: "09:00", endTime: "18:00", capacity: 100 },
      { date: "2027-03-14", startTime: "20:00", endTime: "01:00", capacity: null },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.days.map((d) => d.dayDate)).toEqual(["2027-03-14", "2027-03-15"]);
    expect(r.days[0]?.startsAt.toISOString()).toBe("2027-03-14T19:00:00.000Z");
    expect(r.days[0]?.endsAt.toISOString()).toBe("2027-03-15T00:00:00.000Z");
    expect(r.startsAt.toISOString()).toBe("2027-03-14T19:00:00.000Z");
    expect(r.endsAt.toISOString()).toBe("2027-03-15T17:00:00.000Z");
  });

  it("refus : moins de deux jours, doublon, chevauchement", () => {
    expect(resolveDays([{ date: "2027-03-14", startTime: "09:00", endTime: "18:00", capacity: null }])).toEqual({
      ok: false,
      error: "too_few",
    });
    const same = { date: "2027-03-14", startTime: "09:00", endTime: "18:00", capacity: null };
    expect(resolveDays([same, same])).toMatchObject({ ok: false, error: "duplicate_date" });
    expect(
      resolveDays([
        { date: "2027-03-14", startTime: "20:00", endTime: "10:00", capacity: null },
        { date: "2027-03-15", startTime: "09:00", endTime: "18:00", capacity: null },
      ]),
    ).toMatchObject({ ok: false, error: "overlap" });
  });

  it("date en toutes lettres", () => {
    expect(formatDayDate("2027-03-14")).toBe("dimanche 14 mars");
    expect(formatDayDate("2027-03-14", { weekday: false })).toBe("14 mars");
  });
});
