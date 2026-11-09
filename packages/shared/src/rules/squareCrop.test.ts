import { describe, expect, it } from "vitest";

import { feedCropPlan } from "./feedList";
import {
  centerCrop,
  clampView,
  cropFromView,
  cropPixels,
  focusFromView,
  frameSize,
  MAX_ZOOM,
  pinchZoom,
  previewPlacement,
  stepZoom,
  viewFromCrop,
  viewFromFocus,
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

describe("recadrage à un format (publier au Fil)", () => {
  it("le carré ne change pas : ratio 1 donne les mêmes valeurs qu'avant", () => {
    const view = { zoom: 1.6, tx: 40, ty: -25 };
    expect(clampView(W, H, F, view, 1)).toEqual(clampView(W, H, F, view));
    expect(frameSize(F, 1)).toEqual({ width: F, height: F });
  });
  it("le plus grand côté du cadre vaut `frame` : 4:5 est plus haut que large, paysage plus large que haut", () => {
    expect(frameSize(F, 0.8)).toEqual({ width: 240, height: 300 });
    expect(frameSize(F, 1.25)).toEqual({ width: 300, height: 240 });
  });
  it("un paysage 1600 × 1200 en 4:5 : on ne glisse que de côté ; le centre suit le glissement et reste dans la photo", () => {
    const view = viewFromFocus(W, H, F, { x: 0.5, y: 0.5 }, 0.8);
    expect(view).toEqual({ zoom: 1, tx: 0, ty: 0 });
    // Hauteur : le cadre 4:5 occupe toute la hauteur de la photo, aucun glissement vertical possible.
    expect(clampView(W, H, F, { zoom: 1, tx: 0, ty: 90 }, 0.8).ty).toBe(0);
    const dragged = focusFromView(W, H, F, { zoom: 1, tx: -60, ty: 0 }, 0.8);
    expect(dragged.x).toBeGreaterThan(0.5);
    expect(dragged.y).toBeCloseTo(0.5, 6);
    const far = focusFromView(W, H, F, { zoom: 1, tx: -9999, ty: 0 }, 0.8);
    const plan = feedCropPlan(W, H, "portrait_4_5", far);
    expect(plan.originX + plan.width).toBeLessThanOrEqual(W);
  });
  it("le centre choisi rouvre la même vue, et le cadre calculé suit ce centre", () => {
    for (const ratio of [0.8, 1, 1.25]) {
      const focus = { x: 0.62, y: 0.45 };
      const view = viewFromFocus(W, H, F, focus, ratio);
      const back = focusFromView(W, H, F, view, ratio);
      const plan = feedCropPlan(W, H, ratio, back);
      const cx = (plan.originX + plan.width / 2) / W;
      const cy = (plan.originY + plan.height / 2) / H;
      // Le plan borne le centre pour que le cadre reste dans la photo ; hors bornes il s'en approche au plus près.
      expect(Math.abs(cx - back.x)).toBeLessThan(0.002);
      expect(Math.abs(cy - back.y)).toBeLessThan(0.002);
      expect(plan.width / plan.height).toBeCloseTo(ratio, 2);
    }
  });
  it("portrait 1200 × 1600 en paysage : le cadre glisse de haut en bas seulement", () => {
    const f = focusFromView(1200, 1600, F, { zoom: 1, tx: 50, ty: 80 }, 1.25);
    expect(f.x).toBeCloseTo(0.5, 6);
    expect(f.y).toBeLessThan(0.5);
  });
});
