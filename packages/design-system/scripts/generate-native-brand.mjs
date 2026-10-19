// Extrait la géométrie du logotype, du monogramme et de l'indicateur de chargement des fichiers de marque
// (src/web/assets/*.svg, copies de identite/) et écrit src/native/brandArt.ts, que les composants Brand natifs
// dessinent avec react-native-svg. Les SVG portent un manifeste C2PA de plusieurs ko : on ne garde que les formes.
// Lancé par `pnpm --filter @orasso/design-system run generate`. Sortie versionnée.
// Lot 39 : section « car-top » (la voiture du O vivant vue de dessus) → brandArt.carTop et src/web/assets/car-top.svg.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) =>
  readFileSync(resolve(root, "src/web/assets", name), "utf8").replace(/<metadata>[\s\S]*?<\/metadata>/, "");

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
const body = must(
  logoDark.match(/<\/defs><g fill="[^"]+">([\s\S]*?)<\/g><mask id="[^"]*cwin"/),
  "groupe des lettres",
)[1];
const letters = [...body.matchAll(/<path transform="translate\(([-\d.]+) 0\)" d="([^"]+)"/g)].map((m) => ({
  dx: Number(m[1]),
  d: m[2],
}));
if (letters.length !== 6) throw new Error(`Logotype : 6 lettres attendues, ${letters.length} trouvées`);

const windowD = must(monoDark.match(/<mask id="[^"]*win"[\s\S]*?<path transform="[^"]*" d="([^"]+)"/), "vitres")[1];
const carRects = [
  ...must(monoDark.match(/fill="#FFC629">([\s\S]*?)<\/g>/), "voiture")[1].matchAll(
    /<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)" rx="([\d.]+)"/g,
  ),
].map((m) => ({ x: Number(m[1]), y: Number(m[2]), width: Number(m[3]), height: Number(m[4]), rx: Number(m[5]) }));
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
    const curve =
      props
        .match(/animation-timing-function:([^;]+)/)?.[1]
        ?.replace(/^cubic-bezier\(/, "")
        .replace(/\)$/, "") ?? "none";
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

// --- car-top (lot 39) : la voiture du O vivant vue de dessus -------------------------------------------------------
// Silhouette de 64 × 28 unités centrée sur l'origine, nez vers +x : caisse, vitres, phares, feux stop, roues (les
// avant forment un groupe orientable autour de leur centre), aileron facultatif (la Supra du tuto) et trois cercles de
// fumée derrière les roues arrière. Aucune couleur : les composants la peignent aux jetons (caisse `poster`, feux stop
// `win`, fumée `ink` à 12 %). Le même tracé est écrit pour le site (src/web/assets/car-top.svg).
const r1 = (n) => Math.round(n * 100) / 100;
function roundedRect(x, y, w, h, r) {
  const k = Math.min(r, w / 2, h / 2);
  return [
    `M${r1(x + k)} ${r1(y)}H${r1(x + w - k)}A${r1(k)} ${r1(k)} 0 0 1 ${r1(x + w)} ${r1(y + k)}`,
    `V${r1(y + h - k)}A${r1(k)} ${r1(k)} 0 0 1 ${r1(x + w - k)} ${r1(y + h)}`,
    `H${r1(x + k)}A${r1(k)} ${r1(k)} 0 0 1 ${r1(x)} ${r1(y + h - k)}`,
    `V${r1(y + k)}A${r1(k)} ${r1(k)} 0 0 1 ${r1(x + k)} ${r1(y)}Z`,
  ].join("");
}
const wheel = (cx, cy) => ({ x: cx - 5, y: cy - 2, width: 10, height: 4, rx: 1.5, cx, cy });
const carTop = {
  /** Boîte de la voiture seule (sans la fumée) : 64 × 28 unités. */
  box: [-32, -14, 64, 28],
  /** Boîte de dessin avec la fumée, centrée sur la voiture (un composant la fait tourner autour de son centre). */
  viewBox: [-64, -32, 128, 64],
  body: roundedRect(-30, -12, 60, 24, 9),
  glass: roundedRect(3, -9, 12, 18, 3) + roundedRect(-22, -8, 8, 16, 2.5),
  headlights: [
    { x: 26.5, y: -9.5, width: 2.5, height: 5, rx: 1 },
    { x: 26.5, y: 4.5, width: 2.5, height: 5, rx: 1 },
  ],
  brakeLights: [
    { x: -30.6, y: -9.5, width: 2.4, height: 6, rx: 1 },
    { x: -30.6, y: 3.5, width: 2.4, height: 6, rx: 1 },
  ],
  rearWheels: [wheel(-18, -12.5), wheel(-18, 12.5)],
  /** Roues avant : chacune tourne autour de (cx, cy) du contre-braquage. */
  frontWheels: [wheel(18, -12.5), wheel(18, 12.5)],
  spoiler: { x: -29, y: -13.5, width: 3.6, height: 27, rx: 1.2 },
  /** Fumée : trois cercles qui s'estompent (opacité relative, multipliée par les 12 % de la fumée). */
  smoke: [
    { cx: -36, cy: 0, r: 5, opacity: 1 },
    { cx: -43, cy: 0, r: 7, opacity: 0.66 },
    { cx: -52, cy: 0, r: 9, opacity: 0.33 },
  ],
};

const rectSvg = (r, extra = "") =>
  `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" rx="${r.rx}"${extra}/>`;
const carTopSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${carTop.viewBox.join(" ")}" width="128" height="64">
<!-- Généré par scripts/generate-native-brand.mjs (section car-top). Ne pas modifier. La voiture du O vivant vue de dessus,
     64 × 28 unités, nez à droite. Couleurs par variables CSS (repli currentColor) : --car-body, --car-glass, --car-light,
     --car-brake, --car-wheel, --car-smoke. Le site dessine la même géométrie en ligne (web/components/Olive.tsx). -->
<g id="car-top">
<g id="smoke" fill="var(--car-smoke, currentColor)">${carTop.smoke
  .map((c) => `<circle cx="${c.cx}" cy="${c.cy}" r="${c.r}" opacity="${r1(0.12 * c.opacity)}"/>`)
  .join("")}</g>
<g id="wheels" fill="var(--car-wheel, currentColor)">${carTop.rearWheels.map((r) => rectSvg(r)).join("")}<g id="front-wheels">${carTop.frontWheels
  .map((r) => rectSvg(r, ` transform="rotate(0 ${r.cx} ${r.cy})"`))
  .join("")}</g></g>
<path id="body" d="${carTop.body}" fill="var(--car-body, currentColor)"/>
<path id="glass" d="${carTop.glass}" fill="var(--car-glass, currentColor)"/>
<g id="headlights" fill="var(--car-light, currentColor)">${carTop.headlights.map((r) => rectSvg(r)).join("")}</g>
<g id="brake-lights" fill="var(--car-brake, currentColor)">${carTop.brakeLights.map((r) => rectSvg(r)).join("")}</g>
</g>
</svg>
`;
writeFileSync(resolve(root, "src/web/assets/car-top.svg"), carTopSvg);

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
  /** Lot 39 : la voiture du O vivant vue de dessus (64 × 28, nez vers +x), sans couleur (peinte aux jetons). */
  carTop,
})} as const;
`;
writeFileSync(resolve(root, "src/native/brandArt.ts"), out);
console.log(`brandArt.ts : ${letters.length} lettres, ${frames.length} images clés`);
