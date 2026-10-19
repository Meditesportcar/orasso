import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadMergedTokens, mergeTokens } from "../scripts/merge-tokens.mjs";
import { THEME_IDS, tokens, tokensV2Overlay } from "./tokens";

const root = resolve(import.meta.dirname, "..");
// Base gelée (docs/design-system/tokens.json) + surcouche DA v2 (tokens.v2.json, lot 38) : les valeurs attendues sont
// celles de la fusion, exactement comme le générateur les voit.
const { json, base, overlay, changes } = loadMergedTokens();
const css = readFileSync(resolve(root, "src/web/tokens.css"), "utf8");
const typography = readFileSync(resolve(root, "src/web/typography.css"), "utf8");

const camel = (name: string) => name.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());

/** Corps du bloc CSS d'un sélecteur (`:root` ou `[data-theme="beton"]`). */
function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, `bloc ${selector} introuvable dans tokens.css`).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf("\n}\n", start));
}

type Tok = { name: string; value: unknown };
const themedGroups: Array<[string, keyof typeof tokens, (name: string) => string]> = [
  ["color", "color", (n) => n],
  ["shadow", "shadow", (n) => n],
  ["ground-fx", "groundFx", (n) => `fx-${n}`],
  ["bar-fx", "barFx", (n) => n],
];

describe("jetons : tous ceux de tokens.json (+ surcouche v2) sont dans tokens.ts et tokens.css", () => {
  it("couleurs, ombres, fonds et barres : chaque thème, TS et CSS", () => {
    for (const [group, tsKey, varName] of themedGroups) {
      const list: Tok[] = json[group].tokens;
      for (const theme of THEME_IDS) {
        const themeCss = block(`[data-theme="${theme}"]`);
        for (const token of list) {
          const expected = (token.value as Record<string, string>)[theme];
          const ts = (tokens[tsKey] as Record<string, Record<string, string>>)[theme] as Record<string, string>;
          expect(ts[camel(token.name)], `${group}/${token.name} (${theme}) dans tokens.ts`).toBe(expected);
          // Les textures (grain, brossage) sont décrites en texte : leurs nombres sont testés plus bas.
          if (["grain", "bar-brush", "bar-brush-filter"].includes(token.name)) continue;
          expect(themeCss, `${group}/${token.name} (${theme}) dans tokens.css`).toContain(
            `--${varName(token.name)}: ${expected};`,
          );
        }
      }
    }
  });

  it("espacements, rayons, géométrie : TS et CSS", () => {
    const rootCss = block(":root");
    for (const token of json.spacing.tokens as Array<{ name: string; value: string }>) {
      expect(tokens.spacing[camel(token.name) as keyof typeof tokens.spacing]).toBe(Number.parseFloat(token.value));
      expect(rootCss).toContain(`--${token.name}: ${token.value};`);
    }
    for (const token of json.radius.tokens as Array<{ name: string; value: string }>) {
      expect(tokens.radius[camel(token.name) as keyof typeof tokens.radius]).toBe(Number.parseFloat(token.value));
      expect(rootCss).toContain(`--${token.name}: ${token.value};`);
    }
    for (const token of json.geometry.tokens as Array<{ name: string; value: string }>) {
      expect(tokens.geometry[camel(token.name) as keyof typeof tokens.geometry]).toBe(token.value);
      expect(rootCss).toContain(`--${token.name}: ${token.value};`);
    }
  });

  it("durées et courbes : TS et CSS", () => {
    const rootCss = block(":root");
    for (const token of json.timing.tokens as Array<{ name: string; value: string }>) {
      expect(tokens.timing[camel(token.name) as keyof typeof tokens.timing]).toBe(Number.parseFloat(token.value));
      expect(rootCss).toContain(`--timing-${token.name}: ${token.value};`);
    }
    for (const token of json.easing.tokens as Array<{ name: string; value: string }>) {
      expect(tokens.easing[camel(token.name) as keyof typeof tokens.easing]).toBe(token.value);
      expect(rootCss).toContain(`--ease-${token.name}: ${token.value};`);
    }
  });

  it("familles et styles de texte : TS, CSS et classes", () => {
    const rootCss = block(":root");
    for (const [name, value] of Object.entries(json.type.families as Record<string, string>)) {
      expect(tokens.families[name as keyof typeof tokens.families]).toBe(value);
      expect(rootCss).toContain(`--font-${name}: ${value};`);
    }
    for (const group of json.type.groups as Array<{ family: string; styles: Array<Record<string, unknown>> }>) {
      for (const style of group.styles) {
        const name = style.name as string;
        const ts = tokens.type[camel(name) as keyof typeof tokens.type];
        expect(ts.family).toBe(group.family);
        expect(ts.fontSize).toBe(Number.parseFloat(style.fontSize as string));
        expect(ts.lineHeight).toBe(Number.parseFloat(style.lineHeight as string));
        expect(ts.fontWeight).toBe(style.fontWeight);
        expect(rootCss).toContain(`--type-${name}-size: ${style.fontSize};`);
        expect(typography).toContain(`.o-t-${name} {`);
      }
    }
  });

  it("textures : le grain et le brossage ont leurs nombres dans tokens.ts", () => {
    expect(tokens.grain.beton).toMatchObject({
      baseFrequency: 0.9,
      numOctaves: 2,
      alpha: 0.6,
      opacity: 0.28,
      blend: "overlay",
    });
    expect(tokens.grain.beton.color).toEqual([1, 1, 1]);
    expect(tokens.grain.sable).toMatchObject({ opacity: 0.32, blend: "multiply" });
    expect(tokens.grain.sable.color).toEqual([0, 0, 0]);
    expect(tokens.barBrush.beton).toMatchObject({
      baseFrequency: "0.012 0.9",
      numOctaves: 3,
      alpha: 0.5,
      opacity: 0.6,
      blend: "screen",
    });
    expect(tokens.barBrush.beton.color).toEqual([0.95, 0.92, 0.85]);
    // Surcouche v2 : la barre Sable est nuit, brossée comme en Béton.
    expect(tokens.barBrush.sable).toEqual(tokens.barBrush.beton);
    for (const theme of THEME_IDS) {
      expect(block(`[data-theme="${theme}"]`)).toContain(`--grain-opacity: ${tokens.grain[theme].opacity};`);
      expect(block(`[data-theme="${theme}"]`)).toContain(`--bar-brush-blend: ${tokens.barBrush[theme].blend};`);
    }
  });

  it("les deux thèmes ont exactement les mêmes jetons", () => {
    const beton = Object.keys(tokens.color.beton).sort();
    const sable = Object.keys(tokens.color.sable).sort();
    expect(sable).toEqual(beton);
  });
});

describe("surcouche DA v2 (tokens.v2.json, lot 38)", () => {
  const groups: Record<string, [keyof typeof tokens, (name: string) => string]> = {
    color: ["color", (n) => n],
    shadow: ["shadow", (n) => n],
    "ground-fx": ["groundFx", (n) => `fx-${n}`],
    "bar-fx": ["barFx", (n) => n],
  };
  const textures = ["grain", "bar-brush", "bar-brush-filter"];

  it("chaque valeur remplacée est appliquée dans tokens.ts et tokens.css", () => {
    let checked = 0;
    for (const [group, [tsKey, varName]] of Object.entries(groups)) {
      for (const entry of (overlay[group]?.tokens ?? []) as Array<{ name: string; value: Record<string, string> }>) {
        for (const [theme, value] of Object.entries(entry.value)) {
          const ts = (tokens[tsKey] as Record<string, Record<string, string>>)[theme] as Record<string, string>;
          expect(ts[camel(entry.name)], `${group}/${entry.name} (${theme}) dans tokens.ts`).toBe(value);
          if (!textures.includes(entry.name)) {
            expect(block(`[data-theme="${theme}"]`), `${group}/${entry.name} (${theme}) dans tokens.css`).toContain(
              `--${varName(entry.name)}: ${value};`,
            );
          }
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(20);
  });

  it("les jetons ajoutés (carte, encres de tampon) sont dans les deux thèmes", () => {
    const added = overlay.added as {
      color: Array<{ name: string; value: Record<string, string> }>;
      "stamp-ink": Array<{ department: string; value: Record<string, string> }>;
    };
    for (const theme of THEME_IDS) {
      const themeCss = block(`[data-theme="${theme}"]`);
      const color = tokens.color[theme] as Record<string, string>;
      for (const entry of added.color) {
        expect(color[camel(entry.name)]).toBe(entry.value[theme]);
        expect(themeCss).toContain(`--${entry.name}: ${entry.value[theme]};`);
      }
      for (const entry of added["stamp-ink"]) {
        expect(color[camel(`stamp-ink-${entry.department}`)]).toBe(entry.value[theme]);
        expect(themeCss).toContain(`--stamp-ink-${entry.department}: ${entry.value[theme]};`);
      }
      // Les départements sans encre propre prennent `win`.
      expect(color.stampInkDefault).toBe(color.win);
    }
    expect(Object.keys(tokens.color.beton)).toEqual(expect.arrayContaining(["mapLand", "mapSea", "stampInk66"]));
  });

  it("Sable : halo et reflet éteints (fond uni), barre nuit", () => {
    expect(tokens.groundFx.sable.halo).toBe("none");
    expect(tokens.groundFx.sable.reflet).toBe("none");
    expect(tokens.color.sable.bar).toBe(tokens.color.beton.night);
    expect(tokens.color.sable.inkMuted).toBe("#4f493f");
  });

  it("plate-field : graphite clair sous l'encre crème d'une plaque, dans les deux thèmes", () => {
    for (const theme of THEME_IDS) {
      expect(tokens.color[theme].plateField).toBe("#363941");
      expect(block(`[data-theme="${theme}"]`)).toContain("--plate-field: #363941;");
    }
    // surface-raised est devenu clair en Sable : il ne peut plus porter plate-ink.
    expect(tokens.color.sable.surfaceRaised).not.toBe(tokens.color.sable.plateField);
  });

  it("number-narrow : le style number à 62,5 % de largeur", () => {
    const { fontStretch, ...narrow } = tokens.type.numberNarrow;
    const { fontStretch: base, ...number } = tokens.type.number;
    expect(fontStretch).toBe("62.5%");
    expect(base).toBeNull();
    expect(narrow).toEqual(number);
    expect(typography).toMatch(/\.o-t-number-narrow \{[^}]*font-stretch: 62\.5%;/);
  });

  it("les deux thèmes ont les mêmes clés dans chaque groupe", () => {
    for (const key of ["color", "shadow", "groundFx", "groundFxSite", "barFx"] as const) {
      const group = tokens[key] as Record<string, Record<string, unknown>>;
      expect(Object.keys(group.sable ?? {}).sort(), key).toEqual(Object.keys(group.beton ?? {}).sort());
    }
  });

  it("tokensV2Overlay liste chaque écart avec sa raison, et la base n'est pas modifiée", () => {
    expect(tokensV2Overlay.length).toBe(changes.length);
    for (const change of tokensV2Overlay) expect(change.why, change.name).toBeTruthy();
    const copy = structuredClone(base);
    mergeTokens(base, overlay);
    expect(base).toEqual(copy);
    expect(json.color.tokens.length).toBeGreaterThan(base.color.tokens.length);
  });
});
