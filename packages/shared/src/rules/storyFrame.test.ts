import { describe, expect, it } from "vitest";

import {
  clampFrame,
  coverScale,
  fitDefault,
  frameToCanvas,
  mapRect,
  mapRects,
  rectIntersectsCanvas,
  STORY_H,
  STORY_W,
} from "./storyFrame";

const land = { width: 4000, height: 3000 };
const close = (a: number | undefined, b: number) => expect(a).toBeCloseTo(b, 6);

describe("cadrage d'une story", () => {
  it("par défaut : la photo tient entière, centrée", () => {
    const f = fitDefault(land.width, land.height);
    expect(f).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
    const box = frameToCanvas(f, land.width, land.height);
    close(box.width, STORY_W);
    close(box.height, 810);
    close(box.left, 0);
    close(box.top, (STORY_H - 810) / 2);
  });

  it("une photo 9:16 remplit le canevas", () => {
    const box = frameToCanvas(fitDefault(1080, 1920), 1080, 1920);
    expect(box).toEqual({ left: 0, top: 0, width: STORY_W, height: STORY_H });
  });

  it("plein cadre : l'échelle de couverture remplit la hauteur", () => {
    const s = coverScale(land.width, land.height);
    const box = frameToCanvas({ scale: s, offsetX: 0, offsetY: 0 }, land.width, land.height);
    close(box.height, STORY_H);
    expect(box.width).toBeGreaterThan(STORY_W);
    expect(coverScale(1080, 1920)).toBe(1);
  });

  it("clampFrame ramène dans les bornes et neutralise les valeurs non finies", () => {
    expect(clampFrame({ scale: 0.2, offsetX: 99999, offsetY: -99999 })).toEqual({
      scale: 1,
      offsetX: 2000,
      offsetY: -2000,
    });
    expect(clampFrame({ scale: 9, offsetX: 0, offsetY: 0 }).scale).toBe(4);
    expect(clampFrame({ scale: Number.NaN, offsetX: Number.NaN, offsetY: Number.NaN })).toEqual({
      scale: 1,
      offsetX: 0,
      offsetY: 0,
    });
  });
});

describe("mapRect : rectangles de plaque vers le rendu", () => {
  const fit = fitDefault(land.width, land.height);
  const top = (STORY_H - 810) / 2;

  it("aux quatre coins de la photo (cadrage par défaut)", () => {
    const tl = mapRect({ x: 0, y: 0, w: 0.1, h: 0.1 }, fit, land);
    close(tl.x, 0);
    close(tl.y, top / STORY_H);
    close(tl.w, 0.1);
    close(tl.h, 81 / STORY_H);
    const br = mapRect({ x: 0.9, y: 0.9, w: 0.1, h: 0.1 }, fit, land);
    close(br.x, 0.9);
    close(br.x + br.w, 1);
    close(br.y + br.h, (top + 810) / STORY_H);
    const tr = mapRect({ x: 0.9, y: 0, w: 0.1, h: 0.1 }, fit, land);
    close(tr.x + tr.w, 1);
    close(tr.y, top / STORY_H);
    const bl = mapRect({ x: 0, y: 0.9, w: 0.1, h: 0.1 }, fit, land);
    close(bl.x, 0);
    close(bl.y + bl.h, (top + 810) / STORY_H);
  });

  it("le centre de la photo reste le centre du canevas, avec ou sans zoom", () => {
    for (const scale of [1, 2, 3.5]) {
      const r = mapRect({ x: 0.45, y: 0.45, w: 0.1, h: 0.1 }, { scale, offsetX: 0, offsetY: 0 }, land);
      close(r.x + r.w / 2, 0.5);
      close(r.y + r.h / 2, 0.5);
    }
  });

  it("en zoom x2 : le rectangle double de taille ; un décalage le déplace du même nombre de pixels", () => {
    const r1 = mapRect({ x: 0.2, y: 0.4, w: 0.1, h: 0.05 }, fit, land);
    const r2 = mapRect({ x: 0.2, y: 0.4, w: 0.1, h: 0.05 }, { scale: 2, offsetX: 0, offsetY: 0 }, land);
    close(r2.w, r1.w * 2);
    close(r2.h, r1.h * 2);
    const moved = mapRect({ x: 0.2, y: 0.4, w: 0.1, h: 0.05 }, { scale: 2, offsetX: 108, offsetY: -192 }, land);
    close(moved.x - r2.x, 0.1);
    close(moved.y - r2.y, -0.1);
  });

  it("l'angle est conservé (échelle uniforme)", () => {
    const f = { scale: 2, offsetX: 5, offsetY: 5 };
    expect(mapRect({ x: 0.1, y: 0.1, w: 0.1, h: 0.05, angle: 12 }, f, land).angle).toBe(12);
    expect(mapRect({ x: 0.1, y: 0.1, w: 0.1, h: 0.05 }, fit, land).angle).toBeUndefined();
  });

  it("mapRects écarte ce qui sort du canevas, garde ce qui le touche", () => {
    const zoomed = { scale: 4, offsetX: 0, offsetY: 0 };
    const out = mapRects(
      [
        { x: 0.02, y: 0.02, w: 0.05, h: 0.05 },
        { x: 0.475, y: 0.475, w: 0.05, h: 0.05 },
      ],
      zoomed,
      land,
    );
    expect(out).toHaveLength(1);
    close((out[0]?.x ?? 0) + (out[0]?.w ?? 0) / 2, 0.5);
  });

  it("rectIntersectsCanvas", () => {
    expect(rectIntersectsCanvas({ x: 0.4, y: 0.4, w: 0.1, h: 0.1 })).toBe(true);
    expect(rectIntersectsCanvas({ x: 1.2, y: 0.4, w: 0.1, h: 0.1 })).toBe(false);
    expect(rectIntersectsCanvas({ x: -0.3, y: 0.4, w: 0.1, h: 0.1 })).toBe(false);
    expect(rectIntersectsCanvas({ x: 0.95, y: 0.4, w: 0.2, h: 0.1 })).toBe(true);
  });
});
