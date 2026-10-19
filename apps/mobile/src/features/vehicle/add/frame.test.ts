import { describe, expect, it } from "vitest";

import { DEFAULT_FRAME, MIN_H, MIN_W, moveRect, nextFrame, resizeRect } from "./frame";

describe("cadre de plaque à la main", () => {
  it("se déplace sans sortir de la photo", () => {
    expect(moveRect(DEFAULT_FRAME, 0.1, -0.1)).toEqual({ x: 0.45, y: 0.52, w: 0.3, h: 0.12 });
    expect(moveRect(DEFAULT_FRAME, 2, 2)).toEqual({ x: 0.7, y: 0.88, w: 0.3, h: 0.12 });
    expect(moveRect(DEFAULT_FRAME, -2, -2)).toEqual({ x: 0, y: 0, w: 0.3, h: 0.12 });
  });

  it("s'agrandit par le coin, jamais au-delà de l'image ni sous la taille minimale", () => {
    expect(resizeRect(DEFAULT_FRAME, 0.1, 0.05)).toEqual({ x: 0.35, y: 0.62, w: 0.4, h: 0.17 });
    expect(resizeRect(DEFAULT_FRAME, 5, 5)).toEqual({ x: 0.35, y: 0.62, w: 0.65, h: 0.38 });
    expect(resizeRect(DEFAULT_FRAME, -5, -5)).toEqual({ x: 0.35, y: 0.62, w: MIN_W, h: MIN_H });
  });

  it("un deuxième cadre ne recouvre pas le premier", () => {
    expect(nextFrame([])).toEqual(DEFAULT_FRAME);
    expect(nextFrame([DEFAULT_FRAME])).not.toEqual(DEFAULT_FRAME);
  });
});
