import { describe, expect, it } from "vitest";

import { deliverAfter, endOfQuietHours, isUrgent, urgentWithin, urgentWithinDays } from "./quietHours";
import { fromWallTime } from "./time";

const at = (day: number, hour: number, minute = 0) => fromWallTime({ year: 2026, month: 11, day, hour, minute });
const TWO_HOURS = 2 * 3_600_000;

describe("urgentWithin (lot R7c1)", () => {
  const now = at(9, 23, 0);
  it("le sujet commence dans la fenêtre, ou a déjà commencé", () => {
    expect(urgentWithin(at(10, 0, 30), now, TWO_HOURS)).toBe(true);
    expect(urgentWithin(at(10, 1, 0), now, TWO_HOURS)).toBe(true);
    expect(urgentWithin(at(10, 1, 1), now, TWO_HOURS)).toBe(false);
    expect(urgentWithin(at(9, 22, 0), now, TWO_HOURS)).toBe(true);
  });
  it("sans date de début, jamais urgent", () => {
    expect(urgentWithin(null, now, 3_600_000)).toBe(false);
    expect(urgentWithin(undefined, now, 3_600_000)).toBe(false);
  });
  it("aujourd'hui ou demain (jours calendaires de Paris)", () => {
    expect(urgentWithinDays(at(10, 9), now, 1)).toBe(true);
    expect(urgentWithinDays(at(9, 23, 30), now, 1)).toBe(true);
    expect(urgentWithinDays(at(11, 9), now, 1)).toBe(false);
  });
  it("sans règle propre au type, jamais urgent", () => {
    expect(isUrgent(undefined, at(9, 23, 30), now)).toBe(false);
    expect(isUrgent({ within: 3_600_000 }, at(9, 23, 30), now)).toBe(true);
    expect(isUrgent({ days: 1 }, at(10, 9), now)).toBe(true);
  });
});

describe("heures calmes et notification urgente (lot R7c1)", () => {
  const night = at(9, 23, 0);
  it("sans règle : la nuit attend 8 h, hors jour J", () => {
    expect(deliverAfter(night, at(10, 14))).toEqual(endOfQuietHours(night));
    expect(deliverAfter(night, at(12, 14))).toEqual(endOfQuietHours(night));
  });
  it("changement d'horaire demain : part tout de suite, pas pour un événement dans trois jours", () => {
    expect(deliverAfter(night, at(10, 14), undefined, { days: 1 })).toEqual(night);
    expect(deliverAfter(night, at(12, 14), undefined, { days: 1 })).toEqual(endOfQuietHours(night));
  });
  it("rendez-vous dans les 2 heures : part ; dans 5 heures : attend", () => {
    expect(deliverAfter(night, at(10, 0, 45), undefined, { within: TWO_HOURS })).toEqual(night);
    expect(deliverAfter(at(9, 22, 30), at(10, 3, 30), undefined, { within: TWO_HOURS })).toEqual(
      endOfQuietHours(at(9, 22, 30)),
    );
  });
  it("en journée, rien ne change", () => {
    const day = at(9, 14, 0);
    expect(deliverAfter(day, at(12, 14), undefined, { days: 1 })).toEqual(day);
  });
});
