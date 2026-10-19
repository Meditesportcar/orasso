import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { tokens } from "../tokens";
import { withAlpha } from "./color";
import { archivoFamilies, archivoFamily } from "./fontFamily";
import { linearLine, parseColor, parseGradient, radialGeometry, repeatingBands } from "./gradientCss";
import { encodeAlphaPng, fractalNoiseTile, textureTile, toBase64 } from "./noise";
import { textStyle, textStyles } from "./textStyles";

const dir = import.meta.dirname;

describe("composants natifs : aucune valeur en dur", () => {
  // Les composants et le mouvement : pas de couleur ni de durée écrite à la main (tout vient des jetons).
  // Hors contrôle : les fichiers de données ou de calcul (jetons, géométrie de marque, lecture de dégradés, bruit).
  // Lot 39 : le dossier du O vivant (olive/) est contrôlé aussi, sauf la géométrie pure (path.ts).
  const files = [...readdirSync(dir), ...readdirSync(resolve(dir, "olive")).map((f) => `olive/${f}`)].filter(
    (f) =>
      /\.(tsx|ts)$/.test(f) && !/(\.test|brandArt|gradientCss|noise|fontFamily|textStyles|color|olive\/path)\./.test(f),
  );
  it("pas de couleur hexadécimale, rgb(a)/hsl ni de durée dans les composants", () => {
    expect(files).toContain("olive/OLoader.tsx");
    const offenders: string[] = [];
    for (const file of files) {
      readFileSync(resolve(dir, file), "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (/^\s*(\*|\/\*|\/\/)/.test(line)) return;
          const code = line.replace(/url\(#[^)]*\)/g, "").replace(/\/\/.*$/, "");
          if (/(^|[^&\w/])#[0-9a-fA-F]{3,8}\b/.test(code)) offenders.push(`${file}:${i + 1} couleur hexadécimale`);
          if (/\b(rgba?|hsla?|oklch)\(/.test(code)) offenders.push(`${file}:${i + 1} couleur fonctionnelle`);
          if (/\b\d+(\.\d+)?\s?(ms|s)\b/.test(code.replace(/\/\/.*$/, ""))) offenders.push(`${file}:${i + 1} durée`);
          if (/\b(duration|delay)\s*[:=]\s*[1-9]/.test(code)) offenders.push(`${file}:${i + 1} durée numérique`);
          if (/set(Timeout|Interval)\([^)]*,\s*\d/.test(code)) offenders.push(`${file}:${i + 1} minuterie numérique`);
        });
    }
    expect(offenders).toEqual([]);
  });
});

describe("le O vivant (lot 39) : variantes, alias, branchements", () => {
  // Pas de rendu React Native sous vitest (pas de react-native-web ni de Reanimated en Node dans ce paquet) : le rendu de
  // chaque variante est vérifié dans le navigateur (/_ds de l'appli, e2e/lot39.spec.ts). Ici : la structure.
  const read = (file: string) => readFileSync(resolve(dir, file), "utf8");
  it("les huit variantes existent et sont exportées par le paquet", () => {
    const index = read("olive/index.ts");
    for (const name of [
      "OpeningBattle",
      "OLoader",
      "useOliveRefresh",
      "PullToRefresh",
      "SendProgress",
      "SendBurst",
      "EmptyState",
      "StampDrop",
      "CenterTabO",
    ]) {
      expect(index, name).toMatch(new RegExp(`\\b${name}\\b`));
    }
    expect(read("index.ts")).toContain('export * from "./olive";');
  });
  it("un seul useFrameCallback par variante, et seulement via l'horloge commune", () => {
    const olive = readdirSync(resolve(dir, "olive")).filter((f) => /\.tsx$/.test(f));
    for (const file of olive) {
      const count = (read(`olive/${file}`).match(/useFrameCallback\(/g) ?? []).length;
      expect(count, file).toBeLessThanOrEqual(file === "shared.tsx" ? 1 : 0);
    }
  });
  it("Loader et OpeningScreen restent des alias dépréciés jusqu'au lot 58", () => {
    expect(read("Loader.tsx")).toMatch(/@deprecated[^\n]*lot 58[\s\S]*export const Loader = OLoader;/);
    expect(read("Opening.tsx")).toMatch(/@deprecated[^\n]*lot 58[^\n]*\nexport const OpeningScreen = OpeningBattle;/);
  });
  it("bouton en chargement : O vivant compact, voiture plus grande et à l'encre du bouton", () => {
    expect(read("Button.tsx")).toContain("<OLoader size={24} ink={ink} label={null} />");
    const loader = read("olive/OLoader.tsx");
    expect(loader).toContain("const compact = size <= COMPACT_MAX;");
    expect(loader).toContain("(compact ? CAR_UNITS_COMPACT : CAR_UNITS) * k");
    expect(loader).toContain("color={compact ? ink : t.color.accent}");
    // À 24 px, la voiture fait au moins 7 px (64 unités sur une scène de 200).
    const shared = read("olive/shared.tsx");
    const units = Number(shared.match(/CAR_UNITS_COMPACT = (\d+)/)?.[1]);
    const stage = Number(shared.match(/STAGE_COMPACT = (\d+)/)?.[1]);
    expect((24 * units) / stage).toBeGreaterThanOrEqual(7);
  });
  it("l'envoi : O vivant + anneau (décision v39), l'ouverture se passe d'un toucher", () => {
    expect(read("olive/Send.tsx")).toContain("<OLoader size={size} progress={p} done={complete}");
    const opening = read("olive/OpeningBattle.tsx");
    expect(opening).toContain('accessibilityHint="Passer"');
  });
  it("la barre d'onglets porte le O vivant, la feuille fait taire le fond", () => {
    expect(read("TabBar.tsx")).toContain("<CenterTabO active={active}");
    expect(read("Motion.tsx")).toContain("useGroundQuiet(visible)");
    expect(read("Ground.tsx")).toContain('variant === "battle"');
  });
});

describe("polices statiques", () => {
  it("chaque style de texte a sa famille, trois largeurs", () => {
    expect(archivoFamily("wide", 900, true)).toBe("Archivo-Expanded-BlackItalic");
    expect(archivoFamily("wide", 900, false)).toBe("Archivo-Expanded-Black");
    expect(archivoFamily("narrow", 700, false)).toBe("Archivo-Narrow-Bold");
    expect(archivoFamily("normal", 400, false)).toBe("Archivo-Regular");
    expect(archivoFamily("normal", 600, false)).toBe("Archivo-SemiBold");
    expect(archivoFamily("normal", 800, false)).toBe("Archivo-ExtraBold");
    for (const style of Object.values(textStyles)) {
      expect(archivoFamilies).toContain(style.fontFamily);
    }
  });
  it("capitales sur les titres et étiquettes, interlettrage en px", () => {
    expect(textStyle("posterXl").textTransform).toBe("uppercase");
    expect(textStyle("label").textTransform).toBe("uppercase");
    expect(textStyle("body").textTransform).toBeUndefined();
    expect(textStyle("posterXl").letterSpacing).toBeCloseTo(-0.01 * 38);
    expect(textStyle("number").fontVariant).toEqual(["tabular-nums"]);
  });
});

describe("dégradés des jetons", () => {
  it("lit tous les dégradés de groundFx, groundFxSite et barFx", () => {
    const all = [
      ...Object.values(tokens.groundFx).flatMap((fx) => [fx.halo, fx.reflet, fx.faisceau, fx.marquage, fx.vignette]),
      ...Object.values(tokens.groundFxSite).flatMap((fx) => [
        fx.halo,
        fx.reflet,
        fx.faisceau,
        fx.marquage,
        fx.vignette,
      ]),
      ...Object.values(tokens.barFx).map((fx) => fx.barGradient),
    ];
    for (const css of all) expect(() => parseGradient(css)).not.toThrow();
  });
  it("halo Béton : ellipse 70 % × 50 % en (95 %, −10 %), trois arrêts dont un transparent teinté", () => {
    const g = parseGradient(tokens.groundFx.beton.halo);
    expect(g).toMatchObject({ kind: "radial", rx: 0.7, ry: 0.5, cx: 0.95, cy: -0.1 });
    if (g.kind !== "radial") throw new Error();
    expect(g.stops.map((s) => s.at)).toEqual([0, 0.4, 0.68]);
    // « transparent » prend la teinte du voisin : pas de liseré gris.
    expect(g.stops[2]?.color).toMatchObject({ r: 233, g: 184, b: 36, a: 0 });
  });
  it("faisceau : bords francs (double position) ; marquage : bandes de 8 px tous les 112 px", () => {
    const beam = parseGradient(tokens.groundFx.beton.faisceau);
    if (beam.kind !== "linear") throw new Error();
    expect(beam.angle).toBe(170);
    expect(beam.stops.map((s) => s.at)).toEqual([0, 0.36, 0.36, 0.56, 0.56]);
    const lines = parseGradient(tokens.groundFx.beton.marquage);
    if (lines.kind !== "linear") throw new Error();
    expect(lines.repeating).toBe(true);
    const bands = repeatingBands(lines, 390, 800);
    expect(bands.length).toBeGreaterThan(5);
    const first = bands[0];
    expect(first?.points).toHaveLength(4);
  });
  it("ellipse : cercle de rayon rx écrasé par gradientTransform (le DOM SVG n'a pas rx/ry)", () => {
    const g = parseGradient(tokens.groundFx.beton.halo);
    if (g.kind !== "radial") throw new Error();
    const geo = radialGeometry(g, 400, 800);
    expect(geo.cx).toBeCloseTo(380);
    expect(geo.cy).toBeCloseTo(-80);
    expect(geo.r).toBeCloseTo(280);
    expect(geo.transform).toBe(`translate(380 -80) scale(1 ${400 / 280}) translate(-380 80)`);
  });
  it("ligne d'un dégradé à 180° : verticale sur toute la hauteur", () => {
    const line = linearLine(180, 100, 200);
    expect(line.x1).toBeCloseTo(50);
    expect(line.y1).toBeCloseTo(0);
    expect(line.y2).toBeCloseTo(200);
  });
  it("couleurs et alpha", () => {
    expect(parseColor("#131417cc")).toMatchObject({ r: 19, g: 20, b: 23 });
    expect(parseColor("rgba(233,184,36,0.45)").a).toBe(0.45);
    expect(withAlpha("#e9b824", 0.5)).toBe("rgba(233,184,36,0.5)");
  });
});

describe("textures (feTurbulence recalculé)", () => {
  it("bruit déterministe, dans [0, 1], et qui se raccorde d'un bord à l'autre de la tuile", () => {
    const options = { baseFrequencyX: 0.9, baseFrequencyY: 0.9, numOctaves: 2 };
    const a = fractalNoiseTile(32, 32, options);
    const b = fractalNoiseTile(32, 32, options);
    expect([...a]).toEqual([...b]);
    expect(Math.min(...a)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...a)).toBeLessThanOrEqual(1);
    const mean = a.reduce((n, v) => n + v, 0) / a.length;
    expect(mean).toBeGreaterThan(0.35);
    expect(mean).toBeLessThan(0.65);
  });
  it("PNG valide : signature, IHDR aux bonnes dimensions, base64 sans erreur", () => {
    const png = encodeAlphaPng(8, 4, [1, 1, 1], new Float32Array(32).fill(0.5), 1);
    expect([...png.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(new DataView(png.buffer).getUint32(16)).toBe(8);
    expect(new DataView(png.buffer).getUint32(20)).toBe(4);
    expect(toBase64(new Uint8Array([77, 97, 110]))).toBe("TWFu");
    expect(toBase64(new Uint8Array([77, 97]))).toBe("TWE=");
  });
  it("tuile de grain et de brossage des jetons", () => {
    const grain = textureTile(tokens.grain.beton, 16, 16);
    expect(grain.uri.startsWith("data:image/png;base64,")).toBe(true);
    const brush = textureTile(tokens.barBrush.sable, 32, 8);
    expect(brush.width).toBe(32);
  });
});
