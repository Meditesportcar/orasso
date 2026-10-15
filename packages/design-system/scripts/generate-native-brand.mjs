// Extrait la géométrie du logotype, du monogramme et de l'indicateur de chargement des fichiers de marque
// (src/web/assets/*.svg, copies de identite/) et écrit src/native/brandArt.ts, que les composants Brand natifs
// dessinent avec react-native-svg. Les SVG portent un manifeste C2PA de plusieurs ko : on ne garde que les formes.
// Lancé par `pnpm --filter @orasso/design-system run generate`. Sortie versionnée.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => readFileSync(resolve(root, "src/web/assets", name), "utf8").replace(/<metadata>[\s\S]*?<\/metadata>/, "");

function must(match, what) {
  if (!match) throw new Error(`Fichier de marque : ${what} introuvable (le SVG a changé ?)`);
  return match;
}

const logoDark = read("logo-fond-sombre.svg");
const logoLight = read("logo-fond-clair.svg");
const monoDark = read("monogramme-fond-sombre.svg");
const monoLight = read("monogramme-fond-clair.svg");
const loaderDark = read("chargement-fond-sombre.svg");

const fillOf = (svg, re, what) => must(svg.match(re), what)[1];

// Les lettres : <g fill="…"> puis un <path transform="translate(X 0)" d="…"> par lettre.
const body = must(logoDark.match(/<\/defs><g fill="[^"]+">([\s\S]*?)<\/g><mask id="[^"]*cwin"/), "groupe des lettres")[1];
const letters = [...body.matchAll(/<path transform="translate\(([-\d.]+) 0\)" d="([^"]+)"/g)].map((m) => ({
  dx: Number(m[1]),
  d: m[2],
}));
if (letters.length !== 6) throw new Error(`Logotype : 6 lettres attendues, ${letters.length} trouvées`);

const windowD = must(monoDark.match(/<mask id="[^"]*win"[\s\S]*?<path transform="[^"]*" d="([^"]+)"/), "vitres")[1];
const carRects = [...must(monoDark.match(/fill="#FFC629">([\s\S]*?)<\/g>/), "voiture")[1].matchAll(
  /<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)" rx="([\d.]+)"/g,
)].map((m) => ({ x: Number(m[1]), y: Number(m[2]), width: Number(m[3]), height: Number(m[4]), rx: Number(m[5]) }));
if (carRects.length !== 2) throw new Error("Voiture : 2 rectangles attendus");

const carFill = fillOf(monoDark, /fill="(#[0-9A-Fa-f]{6})">\s*<rect x="82/, "couleur de la voiture");
const inkDark = fillOf(monoDark, /<path fill="(#[0-9A-Fa-f]{6})"/, "encre fond sombre");
const inkLight = fillOf(monoLight, /<path fill="(#[0-9A-Fa-f]{6})"/, "encre fond clair");
const logoInkDark = fillOf(logoDark, /<g fill="(#[0-9A-Fa-f]{6})">/, "encre du logo (sombre)");
const logoInkLight = fillOf(logoLight, /<g fill="(#[0-9A-Fa-f]{6})">/, "encre du logo (clair)");
const oD = must(monoDark.match(/<path fill="#[0-9A-Fa-f]{6}" transform="translate\(([-\d.]+) 0\)" d="([^"]+)"/), "O");
const dx = Number(oD[1]);
const oPath = oD[2];
// Le trou de l'O (la zone que la voiture traverse) : sous-tracé de la forme du chargement.
const hole = must(loaderDark.match(/<clipPath id="[^"]*"><path transform="[^"]*" d="([^"]+)"/), "ouverture de l'O")[1];
const viewBox = must(monoDark.match(/viewBox="([^"]+)"/), "viewBox du monogramme")[1];
const logoViewBox = must(logoDark.match(/viewBox="([^"]+)"/), "viewBox du logotype")[1];
const keyframes = must(loaderDark.match(/@keyframes ldk\{([\s\S]*?\})\}/), "images clés du chargement")[1];
const frames = [...keyframes.matchAll(/(\d+)%\{([^}]*)\}/g)].map((m) => {
  const x = must(m[2].match(/translateX\(([-\d.]+)(?:px)?\)/), "translation d'une image clé")[1];
  const curve = m[2].match(/animation-timing-function:([^;]+)/)?.[1] ?? "none";
  return { at: Number(m[1]), x: Number(x), curve: curve.replace(/^cubic-bezier\(/, "").replace(/\)$/, "") };
});

// Logo animé d'ouverture (identite/anime) : voiture (acar), O (ao), rideau des lettres (aw).
const intro = readFileSync(resolve(root, "../../identite/anime/orasso-logo-anime-fond-sombre.svg"), "utf8");
function introFrames(name) {
  const body = must(intro.match(new RegExp(`@keyframes ${name}\\{([\\s\\S]*?\\})\\}`)), `images clés ${name}`)[1];
  const frames = [];
  for (const m of body.matchAll(/([\d.%,\s]+)\{([^}]*)\}/g)) {
    const props = m[2];
    const curve = props.match(/animation-timing-function:([^;]+)/)?.[1]?.replace(/^cubic-bezier\(/, "").replace(/\)$/, "") ?? "none";
    const x = props.match(/translateX\(([-\d.]+)(?:px)?\)/)?.[1];
    const scale = props.match(/scale\(([-\d.]+)\)/)?.[1];
    const opacity = props.match(/opacity:([-\d.]+)/)?.[1];
    for (const at of m[1].split(",")) {
      const percent = Number.parseFloat(at);
      if (!Number.isNaN(percent)) {
        frames.push({
          at: percent,
          ...(x !== undefined && { x: Number(x) }),
          ...(scale !== undefined && { scale: Number(scale) }),
          ...(opacity !== undefined && { opacity: Number(opacity) }),
          curve,
        });
      }
    }
  }
  // Le 100 % est écrit deux fois dans le fichier : on garde la dernière image clé de chaque position.
  const byAt = new Map(frames.map((f) => [f.at, f]));
  return [...byAt.values()].sort((a, b) => a.at - b.at);
}
const introAnimation = { car: introFrames("acar"), o: introFrames("ao"), wipe: introFrames("aw") };

const json = (value) => JSON.stringify(value, null, 2);
const out = `// Fichier généré par scripts/generate-native-brand.mjs d'après src/web/assets/*.svg (kit d'identité). Ne pas modifier.
// Géométrie du logotype, du monogramme et de l'indicateur de chargement, pour react-native-svg.
// Les couleurs sont celles des fichiers de marque (le kit), pas des jetons de thème : une version par fond.

export const brandArt = ${json({
  viewBox: viewBox.split(/\s+/).map(Number),
  logoViewBox: logoViewBox.split(/\s+/).map(Number),
  /** Décalage horizontal de l'O du monogramme dans son viewBox. */
  oOffset: dx,
  oPath,
  /** Ouverture de l'O : la voiture du chargement n'est visible que dans cette forme. */
  hole,
  letters,
  /** Épaisseur du contour qui sépare une lettre de la précédente (masque du logotype). */
  letterGap: 10,
  windowPath: windowD,
  carRects,
  /** La voiture est penchée de 10° autour de ce point. */
  carSkew: { angle: -10, cx: 75.5, cy: 50 },
  car: carFill,
  ink: { dark: inkDark, light: inkLight },
  logoInk: { dark: logoInkDark, light: logoInkLight },
  /** Chargement : translation de la voiture (unités du viewBox) et courbe jusqu'à l'image clé suivante. */
  loaderKeyframes: frames,
  /** Logo animé d'ouverture (1,6 s) : images clés de la voiture, du O (échelle, opacité) et du rideau des lettres. */
  intro: introAnimation,
})} as const;
`;
writeFileSync(resolve(root, "src/native/brandArt.ts"), out);
console.log(`brandArt.ts : ${letters.length} lettres, ${frames.length} images clés`);
