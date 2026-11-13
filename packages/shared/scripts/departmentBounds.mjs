// Emprises (rectangles lat/lng) des départements : calcule la table de `src/departmentBounds.ts` à partir des tracés SVG déjà présents dans
// le dépôt (packages/design-system/src/france/departments.ts, CC BY 4.0), en ajustant la projection de la carte sur les centres connus
// (`departmentCentroids`). Régénérer le fichier :
//   node --experimental-strip-types packages/shared/scripts/departmentBounds.mjs --write      (puis `biome check --write`)
// Sans `--write`, la table est affichée en JSON. Le test `departmentBounds.test.ts` vérifie que la table régénérée est identique.
import { franceDepartments } from "../../design-system/src/france/departments.ts";
import { departmentCentroids } from "../src/geo.ts";

/** Les cinq départements d'outre-mer ne figurent pas sur la carte : rectangles approchés saisis à la main (sud, ouest, nord, est). */
export const overseasBounds = {
  971: [15.8, -61.85, 16.55, -61.0],
  972: [14.38, -61.25, 14.89, -60.8],
  973: [2.1, -54.6, 5.8, -51.6],
  974: [-21.4, 55.2, -20.85, 55.85],
  976: [-13.05, 44.98, -12.6, 45.3],
};

function rings(d) {
  // Seulement `m` (relatif, avec lineto relatif implicite) et `z` (retour au début du sous-tracé).
  const out = [];
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  for (const part of d
    .trim()
    .split(/(?=[mz])/i)
    .filter((p) => p.trim())) {
    const cmd = part[0].toLowerCase();
    if (cmd === "m") {
      const nums = part
        .slice(1)
        .trim()
        .split(/[\s,]+/)
        .filter(Boolean)
        .map(Number);
      const ring = [];
      for (let i = 0; i < nums.length; i += 2) {
        cx += nums[i];
        cy += nums[i + 1];
        if (i === 0) {
          sx = cx;
          sy = cy;
        }
        ring.push([cx, cy]);
      }
      out.push(ring);
    } else if (cmd === "z") {
      cx = sx;
      cy = sy;
    }
  }
  return out;
}

const merc = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));

/** Moindres carrés d'une droite y = b0 + b1 x. */
function leastSquares(xs, ys) {
  const n = xs.length;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
  }
  const b1 = sxy / sxx;
  return { b0: my - b1 * mx, b1 };
}

/** La table des emprises : tracés de la carte convertis en latitude et longitude, plus l'outre-mer. */
export function computeDepartmentBounds() {
  const boxes = {};
  const pairs = [];
  for (const dep of franceDepartments) {
    const rs = rings(dep.d);
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let area = 0;
    let ax = 0;
    let ay = 0;
    for (const r of rs) {
      for (const [x, y] of r) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
      // Centroïde de l'anneau (formule du lacet).
      let a = 0;
      let cxr = 0;
      let cyr = 0;
      for (let i = 0; i < r.length; i++) {
        const [x1, y1] = r[i];
        const [x2, y2] = r[(i + 1) % r.length];
        const f = x1 * y2 - x2 * y1;
        a += f;
        cxr += (x1 + x2) * f;
        cyr += (y1 + y2) * f;
      }
      a /= 2;
      if (Math.abs(a) > 1e-9) {
        area += Math.abs(a);
        ax += (cxr / (6 * a)) * Math.abs(a);
        ay += (cyr / (6 * a)) * Math.abs(a);
      }
    }
    boxes[dep.code] = { minX, maxX, minY, maxY };
    const c = departmentCentroids[dep.code];
    if (c && area > 0) pairs.push({ x: ax / area, y: ay / area, lat: c.lat, lng: c.lng });
  }
  // lng = p0 + p1·x ; mercator(lat) = q0 + q1·Y
  const fx = leastSquares(
    pairs.map((p) => p.x),
    pairs.map((p) => p.lng),
  );
  const fy = leastSquares(
    pairs.map((p) => p.y),
    pairs.map((p) => merc(p.lat)),
  );
  const lngOf = (x) => fx.b0 + fx.b1 * x;
  const latOf = (y) => {
    const m = fy.b0 + fy.b1 * y;
    return (2 * Math.atan(Math.exp(m)) - Math.PI / 2) * (180 / Math.PI);
  };
  const table = {};
  for (const code of Object.keys(boxes)) {
    const b = boxes[code];
    // Y de l'écran croît vers le bas : le sud est maxY.
    table[code] = [latOf(b.maxY), lngOf(b.minX), latOf(b.minY), lngOf(b.maxX)].map((v) => Math.round(v * 100) / 100);
  }
  for (const [code, box] of Object.entries(overseasBounds)) table[code] = box;
  return Object.fromEntries(Object.entries(table).sort(([a], [b]) => a.localeCompare(b)));
}

const HEADER = [
  "// Fichier généré : ne pas modifier à la main. Régénérer : `node --experimental-strip-types packages/shared/scripts/departmentBounds.mjs --write`",
  "// puis `biome check --write` (le test `departmentBounds.test.ts` vérifie que la table régénérée est identique).",
  "//",
  "// Emprises des départements (rectangles lat/lng : sud, ouest, nord, est), lot R8q « Pratique ».",
  "// Sert à « quels départements coupent la zone de recherche » (`departmentsAround`) : un département est lu si son emprise coupe le carré",
  "// qui enferme le cercle de recherche. Un rectangle contient tout le département (il peut déborder sur un voisin : on lit alors un",
  "// département de trop, jamais un de moins).",
  "//",
  "// Origine : les tracés des départements de métropole (96, Corse 2A et 2B comprises) déjà présents dans le dépôt,",
  "// `packages/design-system/src/france/departments.ts` (@svg-maps/france.departments de Victor Cazanave, Creative Commons Attribution 4.0,",
  "// voir `LICENSE-france-departments.md` : crédit à conserver). L'emprise de chaque tracé est convertie en latitude et longitude par une",
  "// projection de Mercator ajustée sur les centres de `departmentCentroids` (écart quadratique 0,7 km, pire 2,9 km) ; `BOUNDS_MARGIN_KM`",
  "// couvre cet écart (vérifié à 1 à 2 km près). Les cinq départements d'outre-mer ne figurent pas sur cette carte : leurs rectangles sont",
  "// des valeurs approchées saisies à la main (marge large). Aucun fichier téléchargé, aucune donnée externe nouvelle.",
  "export type DepartmentBounds = readonly [south: number, west: number, north: number, east: number];",
  "",
  "/** Marge ajoutée à chaque emprise (km) : l'écart de la conversion des tracés. */",
  "export const BOUNDS_MARGIN_KM = 3;",
  "",
  "export const departmentBounds: Readonly<Record<string, DepartmentBounds>> = {",
];

/** Le texte de `src/departmentBounds.ts`. */
export function renderDepartmentBounds(table) {
  const lines = Object.entries(table).map(([code, box]) => `  "${code}": [${box.join(", ")}],`);
  return `${[...HEADER, ...lines, "};"].join("\n")}\n`;
}

if (process.argv[1]?.endsWith("departmentBounds.mjs")) {
  const table = computeDepartmentBounds();
  if (process.argv.includes("--write")) {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(new URL("../src/departmentBounds.ts", import.meta.url), renderDepartmentBounds(table));
    console.error("src/departmentBounds.ts écrit (lancer ensuite `biome check --write`).");
  } else {
    console.log(JSON.stringify(table));
  }
}
