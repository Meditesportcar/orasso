import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BIG_TITLE_MIN_SCALE,
  type BigTitleLayout,
  type BigTitleMeasure,
  bigTitleFit,
  bigTitleLayout,
  initialBigTitleLayout,
} from "./bigTitleFit";

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

// Tour 2 (relectures Opus et Codex) : la recette web passe par `WebTitle`, pas par le `BigTitle` natif. Le dépôt n'a
// aucun moteur de rendu React Native pour les tests (ni react-test-renderer, déprécié avec React 19, ni le préréglage
// Jest de React Native, ni DOM simulé) ; en ajouter un pour ce seul composant serait une dépendance sans apport net.
// D'où : toute la logique d'état du composant est dans `bigTitleLayout` (le réducteur qu'il utilise) et `bigTitleFit`,
// testés ici sur le scénario du bug, et le fichier du composant est contrôlé (pas d'`adjustsFontSizeToFit`, les trois
// mesures branchées sur le réducteur). Le coordinateur vérifie le rendu sur le Xiaomi.
describe("BigTitle natif : préchargement caché, puis changement de largeur (scénario « Mon garage »)", () => {
  const replay = (events: BigTitleMeasure[]) => events.reduce(bigTitleLayout, initialBigTitleLayout);
  const fitOf = (l: BigTitleLayout, label = true) =>
    bigTitleFit({ size: 30, natural: l.natural, row: l.row, label: label ? l.label : 0, gap: 12, narrow: false });

  it("onglet préchargé caché (largeurs nulles) : rien n'est figé, le corps de base reste", () => {
    const hidden = replay([
      { kind: "natural", width: 276 },
      { kind: "row", width: 0 },
      { kind: "label", width: 0 },
    ]);
    expect(hidden).toEqual({ natural: 276, row: 0, label: 0 });
    expect(fitOf(hidden)).toEqual({ fontSize: 30, stacked: false });
  });

  it("l'onglet s'affiche : la taille se calcule sur la vraie largeur, le titre tient entier", () => {
    const shown = replay([
      { kind: "natural", width: 276 },
      { kind: "row", width: 0 },
      { kind: "row", width: 361 },
      { kind: "label", width: 86 },
    ]);
    const fit = fitOf(shown);
    expect((276 * fit.fontSize) / 30).toBeLessThanOrEqual(361 - 86 - 12);
    expect(fit.fontSize).toBeGreaterThanOrEqual(30 * BIG_TITLE_MIN_SCALE);
  });

  it("changement de largeur (autre casquette, rotation) : recalculé ; caché de nouveau : la dernière largeur visible reste", () => {
    let l = replay([
      { kind: "natural", width: 276 },
      { kind: "row", width: 361 },
      { kind: "label", width: 86 },
    ]);
    const narrowFit = fitOf(l);
    l = bigTitleLayout(l, { kind: "row", width: 700 });
    expect(fitOf(l)).toEqual({ fontSize: 30, stacked: false });
    const before = l;
    l = bigTitleLayout(l, { kind: "row", width: 0 });
    l = bigTitleLayout(l, { kind: "row", width: Number.NaN });
    expect(l).toBe(before);
    l = bigTitleLayout(l, { kind: "row", width: 361 });
    expect(fitOf(l)).toEqual(narrowFit);
    // Une mesure identique ne relance pas de rendu (même état).
    expect(bigTitleLayout(l, { kind: "row", width: 361.04 })).toBe(l);
  });

  it("le composant natif : plus d'adjustsFontSizeToFit, une ligne, les trois mesures sur le réducteur", () => {
    const source = readFileSync(resolve(import.meta.dirname, "BigTitle.tsx"), "utf8");
    expect(source).not.toMatch(/adjustsFontSizeToFit\s*[={]/);
    expect(source).toContain("useReducer(bigTitleLayout, initialBigTitleLayout)");
    for (const kind of ["row", "natural", "label"]) expect(source).toContain(`onLayout={on("${kind}")}`);
    expect(source.match(/numberOfLines=\{1\}/g)).toHaveLength(2);
  });
});
