// Générateur de jetons : lit docs/design-system/tokens.json (seule source) et écrit
//   src/tokens.ts            objets typés des deux thèmes (web et natif)
//   src/web/tokens.css       variables CSS sous [data-theme="beton"] / [data-theme="sable"]
//   src/web/typography.css   classes des styles de texte (.o-t-<nom>)
// Lancé par `pnpm build`, `pnpm test` (pretest) et `pnpm generate`. Les sorties sont versionnées.
// Le test src/tokens.test.ts vérifie que chaque jeton du JSON est dans les deux sorties.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "../../docs/design-system/tokens.json");
const json = JSON.parse(readFileSync(source, "utf8"));

const THEMES = json.color.themes.map((t) => t.id); // ["beton", "sable"]

const camel = (name) => name.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
const px = (v) => Number.parseFloat(v);
const ms = (v) => Number.parseFloat(v);

// --- Lecture des jetons ------------------------------------------------------------------------

const themed = (tokens) =>
  Object.fromEntries(THEMES.map((t) => [t, Object.fromEntries(tokens.map((tk) => [tk.name, tk.value[t]]))]));

const color = themed(json.color.tokens);
// Dérivé (README Plate et StatusBadge) : sur une plaque graphite, la liste d'attente garde le bleu clair du Béton,
// dans les deux thèmes, car le bleu panneau foncé du Sable ne se lit pas sur le graphite.
for (const t of THEMES)
  color[t]["status-waitlist-on-plate"] = json.color.tokens.find((tk) => tk.name === "status-waitlist").value.beton;
const shadow = themed(json.shadow.tokens);
const groundFxRaw = themed(json["ground-fx"].tokens.filter((tk) => tk.name !== "grain"));
const barFxRaw = themed(json["bar-fx"].tokens);

// Dérivé (usage de surface-raised) : sur une surface sable du site, le champ est #e8e2d3 ; dans une plaque, c'est
// surface-raised (graphite clair). Béton : la valeur de surface-raised dans les deux cas.
color.beton["surface-field"] = color.beton["surface-raised"];
color.sable["surface-field"] = "#e8e2d3";

const spacing = Object.fromEntries(json.spacing.tokens.map((tk) => [tk.name, px(tk.value)]));
const radius = Object.fromEntries(json.radius.tokens.map((tk) => [tk.name, px(tk.value)]));
const geometry = Object.fromEntries(json.geometry.tokens.map((tk) => [tk.name, tk.value]));
const timing = Object.fromEntries(json.timing.tokens.map((tk) => [tk.name, ms(tk.value)]));
const easing = Object.fromEntries(json.easing.tokens.map((tk) => [tk.name, tk.value]));
const families = json.type.families;

const typeStyles = Object.fromEntries(
  json.type.groups.flatMap((g) =>
    g.styles.map((s) => [
      s.name,
      {
        family: g.family,
        fontSize: px(s.fontSize),
        lineHeight: px(s.lineHeight),
        fontWeight: s.fontWeight,
        fontStyle: s.fontStyle ?? "normal",
        letterSpacing: s.letterSpacing ? px(s.letterSpacing) : 0, // en em
        sample: s.sample,
      },
    ]),
  ),
);

// « Le consommateur ajoute font-stretch: 125 % et uppercase » (README du système de design).
const STRETCHED = new Set(["poster-xl", "poster-l", "poster-m", "poster-s", "title", "button", "tab"]);
const UPPERCASE = new Set([...STRETCHED, "label", "meta", "zone", "credit"]);
const NARROW = new Set(["label", "meta", "zone", "credit"]);

// --- Textures SVG (grain, brossage) : les jetons les décrivent en texte, on en extrait les nombres ---

function parseGrain(text) {
  const m = text.match(
    /fractalNoise ([\d.]+) · (\d+) octaves · (blanc|noir) α ([\d.]+) · opacity ([\d.]+) · mix-blend-mode (\w+)/,
  );
  if (!m) throw new Error(`grain illisible : ${text}`);
  const c = m[3] === "blanc" ? 1 : 0;
  return {
    baseFrequency: Number(m[1]),
    numOctaves: Number(m[2]),
    color: [c, c, c],
    alpha: Number(m[4]),
    opacity: Number(m[5]),
    blend: m[6],
  };
}

function parseBrush(text, filterText) {
  const m = text.match(/\(([\d.]+), ([\d.]+), ([\d.]+)\) α ([\d.]+) · opacity ([\d.]+) · mix-blend-mode (\w+)/);
  const f = filterText.match(/baseFrequency="([\d. ]+)" numOctaves=(\d+)/);
  if (!m || !f) throw new Error(`brossage illisible : ${text} / ${filterText}`);
  return {
    baseFrequency: f[1],
    numOctaves: Number(f[2]),
    color: [Number(m[1]), Number(m[2]), Number(m[3])],
    alpha: Number(m[4]),
    opacity: Number(m[5]),
    blend: m[6],
  };
}

const grain = Object.fromEntries(
  THEMES.map((t) => [t, parseGrain(json["ground-fx"].tokens.find((tk) => tk.name === "grain").value[t])]),
);
const barBrush = Object.fromEntries(
  THEMES.map((t) => [t, parseBrush(barFxRaw[t]["bar-brush"], barFxRaw[t]["bar-brush-filter"])]),
);

// --- Variantes « site » des fonds (README Ground : marquage au pas de 200 px, halo resserré) ----
// Dérivées des jetons par substitution de la géométrie ; les couleurs restent celles des jetons.
// Géométrie relevée sur les planches W-Evenement (Béton) et W-Tri (Sable) du canevas.

const SITE_SHAPES = {
  beton: { halo: "ellipse 46% 60% at 94% 0%" },
  sable: {
    halo: "ellipse 64% 80% at 100% -4%",
    reflet: "ellipse 44% 48% at 0% 102%",
    vignette: "ellipse 82% 62% at 50% 26%",
  },
};
function siteFx(theme) {
  const fx = { ...groundFxRaw[theme] };
  const shapes = SITE_SHAPES[theme];
  for (const key of ["halo", "reflet", "vignette"]) {
    if (shapes[key]) fx[key] = fx[key].replace(/ellipse [^,]*?(?=,)/, shapes[key]);
  }
  fx.marquage = fx.marquage.replaceAll("104px", "190px").replace("112px", "200px");
  return fx;
}
const groundFxSite = Object.fromEntries(THEMES.map((t) => [t, siteFx(t)]));

// --- Sortie tokens.ts ----------------------------------------------------------------------------

const keyed = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [camel(k), v]));
const byTheme = (obj) => Object.fromEntries(THEMES.map((t) => [t, keyed(obj[t])]));

const tokens = {
  themes: THEMES,
  color: byTheme(color),
  shadow: byTheme(shadow),
  // Le grain figure ici sous sa forme décrite dans tokens.json ; ses nombres sont dans `grain` (ci-dessous).
  groundFx: byTheme(
    Object.fromEntries(
      THEMES.map((t) => [
        t,
        { ...groundFxRaw[t], grain: json["ground-fx"].tokens.find((tk) => tk.name === "grain").value[t] },
      ]),
    ),
  ),
  groundFxSite: byTheme(groundFxSite),
  grain,
  barFx: byTheme(barFxRaw),
  barBrush,
  spacing: keyed(spacing),
  radius: keyed(radius),
  geometry: keyed(geometry),
  timing: keyed(timing),
  easing: keyed(easing),
  families,
  type: keyed(typeStyles),
};

const ts = `// Fichier généré par scripts/generate-tokens.mjs d'après docs/design-system/tokens.json. Ne pas modifier à la main.
// Jetons du système de design Orasso (v${json.version}, gelé le 15/10/2026), communs au site et à l'appli.

export const THEME_IDS = ${JSON.stringify(THEMES)} as const;
export type ThemeId = (typeof THEME_IDS)[number];

export const tokens = ${JSON.stringify(tokens, null, 2)} as const;

export type Tokens = typeof tokens;
export type ColorTokenName = keyof Tokens["color"]["beton"];
export type TypeStyleName = keyof Tokens["type"];
`;
writeFileSync(resolve(root, "src/tokens.ts"), ts);

// --- Sortie tokens.css ---------------------------------------------------------------------------

const decl = (name, value) => `  --${name}: ${value};`;
const cssBlock = (selector, lines) => `${selector} {\n${lines.join("\n")}\n}\n`;

function themeLines(t) {
  const lines = [];
  for (const [n, v] of Object.entries(color[t])) lines.push(decl(n, v));
  for (const [n, v] of Object.entries(shadow[t])) lines.push(decl(n, v));
  for (const [n, v] of Object.entries(groundFxRaw[t])) lines.push(decl(`fx-${n}`, v));
  for (const [n, v] of Object.entries(groundFxSite[t])) lines.push(decl(`fx-${n}-site`, v));
  lines.push(decl("bar-gradient", barFxRaw[t]["bar-gradient"]));
  const g = grain[t];
  lines.push(decl("grain-opacity", g.opacity), decl("grain-blend", g.blend));
  const b = barBrush[t];
  lines.push(decl("bar-brush-opacity", b.opacity), decl("bar-brush-blend", b.blend));
  // Épaisseur et nuance du filet de barre : 1 px à 45 % sous l'en-tête Béton, 2 px plein en Sable (README).
  lines.push(decl("bar-edge-header", t === "beton" ? "1px" : "2px"));
  return lines;
}

const rootLines = [];
for (const [n, v] of Object.entries(families)) rootLines.push(decl(`font-${n}`, v));
for (const [n, v] of Object.entries(spacing)) rootLines.push(decl(n, `${v}px`));
for (const [n, v] of Object.entries(radius)) rootLines.push(decl(n, `${v}px`));
for (const [n, v] of Object.entries(geometry)) rootLines.push(decl(n, v));
for (const [n, v] of Object.entries(timing)) rootLines.push(decl(`timing-${n}`, `${v}ms`));
for (const [n, v] of Object.entries(easing)) rootLines.push(decl(`ease-${n}`, v));
for (const [n, s] of Object.entries(typeStyles)) {
  rootLines.push(decl(`type-${n}-size`, `${s.fontSize}px`));
  rootLines.push(decl(`type-${n}-line`, `${s.lineHeight}px`));
  rootLines.push(decl(`type-${n}-weight`, s.fontWeight));
  rootLines.push(decl(`type-${n}-style`, s.fontStyle));
  rootLines.push(decl(`type-${n}-spacing`, `${s.letterSpacing}em`));
}

const css = [
  "/* Fichier généré par scripts/generate-tokens.mjs d'après docs/design-system/tokens.json. Ne pas modifier à la main. */",
  cssBlock(":root", rootLines),
  ...THEMES.map((t) => cssBlock(`[data-theme="${t}"]`, themeLines(t))),
].join("\n");
writeFileSync(resolve(root, "src/web/tokens.css"), css);

// --- Sortie typography.css -----------------------------------------------------------------------

const typeCss = Object.keys(typeStyles)
  .map((n) => {
    const fam = typeStyles[n].family;
    const lines = [
      `  font-family: var(--font-${fam});`,
      `  font-size: var(--type-${n}-size);`,
      `  line-height: var(--type-${n}-line);`,
      `  font-weight: var(--type-${n}-weight);`,
      `  font-style: var(--type-${n}-style);`,
      `  letter-spacing: var(--type-${n}-spacing);`,
    ];
    if (STRETCHED.has(n)) lines.push("  font-stretch: var(--stretch-wide);");
    if (NARROW.has(n)) lines.push("  font-stretch: var(--stretch-narrow);");
    if (UPPERCASE.has(n)) lines.push("  text-transform: uppercase;");
    if (n === "number") lines.push("  font-variant-numeric: tabular-nums;");
    return `.o-t-${n} {\n${lines.join("\n")}\n}\n`;
  })
  .join("\n");
writeFileSync(
  resolve(root, "src/web/typography.css"),
  `/* Fichier généré par scripts/generate-tokens.mjs. Styles de texte du système de design (classes .o-t-<nom>).
   font-stretch et text-transform sont ajoutés ici, côté consommateur, comme le demande le README du système. */\n${typeCss}`,
);

console.log("Jetons générés : src/tokens.ts, src/web/tokens.css, src/web/typography.css");
