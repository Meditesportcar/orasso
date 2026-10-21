import { fromWallTime, type MyApplication } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import { countdownOf, inNearWindow, nearAccessOf } from "./near-access";

const at = (month: number, day: number, hour = 10) => fromWallTime({ year: 2026, month, day, hour, minute: 0 });
const app = (over: Partial<MyApplication["event"]>, status: MyApplication["status"] = "accepted") =>
  ({
    id: "a",
    status,
    checkedInAt: null,
    event: {
      id: "e",
      slug: "e",
      title: "Nocturne de Canet",
      format: "night",
      startsAt: at(10, 24, 19).toISOString(),
      endsAt: at(10, 24, 23).toISOString(),
      city: "Canet",
      status: "published",
      ...over,
    },
  }) as MyApplication;

describe("accès flottant du site", () => {
  it("de J-7 (dès 0 h) au lendemain de la fin", () => {
    const start = at(10, 24, 19);
    const end = at(10, 24, 23);
    expect(inNearWindow(start, end, at(10, 16, 23))).toBe(false); // J-8
    expect(inNearWindow(start, end, at(10, 17, 0))).toBe(true); // J-7 à 0 h
    expect(inNearWindow(start, end, at(10, 25, 12))).toBe(true); // J+1
    expect(inNearWindow(start, end, at(10, 26, 0))).toBe(false); // J+2
  });

  it("compte à rebours : J-6, Demain, Aujourd'hui, J+1", () => {
    const start = at(10, 24, 19);
    expect(countdownOf(start, at(10, 18, 12))).toBe("J-6");
    expect(countdownOf(start, at(10, 23, 12))).toBe("Demain");
    expect(countdownOf(start, at(10, 24, 12))).toBe("Aujourd'hui");
    expect(countdownOf(start, at(10, 25, 12))).toBe("J+1");
  });

  it("seulement une place retenue, pas encore entrée, d'un événement publié ; la plus proche d'abord", () => {
    const now = at(10, 20);
    expect(nearAccessOf([app({}, "pending")], now)).toBeNull();
    expect(nearAccessOf([{ ...app({}), checkedInAt: now.toISOString() }], now)).toBeNull();
    expect(nearAccessOf([app({ status: "cancelled" })], now)).toBeNull();
    const later = app({
      title: "Plus tard",
      startsAt: at(10, 26, 19).toISOString(),
      endsAt: at(10, 26, 23).toISOString(),
    });
    expect(nearAccessOf([later, app({})], now)).toEqual({
      day: "24",
      month: "oct.",
      title: "Nocturne de Canet",
      countdown: "J-4",
    });
    expect(nearAccessOf([app({})], at(10, 5))).toBeNull();
  });
});
