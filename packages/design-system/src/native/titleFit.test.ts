import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { capitalsFor } from "./textStyles";
import { FIT_TITLE_MIN_SCALE, fitTitle, titleWords } from "./titleFit";

// Lot R3a (retour 2 de Damien) : « AJOUTER DES PHOTOS » en poster-m (17 px) mesurait 261 px sur le Xiaomi (échelle de
// police 1,0). Largeurs des mots au corps de base, d'après cette mesure ; l'échelle de police du système les multiplie.
const CALL = { words: [110, 52, 90], space: 4.5, size: 17 };
/** Place de la case d'appel : écran moins 16 px de chaque côté, 2 px de bord et 16 px de marge intérieure. */
const callRoom = (screen: number) => screen - 32 - 4 - 32;

const widthOf = (line: number[], words: number[], space: number, k: number) =>
  line.reduce((w, i, n) => w + (words[i] ?? 0) * k + (n ? space * k : 0), 0);

describe("titre ajusté : chaque ligne tient, aucun mot ne manque", () => {
  for (const scale of [1, 1.3, 2]) {
    for (const screen of [320, 360, 390, 430]) {
      it(`échelle de police ${scale}, écran de ${screen} px`, () => {
        const words = CALL.words.map((w) => w * scale);
        const space = CALL.space * scale;
        const room = callRoom(screen);
        const fit = fitTitle({ words, space, room, size: CALL.size });
        // Tous les mots, dans l'ordre, une fois chacun.
        expect(fit.lines.flat()).toEqual([0, 1, 2]);
        // Chaque ligne tient au corps choisi.
        for (const line of fit.lines) {
          expect(widthOf(line, words, space, fit.fontSize / CALL.size)).toBeLessThanOrEqual(room);
        }
        expect(fit.fontSize).toBeLessThanOrEqual(CALL.size);
        // Deux lignes au plus tant que 70 % suffit.
        expect(fit.lines.length).toBeLessThanOrEqual(2);
        expect(fit.fontSize).toBeGreaterThanOrEqual(Math.floor(CALL.size * FIT_TITLE_MIN_SCALE * 10) / 10);
      });
    }
  }

  it("le cas du Xiaomi (390 px, échelle 1) : une ligne au corps de base", () => {
    expect(fitTitle({ ...CALL, room: callRoom(390) })).toEqual({ fontSize: 17, lines: [[0, 1, 2]] });
  });

  it("échelle 1,3 à 390 px : deux lignes au corps de base plutôt qu'un titre rétréci", () => {
    const words = CALL.words.map((w) => w * 1.3);
    const fit = fitTitle({ words, space: CALL.space * 1.3, room: callRoom(390), size: 17 });
    expect(fit.fontSize).toBe(17);
    expect(fit.lines).toEqual([[0, 1], [2]]);
  });

  it("un mot plus large que la place : une ligne de plus et un corps réduit, le mot reste entier", () => {
    const fit = fitTitle({ words: [400, 50], space: 5, room: 200, size: 24, maxLines: 1 });
    expect(fit.lines).toEqual([[0], [1]]);
    expect(400 * (fit.fontSize / 24)).toBeLessThanOrEqual(200);
  });

  it("mesures inconnues (écran caché) : corps de base, une ligne", () => {
    expect(fitTitle({ words: [0, 50], space: 5, room: 300, size: 24 })).toEqual({ fontSize: 24, lines: [[0, 1]] });
    expect(fitTitle({ words: [40, 50], space: 5, room: 0, size: 24 })).toEqual({ fontSize: 24, lines: [[0, 1]] });
  });

  it("les mots d'un titre : séparés par les espaces", () => {
    expect(titleWords("Ajouter des  photos")).toEqual(["Ajouter", "des", "photos"]);
  });
});

describe("capitales écrites avant la mesure sur Android", () => {
  it("Android : les styles en capitales reçoivent leur texte en capitales françaises", () => {
    expect(capitalsFor("posterM", "Ajouter des photos", "android")).toBe("AJOUTER DES PHOTOS");
    expect(capitalsFor("posterL", "Ses photos · étape", "android")).toBe("SES PHOTOS · ÉTAPE");
    expect(capitalsFor("body", "Ajouter des photos", "android")).toBe("Ajouter des photos");
  });
  it("iOS et web : rien ne change (le style s'en charge, les recettes lisent le texte d'origine)", () => {
    expect(capitalsFor("posterM", "Ajouter des photos", "ios")).toBe("Ajouter des photos");
    expect(capitalsFor("posterM", "Ajouter des photos", "web")).toBe("Ajouter des photos");
  });
  it("le composant FitTitle : chaque ligne d'une ligne, mesures hors champ, pas d'adjustsFontSizeToFit", () => {
    const source = readFileSync(resolve(import.meta.dirname, "FitTitle.tsx"), "utf8");
    expect(source).not.toMatch(/adjustsFontSizeToFit\s*[={]/);
    expect(source).toContain("fitTitle({");
    expect(source.match(/numberOfLines=\{1\}/g)?.length).toBe(3);
  });
});
