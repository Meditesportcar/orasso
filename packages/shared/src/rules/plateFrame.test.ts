import { describe, expect, it } from "vitest";

import {
  DEFAULT_PLATE_FRAME,
  dragRotatePlateFrame,
  movePlateFrame,
  nextPlateFrame,
  PLATE_FRAME_MIN_H,
  PLATE_FRAME_MIN_W,
  resizeOrientedPlateFrame,
  resizePlateFrame,
  rotatePlateFrame,
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

describe("cadre orientable (lot 59c)", () => {
  const r = { x: 0.25, y: 0.25, w: 0.5, h: 0.1 };

  it("angle borné, arrondi, remis droit près de l'horizontale", () => {
    expect(rotatePlateFrame(r, 12.34)).toEqual({ ...r, angle: 12.3 });
    expect(rotatePlateFrame(r, -140)).toEqual({ ...r, angle: -90 });
    expect(rotatePlateFrame({ ...r, angle: 20 }, 1.5)).toEqual(r);
  });

  it("la poignée tourne le cadre autour de son centre", () => {
    // Photo 400 × 200 : cadre de 200 × 20 px, poignée à 10 + 26 = 36 px au-dessus du centre.
    // Doigt déplacé de 36 px vers la droite et 36 vers le bas : poignée à droite du centre, quart de tour.
    expect(dragRotatePlateFrame(r, 36, 36, 200).angle).toBe(90);
    // Vers la gauche, à 45° : −45°.
    expect(dragRotatePlateFrame(r, -36, 0, 200).angle).toBe(-45);
    // Geste minuscule : rien ne bouge.
    expect(dragRotatePlateFrame(r, 0, 0.5, 200)).toEqual(r);
  });

  it("le coin agrandit le long des axes du cadre tourné, coin opposé fixe", () => {
    const tilted = { ...r, angle: 90 };
    // Tourné d'un quart de tour, la largeur du cadre suit l'axe vertical de l'écran.
    const next = resizeOrientedPlateFrame(tilted, 0, 40, 400, 200);
    expect(next.w).toBeCloseTo(0.6, 4);
    expect(next.h).toBeCloseTo(0.1, 4);
    expect(next.angle).toBe(90);
    // Centre déplacé de 20 px vers le bas (moitié de l'agrandissement).
    expect((next.y + next.h / 2) * 200).toBeCloseTo((r.y + r.h / 2) * 200 + 20, 1);
    // Sans angle : comme avant.
    expect(resizeOrientedPlateFrame(r, 40, 20, 400, 200)).toEqual(resizePlateFrame(r, 0.1, 0.1));
    // Jamais sous la taille minimale.
    expect(resizeOrientedPlateFrame(tilted, 0, -1000, 400, 200).w).toBe(PLATE_FRAME_MIN_W);
  });
});

describe("poignée de rotation sous le cadre (lot 59c, tour 2)", () => {
  const r = { x: 0.25, y: 0.02, w: 0.5, h: 0.1 };
  it("même angle que la poignée du haut, geste inversé", () => {
    // Poignée à 36 px sous le centre : tirée de 36 px vers la gauche et 36 vers le haut, elle passe à gauche du centre.
    expect(dragRotatePlateFrame(r, -36, -36, 200, 26, true).angle).toBe(90);
    expect(dragRotatePlateFrame(r, 36, 0, 200, 26, true).angle).toBe(-45);
    expect(dragRotatePlateFrame(r, 0, 0, 200, 26, true)).toEqual(r);
  });
});
