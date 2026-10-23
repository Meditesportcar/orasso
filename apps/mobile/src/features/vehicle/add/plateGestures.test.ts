import { describe, expect, it } from "vitest";

import {
  angleDelta,
  capturesGesture,
  loupePlace,
  pinchPlateFrame,
  rotateHandleBelow,
  twoFingers,
} from "./plateGestures";

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

describe("deux doigts et loupe (lot M1, maquette 1.4)", () => {
  it("pincer agrandit autour du centre, tourner fait pivoter, le cadre reste dans la photo", () => {
    const r = pinchPlateFrame({ x: 0.3, y: 0.6, w: 0.2, h: 0.1 }, 1.5, 0);
    expect(r.w).toBeCloseTo(0.3);
    expect(r.x + r.w / 2).toBeCloseTo(0.4);
    expect(r.angle).toBeUndefined();
    expect(pinchPlateFrame({ x: 0.3, y: 0.6, w: 0.2, h: 0.1 }, 1, 12).angle).toBe(12);
    expect(pinchPlateFrame({ x: 0.3, y: 0.6, w: 0.2, h: 0.1, angle: 80 }, 1, 40).angle).toBe(90);
    const big = pinchPlateFrame({ x: 0.85, y: 0.9, w: 0.1, h: 0.05 }, 3, 0);
    expect(big.x + big.w).toBeLessThanOrEqual(1);
    expect(big.y + big.h).toBeLessThanOrEqual(1);
  });

  it("mesure les deux doigts, l'angle ne saute pas d'un tour", () => {
    expect(twoFingers({ pageX: 0, pageY: 0 }, { pageX: 30, pageY: 40 }).distance).toBe(50);
    expect(angleDelta(179, -179)).toBeCloseTo(2);
    expect(angleDelta(-179, 179)).toBeCloseTo(-2);
  });

  it("la loupe se pose au-dessus du doigt, en dessous en haut de la photo, jamais dehors", () => {
    expect(loupePlace(150, 250, 340, 340)).toEqual({ left: 94, top: 86 });
    expect(loupePlace(150, 60, 340, 340).top).toBe(112);
    expect(loupePlace(5, 250, 340, 340).left).toBe(6);
    expect(loupePlace(338, 250, 340, 340).left).toBe(222);
  });
});
