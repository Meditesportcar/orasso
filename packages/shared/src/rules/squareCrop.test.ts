import { describe, expect, it } from "vitest";

import {
  centerCrop,
  clampView,
  cropFromView,
  cropPixels,
  MAX_ZOOM,
  pinchZoom,
  previewPlacement,
  stepZoom,
  viewFromCrop,
} from "./squareCrop";

const W = 1600;
const H = 1200;
const F = 300;

describe("recadrage carré", () => {
  it("zoom 1 au centre : le carré centré, de la hauteur de la photo", () => {
    const crop = cropFromView(W, H, F, { zoom: 1, tx: 0, ty: 0 });
    expect(crop).toEqual(centerCrop(W, H));
    expect(crop.size * W).toBeCloseTo(1200);
    expect(crop.x * W).toBeCloseTo(200);
    expect(crop.y).toBeCloseTo(0);
  });

  it("le cadre ne sort jamais de la photo", () => {
    const v = clampView(W, H, F, { zoom: 1, tx: 9999, ty: -9999 });
    expect(v.ty).toBe(0);
    expect(v.tx).toBeCloseTo((W * (F / H) - F) / 2);
    const crop = cropFromView(W, H, F, { zoom: 1, tx: 9999, ty: 0 });
    expect(crop.x).toBeCloseTo(0);
    const right = cropFromView(W, H, F, { zoom: 1, tx: -9999, ty: 0 });
    expect(right.x * W + right.size * W).toBeCloseTo(W);
  });

  it("zoomer resserre le carré ; la vue se retrouve depuis le carré", () => {
    const view = { zoom: 2, tx: 40, ty: -30 };
    const crop = cropFromView(W, H, F, view);
    expect(crop.size * W).toBeCloseTo(600);
    const back = viewFromCrop(W, H, F, crop);
    expect(back.zoom).toBeCloseTo(2);
    expect(back.tx).toBeCloseTo(40);
    expect(back.ty).toBeCloseTo(-30);
  });

  it("donne des pixels entiers dans la photo, et la place de l'aperçu", () => {
    const px = cropPixels(W, H, { x: 0.9, y: 0.9, size: 0.5 });
    expect(px.width).toBe(800);
    expect(px.originX + px.width).toBeLessThanOrEqual(W);
    expect(px.originY + px.height).toBeLessThanOrEqual(H);
    const p = previewPlacement(W, H, centerCrop(W, H));
    expect(p.height).toBeCloseTo(1);
    expect(p.left).toBeCloseTo(-200 / 1200);
  });

  it("pincement et boutons restent entre ×1 et ×2,5", () => {
    expect(pinchZoom(1, 100, 400)).toBe(MAX_ZOOM);
    expect(pinchZoom(2, 200, 100)).toBe(1);
    expect(stepZoom(1, 1)).toBe(1.25);
    expect(stepZoom(1, -1)).toBe(1);
    expect(stepZoom(2.4, 1)).toBe(MAX_ZOOM);
  });
});
