import { describe, expect, it } from "vitest";

import { capturesGesture, rotateHandleBelow } from "./plateGestures";

describe("gestes du cadre de plaque (lot 59c, tour 2)", () => {
  it("les poignées capturent le doigt, le cadre (leur parent) non", () => {
    expect(capturesGesture("move")).toBe(false);
    expect(capturesGesture("resize")).toBe(true);
    expect(capturesGesture("rotate")).toBe(true);
  });

  it("poignée de rotation sous le cadre quand, au-dessus, elle sortirait de la photo", () => {
    // Photo affichée de 300 px de haut : cadre de 36 px ; poignée à 18 + 26 px au-dessus du centre, 11 px de rayon.
    expect(rotateHandleBelow({ x: 0.3, y: 0.62, w: 0.3, h: 0.12 }, 300)).toBe(false);
    expect(rotateHandleBelow({ x: 0.3, y: 0.05, w: 0.3, h: 0.12 }, 300)).toBe(true);
    // Tourné d'un quart de tour, la poignée est sur le côté : elle reste au-dessus.
    expect(rotateHandleBelow({ x: 0.3, y: 0.05, w: 0.3, h: 0.12, angle: 90 }, 300)).toBe(false);
  });
});
