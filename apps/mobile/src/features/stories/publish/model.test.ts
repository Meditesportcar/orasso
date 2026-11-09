import { describe, expect, it } from "vitest";

import { confirmNoPlate, withDetection } from "../../fil/publish/model";
import {
  draftFrameState,
  fillDraft,
  needsFit,
  newStoryDraft,
  plateOf,
  resetDraft,
  stepAfterMedia,
  stepBefore,
  withFrame,
} from "./model";

const land = { uri: "file:///land.jpg", width: 4000, height: 3000 };
const tall = { uri: "file:///cam.jpg", width: 1080, height: 1920 };

describe("brouillon d'une story", () => {
  it("l'appareil (9:16) va droit à la plaque ; une photo de la galerie hors 9:16 passe par « Ajuster »", () => {
    expect(needsFit(land)).toBe(true);
    expect(needsFit(tall)).toBe(false);
    expect(stepAfterMedia(land)).toBe("fit");
    expect(stepAfterMedia(tall)).toBe("plate");
  });

  it("le pas en arrière suit le chemin parcouru, sans jamais quitter l'écran", () => {
    expect(stepBefore("preview", land)).toBe("details");
    expect(stepBefore("details", land)).toBe("plate");
    expect(stepBefore("plate", land)).toBe("fit");
    expect(stepBefore("plate", tall)).toBe("media");
    expect(stepBefore("fit", land)).toBe("media");
    expect(stepBefore("media", land)).toBeNull();
    expect(stepBefore("done", land)).toBeNull();
  });

  it("le cadrage est borné ; remplir puis rétablir", () => {
    const d = newStoryDraft("k", land);
    expect(draftFrameState(d)).toBe("fit");
    const filled = fillDraft(d);
    expect(draftFrameState(filled)).toBe("full");
    // Un glissement absurde reste dans les bornes (la photo ne sort jamais du canevas).
    const moved = withFrame(filled, { ...filled.frame, offsetX: 1e9, offsetY: -1e9 });
    expect(Math.abs(moved.frame.offsetX)).toBeLessThan(2000);
    expect(moved.frame.offsetY).toBe(0);
    expect(draftFrameState(resetDraft(moved))).toBe("fit");
    expect(resetDraft(moved).frame).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
  });

  it("le cadrage ne change pas la décision de plaque : les cadres restent dans la photo d'origine", () => {
    const rect = { x: 0.31, y: 0.62, w: 0.2, h: 0.08 };
    const d = newStoryDraft("k", land);
    const detected = { ...d, plate: withDetection(d.plate, [rect]) };
    expect(detected.plate.rects).toEqual([rect]);
    const zoomed = fillDraft(detected);
    expect(zoomed.plate.rects).toEqual([rect]);
    expect(zoomed.plate.photo).toBe(land);
    expect(plateOf(zoomed)).toEqual({ rects: [rect], noPlate: false, detection: "found" });
    // Même après « Aucune plaque visible » confirmée, puis un nouveau cadrage : la décision reste.
    const none = { ...zoomed, plate: confirmNoPlate(zoomed.plate) };
    expect(withFrame(none, { scale: 2, offsetX: 0, offsetY: 0 }).plate.noPlate).toBe(true);
  });

  it("une copie envoyée plus petite garde l'original pour la détection", () => {
    const small = { uri: "file:///small.jpg", width: 2048, height: 1536 };
    const d = newStoryDraft("k", land, small);
    expect(d.upload).toBe(small);
    expect(d.display).toBe(small);
    expect(d.plate.photo).toBe(land);
    expect(d.plate.detection).toBe("pending");
  });
});

describe("copie d'affichage", () => {
  it("l'original (détection) et la copie d'affichage (écrans) sont deux fichiers ; le cadrage et les cadres restent en fractions", () => {
    const display = { uri: "file:///display.jpg", width: 1280, height: 960 };
    const d = newStoryDraft("k", land, { uri: "file:///up.jpg", width: 2048, height: 1536 }, display);
    expect(d.display).toBe(display);
    expect(d.plate.photo).toBe(land);
    // Même cadrage qu'avec l'original : seul le rapport largeur/hauteur compte.
    expect(d.frame).toEqual(newStoryDraft("k", land).frame);
  });
});
