import { describe, expect, it } from "vitest";
import { directionsOpen, inNearWindow, nearCountdown, nearestAccess, nearWeekday } from "./nearAccess";
import { fromWallTime } from "./time";

const at = (month: number, day: number, hour = 10) => fromWallTime({ year: 2026, month, day, hour, minute: 0 });

describe("accès flottant : règle J-7 à J+1", () => {
  const start = at(10, 24, 19);
  const end = at(10, 24, 23);
  it("fenêtre", () => {
    expect(inNearWindow(start, end, at(10, 16, 23))).toBe(false);
    expect(inNearWindow(start, end, at(10, 17, 0))).toBe(true);
    expect(inNearWindow(start, end, at(10, 25, 12))).toBe(true);
    expect(inNearWindow(start, end, at(10, 26, 0))).toBe(false);
  });
  it("compte à rebours et jour de la semaine", () => {
    expect(nearCountdown(start, at(10, 18))).toBe("J-6");
    expect(nearCountdown(start, at(10, 23))).toBe("Demain");
    expect(nearCountdown(start, at(10, 24))).toBe("Aujourd'hui");
    expect(nearCountdown(start, at(10, 25))).toBe("J+1");
    expect(nearWeekday(start)).toBe("sam.");
  });
  it("le plus proche d'abord, puis candidature avant billet", () => {
    const iso = (d: Date) => d.toISOString();
    const items = [
      { key: "t", kind: "ticket" as const, startsAt: iso(start), endsAt: iso(end) },
      { key: "a", kind: "application" as const, startsAt: iso(start), endsAt: iso(end) },
      { key: "x", kind: "application" as const, startsAt: iso(at(10, 22)), endsAt: iso(at(10, 22, 12)) },
    ];
    expect(nearestAccess(items, at(10, 20))?.key).toBe("x");
    expect(nearestAccess(items.slice(0, 2), at(10, 20))?.key).toBe("a");
    expect(nearestAccess(items, at(10, 1))).toBeNull();
  });
});

describe("Maps et Waze à l'approche (lot M4)", () => {
  const start = at(10, 24, 19);
  const end = at(10, 24, 23);
  it("ni à J-6 ni à J-2 ; de la veille 0 h à la fin", () => {
    expect(directionsOpen(start, end, at(10, 18))).toBe(false);
    expect(directionsOpen(start, end, at(10, 22, 23))).toBe(false);
    expect(directionsOpen(start, end, at(10, 23, 0))).toBe(true);
    expect(directionsOpen(start, end, at(10, 24, 22))).toBe(true);
    expect(directionsOpen(start, end, at(10, 24, 23))).toBe(false);
  });
});
