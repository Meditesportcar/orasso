import { describe, expect, it } from "vitest";
import { BIG_TITLE_MIN_SCALE, bigTitleFit } from "./bigTitleFit";

// Lot R1 : « Mon garage » (30 px, ~276 px de large) et « 2 véhicules » (~86 px) sur un téléphone de 393 px (361 utiles).
const base = { size: 30, natural: 276, row: 361, label: 86, gap: 12, narrow: false };

describe("grand titre d'un onglet : la taille suit la largeur réelle", () => {
  it("garde le corps de base tant que la mesure manque (écran caché, onglet préchargé)", () => {
    expect(bigTitleFit({ ...base, row: 0 })).toEqual({ fontSize: 30, stacked: false });
    expect(bigTitleFit({ ...base, natural: 0 })).toEqual({ fontSize: 30, stacked: false });
  });

  it("réduit le titre pour qu'il tienne entier à côté de l'étiquette, jamais au-delà du corps de base", () => {
    const fit = bigTitleFit(base);
    expect(fit.stacked).toBe(false);
    expect(fit.fontSize).toBeLessThan(30);
    expect(fit.fontSize).toBeGreaterThanOrEqual(30 * BIG_TITLE_MIN_SCALE);
    // Il tient : largeur au nouveau corps ≤ place laissée par l'étiquette.
    expect((276 * fit.fontSize) / 30).toBeLessThanOrEqual(361 - 86 - 12);
    expect(bigTitleFit({ ...base, natural: 120 }).fontSize).toBe(30);
  });

  it("sous 70 %, l'étiquette passe dessous et le titre reprend la largeur", () => {
    const fit = bigTitleFit({ ...base, natural: 420 });
    expect(fit.stacked).toBe(true);
    expect((420 * fit.fontSize) / 30).toBeLessThanOrEqual(361);
  });

  it("un titre seul tient toujours, quitte à descendre sous 70 % (il ne se coupe jamais)", () => {
    const fit = bigTitleFit({ ...base, label: 0, natural: 800 });
    expect(fit.stacked).toBe(false);
    expect((800 * fit.fontSize) / 30).toBeLessThanOrEqual(361);
    expect(bigTitleFit({ ...base, narrow: true, natural: 800 }).stacked).toBe(true);
  });
});
