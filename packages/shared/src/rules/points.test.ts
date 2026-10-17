import { describe, expect, it } from "vitest";

import {
  canContest,
  carryoverPoints,
  checkinWritesOpen,
  contestDeadline,
  isStaffModeOpen,
  nextGrade,
  pointsPending,
  seasonYear,
  settleAt,
  settlementKind,
  staffModeOpensAt,
} from "./points";
import { isEventDay } from "./quietHours";
import { DAY, fromWallTime, HOUR } from "./time";

const paris = (month: number, day: number, hour: number, minute = 0, year = 2026) =>
  fromWallTime({ year, month, day, hour, minute });

// Salon le samedi 17 octobre 2026, 10:00–18:00 (Paris).
const event = { startsAt: paris(10, 17, 10), endsAt: paris(10, 17, 18), timezone: "Europe/Paris" };

describe("règlement de J+2", () => {
  it("48 h après la fin", () => {
    expect(settleAt(event)).toEqual(paris(10, 19, 18));
  });
  it("participation, malus ou rien", () => {
    expect(settlementKind({ status: "accepted", withdrawnAfterLock: false, checkedIn: true })).toBe("participation");
    expect(settlementKind({ status: "accepted", withdrawnAfterLock: false, checkedIn: false })).toBe("malus");
    expect(settlementKind({ status: "withdrawn", withdrawnAfterLock: true, checkedIn: false })).toBe("malus");
    expect(settlementKind({ status: "withdrawn", withdrawnAfterLock: false, checkedIn: false })).toBeNull();
    // Lot 26 : désisté après être entré (un jour précédent) : la participation reste, jamais de malus.
    expect(settlementKind({ status: "withdrawn", withdrawnAfterLock: true, checkedIn: true })).toBe("participation");
    expect(settlementKind({ status: "withdrawn", withdrawnAfterLock: false, checkedIn: true })).toBe("participation");
    expect(settlementKind({ status: "cancelled", withdrawnAfterLock: false, checkedIn: false })).toBeNull();
    expect(settlementKind({ status: "refused", withdrawnAfterLock: false, checkedIn: false })).toBeNull();
  });
  it("« pointage en attente » entre la fin et le règlement", () => {
    expect(pointsPending({ ...event, settledAt: null }, paris(10, 17, 17))).toBe(false);
    expect(pointsPending({ ...event, settledAt: null }, paris(10, 18, 9))).toBe(true);
    expect(pointsPending({ ...event, settledAt: paris(10, 19, 18) }, paris(10, 20, 9))).toBe(false);
  });
});

describe("contestation d'un malus", () => {
  const malusAt = paris(10, 19, 18);
  it("7 jours pour contester", () => {
    expect(contestDeadline(malusAt)).toEqual(new Date(malusAt.getTime() + 7 * DAY));
    expect(canContest(malusAt, new Date(malusAt.getTime() + 7 * DAY))).toBe(true);
    expect(canContest(malusAt, new Date(malusAt.getTime() + 7 * DAY + 1))).toBe(false);
  });
});

describe("grades et saisons", () => {
  it("fin de saison : on descend d'un grade", () => {
    expect(carryoverPoints(340)).toBe(100); // Sport → Route
    expect(carryoverPoints(900)).toBe(400); // Légende → Circuit
    expect(carryoverPoints(120)).toBe(0); // Route → Rodage
    expect(carryoverPoints(40)).toBe(0); // Rodage reste Rodage
  });
  it("prochain grade", () => {
    expect(nextGrade(120)).toEqual({ grade: "sport", threshold: 300 });
    expect(nextGrade(800)).toBeNull();
  });
  it("saison = année civile à Paris", () => {
    expect(seasonYear(new Date("2026-12-31T23:30:00Z"))).toBe(2027); // 00:30 le 1er janvier à Paris
    expect(seasonYear(new Date("2026-12-31T22:30:00Z"))).toBe(2026);
  });
});

describe("fenêtre du mode staff et du pointage", () => {
  it("ouvert la veille à 00:00, fermé à J+1", () => {
    expect(staffModeOpensAt(event)).toEqual(paris(10, 16, 0));
    expect(isStaffModeOpen(event, paris(10, 15, 23, 59))).toBe(false);
    expect(isStaffModeOpen(event, paris(10, 16, 0))).toBe(true);
    expect(isStaffModeOpen(event, new Date(event.endsAt.getTime() + DAY - 1))).toBe(true);
    expect(isStaffModeOpen(event, new Date(event.endsAt.getTime() + DAY))).toBe(false);
  });
  it("pointage accepté par l'API jusqu'au règlement", () => {
    const open = { ...event, settledAt: null };
    expect(checkinWritesOpen(open, paris(10, 19, 17))).toBe(true);
    expect(checkinWritesOpen(open, paris(10, 19, 18))).toBe(false);
    expect(checkinWritesOpen({ ...event, settledAt: paris(10, 19, 18) }, paris(10, 19, 12))).toBe(false);
  });
  it("jour J", () => {
    expect(isEventDay(event.startsAt, paris(10, 17, 7))).toBe(true);
    expect(isEventDay(event.startsAt, paris(10, 16, 23))).toBe(false);
    expect(isEventDay(event.startsAt, new Date(event.startsAt.getTime() - 12 * HOUR))).toBe(false);
  });
});
