import { describe, expect, it } from "vitest";
import {
  plateOnSharePoster,
  SHARE_PHOTO_FADE,
  SHARE_PHOTO_READABLE,
  SHARE_SIZES,
  type ShareZone,
  shareFormats,
  sharePhotoTop,
  sharePhotoVisibility,
  shareReadableBand,
  shareStyles,
} from "./garage";

// Lot R3a, tour 2 (corrections Codex et Opus) : la vérification de plaque de l'affiche porte sur toute la partie lisible
// de la photo ; seules les lectures presque entièrement dans les zones réelles des textes d'Orasso sont écartées.
const GROW = 0.15;
/** Le cadre que la détection propose pour un texte lu exactement sur `z` (agrandi de 15 %). */
const grown = (z: ShareZone): ShareZone => ({
  x: z.x - (z.w * GROW) / 2,
  y: z.y - (z.h * GROW) / 2,
  w: z.w * (1 + GROW),
  h: z.h * (1 + GROW),
});
const plateAt = (cx: number, cy: number): ShareZone => ({ x: cx - 0.1, y: cy - 0.02, w: 0.2, h: 0.04 });

describe("partie lisible de la photo", () => {
  for (const format of shareFormats) {
    for (const style of shareStyles) {
      it(`${format}, ${style} : la bande lisible suit les fondus et le voile (frontières au seuil de 0,2)`, () => {
        const { width: W, height: H } = SHARE_SIZES[format];
        const band = shareReadableBand(format, style);
        expect(band.top).toBeGreaterThanOrEqual(0);
        expect(band.bottom).toBeLessThanOrEqual(H);
        // Juste à l'intérieur : lisible ; juste à l'extérieur : non.
        expect(sharePhotoVisibility(format, style, band.top)).toBeGreaterThanOrEqual(SHARE_PHOTO_READABLE);
        expect(sharePhotoVisibility(format, style, band.bottom)).toBeGreaterThanOrEqual(SHARE_PHOTO_READABLE);
        if (band.top > 0) expect(sharePhotoVisibility(format, style, band.top - 1)).toBeLessThan(SHARE_PHOTO_READABLE);
        expect(sharePhotoVisibility(format, style, band.bottom + 1)).toBeLessThan(SHARE_PHOTO_READABLE);
        // Les fondus de 7 % et 78 % ne sont plus des frontières : la photo y est encore lisible.
        const y = sharePhotoTop(format);
        if (y + SHARE_PHOTO_FADE.inEnd * W > 0) {
          expect(sharePhotoVisibility(format, style, y + SHARE_PHOTO_FADE.inEnd * W)).toBe(1);
        }
        expect(band.bottom).toBeGreaterThan(y + SHARE_PHOTO_FADE.outStart * W - 200);
      });
    }
  }
});

describe("plaque sur l'affiche", () => {
  for (const format of shareFormats) {
    for (const style of shareStyles) {
      for (const certified of [true, false]) {
        it(`${format}, ${style}, ${certified ? "certifié" : "sans certification"} : sur la photo, signalée`, () => {
          const { height: H } = SHARE_SIZES[format];
          const band = shareReadableBand(format, style);
          const middle = (band.top + band.bottom) / 2 / H;
          // Le sceau n'existe que certifié ; même dans ce cas, une plaque qu'il ne couvre qu'en partie compte.
          const seal: ShareZone[] = certified ? [{ x: 0.72, y: band.top / H, w: 0.24, h: 0.13 }] : [];
          expect(plateOnSharePoster(format, style, plateAt(0.3, middle), seal)).toBe(true);
          expect(plateOnSharePoster(format, style, plateAt(0.84, band.top / H + 0.04), [])).toBe(true);
          if (certified) {
            // Plaque à cheval sur le bord du sceau : signalée.
            expect(plateOnSharePoster(format, style, { x: 0.62, y: band.top / H + 0.02, w: 0.2, h: 0.03 }, seal)).toBe(
              true,
            );
          }
          // Haut et bas de la partie lisible : une plaque qui la chevauche compte.
          expect(plateOnSharePoster(format, style, plateAt(0.5, band.top / H + 0.005), [])).toBe(true);
          expect(plateOnSharePoster(format, style, plateAt(0.5, band.bottom / H - 0.005), [])).toBe(true);
        });
      }
      it(`${format}, ${style} : un texte d'Orasso lu comme une plaque est écarté par sa zone réelle`, () => {
        const band = shareReadableBand(format, style);
        const H = SHARE_SIZES[format].height;
        // Un texte posé au bas de la photo (étiquettes, nom) : la lecture qui le couvre est écartée.
        const text: ShareZone = { x: 0.06, y: band.bottom / H - 0.03, w: 0.5, h: 0.04 };
        expect(plateOnSharePoster(format, style, grown(text), [text])).toBe(false);
        // Une vraie plaque à côté du texte, sur la photo : signalée.
        expect(plateOnSharePoster(format, style, plateAt(0.75, band.bottom / H - 0.05), [text])).toBe(true);
      });
      it(`${format}, ${style} : hors de la partie lisible (prolongement flouté, pied), rien`, () => {
        expect(plateOnSharePoster(format, style, plateAt(0.5, 0.97), [])).toBe(false);
      });
    }
  }

  it("cas de Codex : plaque au haut de la story (fondu d'entrée), signalée", () => {
    for (const style of shareStyles) {
      expect(plateOnSharePoster("story", style, { x: 0.2, y: 0.067, w: 0.2, h: 0.012 }, [])).toBe(true);
    }
  });

  it("plaque basse centrée entre 0,48 et 0,52 de la story : signalée dans les trois styles", () => {
    for (const style of shareStyles) {
      expect(plateOnSharePoster("story", style, { x: 0.35, y: 0.48, w: 0.3, h: 0.04 }, [])).toBe(true);
    }
  });
});
