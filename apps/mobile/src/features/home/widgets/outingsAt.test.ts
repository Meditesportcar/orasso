import type { HomeMyOutings, HomeOuting } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import { outingsAt } from "./outingsAt";

const HOUR = 3_600_000;
const NOW = new Date("2026-11-10T10:00:00Z");
const at = (h: number) => new Date(NOW.getTime() + h * HOUR).toISOString();
const outing = (key: string, from: number, to: number): HomeOuting => ({
  key,
  kind: "application",
  id: key,
  slug: key,
  title: key,
  startsAt: at(from),
  endsAt: at(to),
  city: null,
  status: "accepted",
  waitlistRank: null,
  checkedIn: false,
  ongoing: false,
  vehicles: [],
  days: [],
});

describe("Mes sorties à l'heure de l'appareil", () => {
  it("une sortie finie disparaît, « En cours » se recalcule, le total suit", () => {
    const data: HomeMyOutings = {
      items: [outing("finie", -5, -1), outing("en-cours", -2, 3), outing("a-venir", 4, 8)],
      total: 5,
    };
    const r = outingsAt(data, NOW);
    expect(r?.items.map((o) => [o.key, o.ongoing])).toEqual([
      ["en-cours", true],
      ["a-venir", false],
    ]);
    expect(r?.total).toBe(4);
  });
  it("plus rien : null", () => {
    expect(outingsAt({ items: [outing("finie", -5, -1)], total: 1 }, NOW)).toBeNull();
  });
  it("une sortie qui finit pile maintenant est finie", () => {
    expect(outingsAt({ items: [outing("pile", -5, 0)], total: 1 }, NOW)).toBeNull();
  });
});
