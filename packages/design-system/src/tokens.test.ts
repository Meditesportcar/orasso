import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { THEME_IDS, tokens } from "./tokens";

const root = resolve(import.meta.dirname, "..");
const json = JSON.parse(readFileSync(resolve(root, "../../docs/design-system/tokens.json"), "utf8"));
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

describe("jetons : tous ceux de tokens.json sont dans tokens.ts et tokens.css", () => {
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
    expect(tokens.barBrush.sable).toMatchObject({ alpha: 1, opacity: 0.38, blend: "multiply" });
    expect(tokens.barBrush.sable.color).toEqual([0.08, 0.07, 0.05]);
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
