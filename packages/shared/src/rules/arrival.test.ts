import { describe, expect, it } from "vitest";

import { arrivalProblems } from "../labels/arrival.fr";
import {
  type Arrivals,
  arrivalInstant,
  arrivalLabel,
  arrivalTime,
  needsArrivalSeen,
  validateArrivals,
} from "./arrival";
import { fromWallTime } from "./time";

// Nocturne de Canet : samedi 24 octobre 2026, 19 h – 23 h 30 (heure de Paris).
const startsAt = fromWallTime({ year: 2026, month: 10, day: 24, hour: 19, minute: 0 });
const endsAt = fromWallTime({ year: 2026, month: 10, day: 24, hour: 23, minute: 30 });
const check = (arrivals: Arrivals | null) => validateArrivals({ arrivals, startsAt, endsAt });

const nocturne: Arrivals = {
  exhibitors: { from: "18:30", to: "19:15", strict: true, note: "Entrée côté capitainerie." },
  public: { from: "19:30", to: null, strict: false, note: null },
};

describe("arrivalLabel", () => {
  it("écrit le créneau comme le prototype", () => {
    expect(arrivalLabel(nocturne.exhibitors!)).toBe("Arrivée 18 h 30 – 19 h 15 (strict)");
    // Lot M4 : jamais « conseillé ».
    expect(arrivalLabel(nocturne.public!)).toBe("Arrivée dès 19 h 30");
    expect(arrivalLabel({ from: "19:00", to: "23:00", strict: false, note: null })).toBe("Arrivée 19 h – 23 h");
  });

  it("formate une heure murale", () => {
    expect(arrivalTime("08:05")).toBe("8 h 05");
    expect(arrivalTime("21:00")).toBe("21 h");
  });
});

describe("validateArrivals", () => {
  it("accepte les créneaux de la Nocturne, et l'absence de créneau", () => {
    expect(check(nocturne)).toBeNull();
    expect(check(null)).toBeNull();
    expect(check({ exhibitors: null, public: null })).toBeNull();
  });

  it("refuse une fin avant le début", () => {
    expect(check({ ...nocturne, exhibitors: { ...nocturne.exhibitors!, to: "18:00" } })).toBe("exhibitors_order");
    expect(check({ ...nocturne, exhibitors: { ...nocturne.exhibitors!, to: "18:30" } })).toBe("exhibitors_order");
    expect(check({ exhibitors: null, public: { from: "20:00", to: "19:00", strict: false, note: null } })).toBe(
      "public_order",
    );
  });

  it("refuse un public qui arrive avant les exposants", () => {
    expect(check({ ...nocturne, public: { from: "18:00", to: null, strict: false, note: null } })).toBe(
      "public_before_exhibitors",
    );
    // Sans créneau exposants, le public arrive quand il veut.
    expect(check({ exhibitors: null, public: { from: "10:00", to: null, strict: false, note: null } })).toBeNull();
  });

  it("refuse un créneau des exposants après la fin de l'événement", () => {
    expect(check({ exhibitors: { from: "23:45", to: null, strict: false, note: null }, public: null })).toBe(
      "exhibitors_after_event",
    );
    // Avant le début : permis (installation).
    expect(check({ exhibitors: { from: "16:00", to: "18:00", strict: true, note: null }, public: null })).toBeNull();
  });

  it("accepte un créneau qui passe minuit, refuse plus de 12 h", () => {
    const late = { startsAt: endsAt, endsAt: new Date(endsAt.getTime() + 4 * 3_600_000) };
    const slot = (from: string, to: string | null) => ({ from, to, strict: true, note: null });
    expect(validateArrivals({ ...late, arrivals: { exhibitors: slot("23:30", "00:30"), public: null } })).toBeNull();
    expect(
      validateArrivals({ ...late, arrivals: { exhibitors: slot("23:30", null), public: slot("00:15", null) } }),
    ).toBeNull();
    expect(validateArrivals({ ...late, arrivals: { exhibitors: slot("23:30", "12:00"), public: null } })).toBe(
      "exhibitors_order",
    );
    // Arrivée à 00:30 pour un début à 23 h 30 : le lendemain.
    expect(arrivalInstant("00:30", endsAt)?.getTime()).toBe(endsAt.getTime() + 3_600_000);
  });

  it("refuse une note de plus de 200 caractères", () => {
    expect(check({ ...nocturne, public: { ...nocturne.public!, note: "x".repeat(201) } })).toBe("note_too_long");
  });

  it("chaque problème a son libellé", () => {
    for (const k of [
      "exhibitors_order",
      "public_order",
      "exhibitors_after_event",
      "public_before_exhibitors",
    ] as const) {
      expect(arrivalProblems[k]).toBeTruthy();
    }
  });
});

describe("arrivalInstant, needsArrivalSeen", () => {
  it("place l'heure le jour de début, dans le fuseau de l'événement", () => {
    expect(arrivalInstant("18:30", startsAt)?.toISOString()).toBe("2026-10-24T16:30:00.000Z");
  });

  it("demande « J'ai vu » seulement avec un créneau exposants", () => {
    expect(needsArrivalSeen({ arrivals: nocturne })).toBe(true);
    expect(needsArrivalSeen({ arrivals: { exhibitors: null, public: nocturne.public } })).toBe(false);
    expect(needsArrivalSeen({ arrivals: null })).toBe(false);
  });
});
