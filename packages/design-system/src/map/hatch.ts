// Hachures de la mer (lot 44, prototype `s-map`) : une image 8 × 8, un trait horizontal couleur `map-label` à 35 %
// sur fond transparent, répétée par `fill-pattern` au-dessus de l'aplat `map-sea`. Le web l'ajoute en pixels
// (`map.addImage`) ; l'appli native en PNG (adresse `data:`) dans `<Images>`. Fonctions pures.
import { type ThemeId, tokens } from "../tokens";

export const HATCH_SIZE = 8;
/** Opacité des hachures. */
export const HATCH_ALPHA = 0.35;

export type HatchImage = { width: number; height: number; data: Uint8Array };

/** « #c9c1b2 » ou « #ccc » → [r, g, b]. */
function rgbOf(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h.slice(0, 6);
  return [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

/** Pixels RGBA des hachures d'un thème (une ligne sur huit, au milieu). */
export function hatchImage(theme: ThemeId): HatchImage {
  const [r, g, b] = rgbOf(tokens.color[theme].mapLabel);
  const data = new Uint8Array(HATCH_SIZE * HATCH_SIZE * 4);
  const row = HATCH_SIZE / 2;
  for (let x = 0; x < HATCH_SIZE; x++) {
    const i = (row * HATCH_SIZE + x) * 4;
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = Math.round(255 * HATCH_ALPHA);
  }
  return { width: HATCH_SIZE, height: HATCH_SIZE, data };
}

// --- PNG minimal (sans compression : blocs « stockés » de deflate), pour l'appli native.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: number[]): number {
  let c = 0xffffffff;
  for (const b of bytes) c = (CRC_TABLE[(c ^ b) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];

function chunk(type: string, data: number[]): number[] {
  const body = [...type].map((c) => c.charCodeAt(0)).concat(data);
  return [...u32(data.length), ...body, ...u32(crc32(body))];
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function base64(bytes: number[]): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] as number;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    out += B64[(n >> 18) & 63];
    out += B64[(n >> 12) & 63];
    out += b === undefined ? "=" : B64[(n >> 6) & 63];
    out += c === undefined ? "=" : B64[n & 63];
  }
  return out;
}

/** Une image RGBA en PNG, adresse `data:image/png;base64,…`. */
export function pngDataUri(image: HatchImage): string {
  const raw: number[] = [];
  for (let y = 0; y < image.height; y++) {
    raw.push(0);
    for (let x = 0; x < image.width * 4; x++) raw.push(image.data[y * image.width * 4 + x] as number);
  }
  // zlib : en-tête, un bloc stocké (les images font moins de 65 535 octets), adler-32.
  let s1 = 1;
  let s2 = 0;
  for (const b of raw) {
    s1 = (s1 + b) % 65521;
    s2 = (s2 + s1) % 65521;
  }
  const len = raw.length;
  const zlib = [0x78, 0x01, 1, len & 255, len >>> 8, ~len & 255, (~len >>> 8) & 255, ...raw, ...u32((s2 << 16) | s1)];
  const ihdr = [...u32(image.width), ...u32(image.height), 8, 6, 0, 0, 0];
  const png = [137, 80, 78, 71, 13, 10, 26, 10, ...chunk("IHDR", ihdr), ...chunk("IDAT", zlib), ...chunk("IEND", [])];
  return `data:image/png;base64,${base64(png)}`;
}

/** Les hachures d'un thème en PNG (`<Images>` de MapLibre natif). */
export const hatchPngDataUri = (theme: ThemeId): string => pngDataUri(hatchImage(theme));
