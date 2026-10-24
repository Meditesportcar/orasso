import { describe, expect, it } from "vitest";
import { plateOnSharePhoto, SHARE_SIZES, shareFormats, sharePhotoZone, shareStyles } from "./garage";

// Lot R3a (retour 7 de Damien) : la vérification de plaque de l'affiche ne porte que sur la photo. La mise en page est
// la même pour les trois styles (seule l'ambiance change) : la zone ne dépend que du format.
const rectAt = (cx: number, cy: number) => ({ x: cx - 0.1, y: cy - 0.02, w: 0.2, h: 0.04 });

describe("zone de la photo de l'affiche", () => {
  for (const format of shareFormats) {
    const zone = sharePhotoZone(format);
    const H = SHARE_SIZES[format].height;
    it.each(shareStyles)(`${format}, style %s : une plaque sur la photo compte`, () => {
      expect(plateOnSharePhoto(format, rectAt(0.3, (zone.top + zone.bottom) / 2))).toBe(true);
    });
    it.each(shareStyles)(`${format}, style %s : les textes d'Orasso (nom, chiffres, pied) sont ignorés`, () => {
      for (const y of [0.62, 0.72, 0.8, 0.9]) expect(plateOnSharePhoto(format, rectAt(0.35, y)), `y ${y}`).toBe(false);
    });
    it(`${format} : le sceau, à droite en haut, est ignoré ; à gauche à la même hauteur, la photo compte`, () => {
      const y = (zone.seal.top + Math.min(zone.seal.bottom, zone.bottom)) / 2;
      if (y > zone.top) {
        expect(plateOnSharePhoto(format, rectAt(0.85, y))).toBe(false);
        expect(plateOnSharePhoto(format, rectAt(0.25, y))).toBe(true);
      }
    });
    it(`${format} : la zone est dans l'affiche et la photo nette fait au moins un tiers de sa hauteur`, () => {
      expect(zone.top).toBeGreaterThanOrEqual(0);
      expect(zone.bottom).toBeLessThanOrEqual(1);
      expect((zone.bottom - zone.top) * H).toBeGreaterThan(H / 3);
    });
  }
});
