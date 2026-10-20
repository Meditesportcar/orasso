import { describe, expect, it } from "vitest";

import { headings, PATH, PLACE, poseAtProgress } from "./parkingPath";

describe("le chemin de la Supra", () => {
  it("part de l'entrée et finit sur la place, le nez vers le haut (−90°)", () => {
    const start = poseAtProgress(0);
    expect([start.x, start.y]).toEqual(PATH[0]);
    const end = poseAtProgress(1);
    expect([end.x, end.y]).toEqual(PATH[PATH.length - 1]);
    expect(end.heading).toBe(-90);
    expect(end.x).toBeGreaterThan(PLACE.x);
    expect(end.x).toBeLessThan(PLACE.x + PLACE.w);
    expect(end.y).toBeGreaterThan(PLACE.y);
    expect(end.y).toBeLessThan(PLACE.y + PLACE.h);
  });

  it("tourne dans le bon sens : à gauche au premier virage, à droite au second (jamais un tour de plus)", () => {
    expect(headings[0]).toBe(-90);
    expect(headings).toContain(-180);
    // Aucun cap ne s'éloigne de plus de 15° d'une direction cardinale : pas de demi-tour.
    for (const h of headings) expect(h).toBeGreaterThanOrEqual(-195);
    for (const h of headings) expect(h).toBeLessThanOrEqual(-75);
  });

  it("glisse : elle dépasse son cap au virage, puis se redresse", () => {
    const peak = Math.min(...headings);
    expect(peak).toBeLessThan(-180);
    expect(Math.max(...headings)).toBeGreaterThan(-90);
  });
});
