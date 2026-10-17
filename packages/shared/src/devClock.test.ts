import { describe, expect, it } from "vitest";

import { clockAdvanceInput, formatClockOffset, milestoneAt, parseDurationMs } from "./devClock";
import { fromWallTime } from "./rules/time";

describe("horloge simulée : durées", () => {
  it("lit 2h, 1d, 1j4h, 30m, +2h", () => {
    expect(parseDurationMs("2h")).toBe(7_200_000);
    expect(parseDurationMs("+1d")).toBe(86_400_000);
    expect(parseDurationMs("1j4h")).toBe(86_400_000 + 4 * 3_600_000);
    expect(parseDurationMs("30m")).toBe(1_800_000);
    expect(parseDurationMs("45 min")).toBe(45 * 60_000);
  });
  it("refuse zéro, le négatif et le texte", () => {
    for (const bad of ["", "0h", "-2h", "demain", "2", "h2", "1d x"]) expect(parseDurationMs(bad), bad).toBeNull();
  });
  it("affiche le décalage du bandeau", () => {
    expect(formatClockOffset(0)).toBe("");
    expect(formatClockOffset(30_000)).toBe("");
    expect(formatClockOffset(45 * 60_000)).toBe("+45 min");
    expect(formatClockOffset(2 * 86_400_000 + 4 * 3_600_000)).toBe("+2 j 4 h");
    expect(formatClockOffset(86_400_000)).toBe("+1 j");
    expect(formatClockOffset(5 * 3_600_000 + 20 * 60_000)).toBe("+5 h 20 min");
  });
});

describe("horloge simulée : jalons et entrée", () => {
  const startsAt = fromWallTime({ year: 2026, month: 11, day: 14, hour: 10, minute: 0 });
  const endsAt = fromWallTime({ year: 2026, month: 11, day: 14, hour: 18, minute: 0 });
  const event = { startsAt, endsAt, lockOffsetMinutes: 120 };
  it("calcule verrouillage, début, fin, règlement, bilan", () => {
    expect(milestoneAt(event, "h-2")).toEqual(fromWallTime({ year: 2026, month: 11, day: 14, hour: 8, minute: 0 }));
    expect(milestoneAt(event, "start")).toEqual(startsAt);
    expect(milestoneAt(event, "end")).toEqual(endsAt);
    expect(milestoneAt(event, "j+2")).toEqual(fromWallTime({ year: 2026, month: 11, day: 16, hour: 18, minute: 0 }));
    expect(milestoneAt(event, "j+8")).toEqual(fromWallTime({ year: 2026, month: 11, day: 22, hour: 18, minute: 0 }));
  });
  it("exige exactement une cible", () => {
    const id = "7d5a1c1e-2f3b-4c8a-9d10-0a1b2c3d4e5f";
    expect(clockAdvanceInput.safeParse({ by: "2h" }).success).toBe(true);
    expect(clockAdvanceInput.safeParse({ to: "2026-11-18T09:00:00+01:00" }).success).toBe(true);
    expect(clockAdvanceInput.safeParse({ eventId: id, milestone: "j+2" }).success).toBe(true);
    expect(clockAdvanceInput.safeParse({}).success).toBe(false);
    expect(clockAdvanceInput.safeParse({ by: "2h", to: "2026-11-18T09:00:00Z" }).success).toBe(false);
    expect(clockAdvanceInput.safeParse({ milestone: "j+2" }).success).toBe(false);
    expect(clockAdvanceInput.safeParse({ eventId: id, by: "2h" }).success).toBe(false);
    expect(clockAdvanceInput.safeParse({ eventId: id, milestone: "j+9" }).success).toBe(false);
    expect(clockAdvanceInput.safeParse({ to: "2026-11-18T09:00" }).success).toBe(false);
  });
});
