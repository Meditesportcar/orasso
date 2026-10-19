// Glyphes de la carte (lot 44, ARCHITECTURE-DA-V2 § 2.3) : les noms de la carte MapLibre s'écrivent en Archivo étroit.
// MapLibre ne lit pas une police : il lit des « glyphes » en champ de distance signée (SDF), par tranches de 256 points
// de code, dans des fichiers PBF. Ce script les fabrique à partir de la police du système de design
// (packages/design-system/src/native/fonts/Archivo-Narrow-Bold.ttf) et les écrit, versionnés, dans
// apps/web/public/map-fonts/Archivo Narrow/{début}-{fin}.pbf ; le site les sert à l'adresse de `glyphs` du style.
//
// Pourquoi pas `fontnik` (prévu au brief) : il n'a de binaire que pour Linux et macOS, pas pour Windows où l'on
// développe. Même format, mêmes réglages que fontnik (24 px, marge 3, rayon 8, seuil 0,25), calculé ici en JavaScript :
// la distance de chaque pixel au contour exact de la lettre (opentype.js pour lire la police).
// Les 256 tranches sont écrites, vides quand la police n'y a aucune lettre : une tranche absente (404) ferait échouer
// toute la tuile chez MapLibre.
//   node apps/web/scripts/build-map-glyphs.mjs
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import opentype from "opentype.js";

const here = dirname(fileURLToPath(import.meta.url));
const FONT_FILE = resolve(here, "../../../packages/design-system/src/native/fonts/Archivo-Narrow-Bold.ttf");
/** Nom de la pile de polices dans le style (`text-font`) et dossier des fichiers. */
const FONTSTACK = "Archivo Narrow";
const OUT = resolve(here, "../public/map-fonts", FONTSTACK);

const SIZE = 24;
const BUFFER = 3;
const RADIUS = 8;
const CUTOFF = 0.25;
const CURVE_STEPS = 8;

// --- Écriture protobuf minimale (varint, longueur) : glyphs { stacks = 1 } fontstack { name 1, range 2, glyphs 3 }
// glyph { id 1, bitmap 2, width 3, height 4, left 5 (sint32), top 6 (sint32), advance 7 }.
function varint(n, out) {
  let v = n >>> 0;
  while (v > 127) {
    out.push((v & 127) | 128);
    v >>>= 7;
  }
  out.push(v);
}
const zigzag = (n) => ((n << 1) ^ (n >> 31)) >>> 0;
function field(no, wire, out) {
  varint((no << 3) | wire, out);
}
function uintField(no, n, out) {
  field(no, 0, out);
  varint(n, out);
}
function sintField(no, n, out) {
  field(no, 0, out);
  varint(zigzag(n), out);
}
function bytesField(no, bytes, out) {
  field(no, 2, out);
  varint(bytes.length, out);
  for (const b of bytes) out.push(b);
}

/** Contours de la lettre en segments (coordonnées en pixels, y vers le bas, ligne de base à 0). */
function segmentsOf(path) {
  const segs = [];
  let start = null;
  let cur = null;
  for (const c of path.commands) {
    if (c.type === "M") {
      start = [c.x, c.y];
      cur = start;
    } else if (c.type === "L") {
      segs.push([cur, [c.x, c.y]]);
      cur = [c.x, c.y];
    } else if (c.type === "Q") {
      for (let i = 1; i <= CURVE_STEPS; i++) {
        const t = i / CURVE_STEPS;
        const u = 1 - t;
        const p = [u * u * cur[0] + 2 * u * t * c.x1 + t * t * c.x, u * u * cur[1] + 2 * u * t * c.y1 + t * t * c.y];
        segs.push([i === 1 ? cur : segs[segs.length - 1][1], p]);
      }
      cur = [c.x, c.y];
    } else if (c.type === "C") {
      for (let i = 1; i <= CURVE_STEPS; i++) {
        const t = i / CURVE_STEPS;
        const u = 1 - t;
        const p = [
          u * u * u * cur[0] + 3 * u * u * t * c.x1 + 3 * u * t * t * c.x2 + t * t * t * c.x,
          u * u * u * cur[1] + 3 * u * u * t * c.y1 + 3 * u * t * t * c.y2 + t * t * t * c.y,
        ];
        segs.push([i === 1 ? cur : segs[segs.length - 1][1], p]);
      }
      cur = [c.x, c.y];
    } else if (c.type === "Z") {
      if (cur && start && (cur[0] !== start[0] || cur[1] !== start[1])) segs.push([cur, start]);
      cur = start;
    }
  }
  return segs;
}

function distToSegment(px, py, [a, b]) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  let t = len === 0 ? 0 : ((px - a[0]) * dx + (py - a[1]) * dy) / len;
  t = Math.max(0, Math.min(1, t));
  const x = a[0] + t * dx - px;
  const y = a[1] + t * dy - py;
  return Math.sqrt(x * x + y * y);
}

/** Règle non nulle (TrueType) : le point est-il dans la lettre ? */
function inside(px, py, segs) {
  let winding = 0;
  for (const [a, b] of segs) {
    if (a[1] <= py) {
      if (b[1] > py && (b[0] - a[0]) * (py - a[1]) - (px - a[0]) * (b[1] - a[1]) > 0) winding++;
    } else if (b[1] <= py && (b[0] - a[0]) * (py - a[1]) - (px - a[0]) * (b[1] - a[1]) < 0) winding--;
  }
  return winding !== 0;
}

function glyphMessage(font, glyph, codePoint, ascender) {
  const scale = SIZE / font.unitsPerEm;
  const advance = Math.round(glyph.advanceWidth * scale);
  const path = glyph.getPath(0, 0, SIZE);
  const segs = segmentsOf(path);
  const out = [];
  uintField(1, codePoint, out);
  if (segs.length === 0) {
    uintField(3, 0, out);
    uintField(4, 0, out);
    sintField(5, 0, out);
    sintField(6, -ascender, out);
    uintField(7, advance, out);
    return out;
  }
  const box = path.getBoundingBox();
  const left = Math.floor(box.x1);
  const topDown = Math.floor(box.y1);
  const width = Math.ceil(box.x2) - left;
  const height = Math.ceil(box.y2) - topDown;
  const w = width + 2 * BUFFER;
  const h = height + 2 * BUFFER;
  const bitmap = new Uint8Array(w * h);
  for (let by = 0; by < h; by++) {
    for (let bx = 0; bx < w; bx++) {
      const x = left + bx - BUFFER + 0.5;
      const y = topDown + by - BUFFER + 0.5;
      let d = Number.POSITIVE_INFINITY;
      for (const s of segs) d = Math.min(d, distToSegment(x, y, s));
      const signed = inside(x, y, segs) ? -d : d;
      bitmap[by * w + bx] = Math.max(0, Math.min(255, Math.round(255 - 255 * (signed / RADIUS + CUTOFF))));
    }
  }
  bytesField(2, bitmap, out);
  uintField(3, width, out);
  uintField(4, height, out);
  sintField(5, left, out);
  // Comme fontnik : le haut de la lettre au-dessus de la ligne de base, moins l'ascendante de la police.
  sintField(6, -topDown - ascender, out);
  uintField(7, advance, out);
  return out;
}

const buffer = readFileSync(FONT_FILE);
const font = opentype.parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
const ascender = Math.round((font.ascender * SIZE) / font.unitsPerEm);
const byCode = new Map();
for (let i = 0; i < font.glyphs.length; i++) {
  const g = font.glyphs.get(i);
  for (const u of g.unicodes ?? []) if (u <= 0xffff && !byCode.has(u)) byCode.set(u, g);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
let total = 0;
let filled = 0;
for (let start = 0; start < 65536; start += 256) {
  const end = start + 255;
  const stack = [];
  bytesField(1, [...Buffer.from(FONTSTACK, "utf8")], stack);
  bytesField(2, [...Buffer.from(`${start}-${end}`, "utf8")], stack);
  let count = 0;
  for (let cp = start; cp <= end; cp++) {
    const g = byCode.get(cp);
    if (!g) continue;
    bytesField(3, glyphMessage(font, g, cp, ascender), stack);
    count++;
  }
  const file = [];
  bytesField(1, stack, file);
  writeFileSync(resolve(OUT, `${start}-${end}.pbf`), Uint8Array.from(file));
  total += file.length;
  if (count > 0) {
    filled++;
    console.log(`${start}-${end} : ${count} lettres, ${(file.length / 1024).toFixed(1)} ko`);
  }
}
console.log(
  `${FONTSTACK} : ${filled} tranches avec des lettres sur 256, ${(total / 1024).toFixed(0)} ko au total → ${OUT}`,
);
