import { describe, expect, it } from "vitest";

import {
  DEFAULT_PLATE_FRAME,
  movePlateFrame,
  nextPlateFrame,
  PLATE_FRAME_MIN_H,
  PLATE_FRAME_MIN_W,
  resizePlateFrame,
} from "./plateFrame";

describe("cadre de plaque à la main (lot 51)", () => {
  it("se déplace sans sortir de la photo", () => {
    expect(movePlateFrame(DEFAULT_PLATE_FRAME, 0.1, -0.1)).toEqual({ x: 0.45, y: 0.52, w: 0.3, h: 0.12 });
    expect(movePlateFrame(DEFAULT_PLATE_FRAME, 2, 2)).toEqual({ x: 0.7, y: 0.88, w: 0.3, h: 0.12 });
    expect(movePlateFrame(DEFAULT_PLATE_FRAME, -2, -2)).toEqual({ x: 0, y: 0, w: 0.3, h: 0.12 });
  });

  it("s'agrandit par le coin, jamais au-delà de l'image ni sous la taille minimale", () => {
    expect(resizePlateFrame(DEFAULT_PLATE_FRAME, 0.1, 0.05)).toEqual({ x: 0.35, y: 0.62, w: 0.4, h: 0.17 });
    expect(resizePlateFrame(DEFAULT_PLATE_FRAME, 5, 5)).toEqual({ x: 0.35, y: 0.62, w: 0.65, h: 0.38 });
    expect(resizePlateFrame(DEFAULT_PLATE_FRAME, -5, -5)).toEqual({
      x: 0.35,
      y: 0.62,
      w: PLATE_FRAME_MIN_W,
      h: PLATE_FRAME_MIN_H,
    });
  });

  it("un deuxième cadre ne recouvre pas le premier", () => {
    expect(nextPlateFrame([])).toEqual(DEFAULT_PLATE_FRAME);
    expect(nextPlateFrame([DEFAULT_PLATE_FRAME])).not.toEqual(DEFAULT_PLATE_FRAME);
  });
});
