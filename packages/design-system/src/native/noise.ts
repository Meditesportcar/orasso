// Grain d'asphalte et brossage des barres, côté natif.
// Sur le web ces textures sont des filtres SVG feTurbulence ; react-native-svg ne les rend pas (le primitif
// existe mais avertit « non implémenté »). On calcule donc la même fonction (la référence de la spécification
// SVG 1.1, § 15.20) une fois, dans une tuile qui se répète sans couture (stitchTiles), puis on l'encode en PNG.
// Les paramètres (fréquences, octaves, couleur, alpha) viennent des jetons `grain` et `barBrush`.

const BSIZE = 0x100;
const BM = 0xff;
const PERLIN_N = 0x1000;
const RAND_M = 2147483647;
const RAND_A = 16807;
const RAND_Q = 127773;
const RAND_R = 2836;

function random(seed: number): number {
  const result = RAND_A * (seed % RAND_Q) - RAND_R * Math.trunc(seed / RAND_Q);
  return result <= 0 ? result + RAND_M : result;
}

type Lattice = { selector: Int32Array; gradient: Float64Array[][] };

function initLattice(initialSeed: number): Lattice {
  let seed = initialSeed;
  if (seed <= 0) seed = -(seed % (RAND_M - 1)) + 1;
  if (seed > RAND_M - 1) seed = RAND_M - 1;
  const selector = new Int32Array(BSIZE + BSIZE + 2);
  const gradient: Float64Array[][] = [];
  for (let k = 0; k < 4; k++) {
    const channel: Float64Array[] = [];
    for (let i = 0; i < BSIZE + BSIZE + 2; i++) channel.push(new Float64Array(2));
    gradient.push(channel);
    for (let i = 0; i < BSIZE; i++) {
      selector[i] = i;
      const g = channel[i] as Float64Array;
      for (let j = 0; j < 2; j++) {
        seed = random(seed);
        g[j] = ((seed % (BSIZE + BSIZE)) - BSIZE) / BSIZE;
      }
      const s = Math.hypot(g[0] ?? 0, g[1] ?? 0);
      g[0] = (g[0] ?? 0) / s;
      g[1] = (g[1] ?? 0) / s;
    }
  }
  for (let i = BSIZE - 1; i > 0; i--) {
    const k = selector[i] ?? 0;
    seed = random(seed);
    const j = seed % BSIZE;
    selector[i] = selector[j] ?? 0;
    selector[j] = k;
  }
  for (let i = 0; i < BSIZE + 2; i++) {
    selector[BSIZE + i] = selector[i] ?? 0;
    for (let k = 0; k < 4; k++) {
      const channel = gradient[k] as Float64Array[];
      const src = channel[i] as Float64Array;
      const dst = channel[BSIZE + i] as Float64Array;
      dst[0] = src[0] ?? 0;
      dst[1] = src[1] ?? 0;
    }
  }
  return { selector, gradient };
}

type Stitch = { width: number; height: number; wrapX: number; wrapY: number };

const sCurve = (t: number) => t * t * (3 - 2 * t);
const lerp = (t: number, a: number, b: number) => a + t * (b - a);

function noise2(lattice: Lattice, channel: number, vx: number, vy: number, stitch: Stitch | null): number {
  const sel = lattice.selector;
  const grad = lattice.gradient[channel] as Float64Array[];
  let t = vx + PERLIN_N;
  let bx0 = Math.trunc(t) & BM;
  let bx1 = (bx0 + 1) & BM;
  const rx0 = t - Math.trunc(t);
  const rx1 = rx0 - 1;
  t = vy + PERLIN_N;
  let by0 = Math.trunc(t) & BM;
  let by1 = (by0 + 1) & BM;
  const ry0 = t - Math.trunc(t);
  const ry1 = ry0 - 1;
  if (stitch) {
    if (bx0 >= stitch.wrapX) bx0 -= stitch.width;
    if (bx1 >= stitch.wrapX) bx1 -= stitch.width;
    if (by0 >= stitch.wrapY) by0 -= stitch.height;
    if (by1 >= stitch.wrapY) by1 -= stitch.height;
  }
  bx0 &= BM;
  bx1 &= BM;
  by0 &= BM;
  by1 &= BM;
  const i = sel[bx0] ?? 0;
  const j = sel[bx1] ?? 0;
  const b00 = sel[i + by0] ?? 0;
  const b10 = sel[j + by0] ?? 0;
  const b01 = sel[i + by1] ?? 0;
  const b11 = sel[j + by1] ?? 0;
  const sx = sCurve(rx0);
  const sy = sCurve(ry0);
  const dot = (b: number, rx: number, ry: number) => {
    const q = grad[b] as Float64Array;
    return rx * (q[0] ?? 0) + ry * (q[1] ?? 0);
  };
  const a = lerp(sx, dot(b00, rx0, ry0), dot(b10, rx1, ry0));
  const b = lerp(sx, dot(b01, rx0, ry1), dot(b11, rx1, ry1));
  return lerp(sy, a, b);
}

export type TurbulenceOptions = {
  baseFrequencyX: number;
  baseFrequencyY: number;
  numOctaves: number;
  /** Canal de couleur de feTurbulence : 3 = alpha, le seul qui sert ici (la couleur est constante). */
  channel?: number;
  seed?: number;
};

/** feTurbulence type=fractalNoise stitchTiles=stitch : valeurs de 0 à 1 d'une tuile `width` × `height`. */
export function fractalNoiseTile(width: number, height: number, options: TurbulenceOptions): Float32Array {
  const { numOctaves, channel = 3, seed = 0 } = options;
  const lattice = initLattice(seed);
  let fx = options.baseFrequencyX;
  let fy = options.baseFrequencyY;
  // Les fréquences sont ajustées pour que les bords de la tuile se raccordent.
  const adjust = (f: number, size: number) => {
    if (f === 0) return f;
    const lo = Math.floor(size * f) / size;
    const hi = Math.ceil(size * f) / size;
    return lo > 0 && f / lo < hi / f ? lo : hi;
  };
  fx = adjust(fx, width);
  fy = adjust(fy, height);
  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const stitchWidth0 = Math.trunc(width * fx + 0.5);
      const stitchHeight0 = Math.trunc(height * fy + 0.5);
      const stitch: Stitch = {
        width: stitchWidth0,
        height: stitchHeight0,
        wrapX: 0 * fx + PERLIN_N + stitchWidth0,
        wrapY: 0 * fy + PERLIN_N + stitchHeight0,
      };
      let vx = x * fx;
      let vy = y * fy;
      let ratio = 1;
      let sum = 0;
      for (let octave = 0; octave < numOctaves; octave++) {
        sum += noise2(lattice, channel, vx, vy, stitch) / ratio;
        vx *= 2;
        vy *= 2;
        ratio *= 2;
        stitch.width *= 2;
        stitch.wrapX = 2 * stitch.wrapX - PERLIN_N;
        stitch.height *= 2;
        stitch.wrapY = 2 * stitch.wrapY - PERLIN_N;
      }
      out[y * width + x] = Math.min(1, Math.max(0, (sum + 1) / 2));
    }
  }
  return out;
}

// --- PNG indexé : une couleur constante, l'alpha de chaque pixel est son indice (palette + tRNS) ----------------

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = (crcTable[(c ^ byte) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (const byte of bytes) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function u32(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = [...type].map((ch) => ch.charCodeAt(0));
  const body = new Uint8Array(4 + data.length);
  body.set(typeBytes, 0);
  body.set(data, 4);
  const out = new Uint8Array(12 + data.length);
  out.set(u32(data.length), 0);
  out.set(body, 4);
  out.set(u32(crc32(body)), 8 + data.length);
  return out;
}

/** zlib sans compression (blocs « stored ») : assez petit pour une tuile d'un octet par pixel. */
function zlibStored(raw: Uint8Array): Uint8Array {
  const blocks = Math.max(1, Math.ceil(raw.length / 65535));
  const out = new Uint8Array(2 + raw.length + blocks * 5 + 4);
  out[0] = 0x78;
  out[1] = 0x01;
  let pos = 2;
  for (let i = 0; i < blocks; i++) {
    const part = raw.subarray(i * 65535, Math.min(raw.length, (i + 1) * 65535));
    out[pos++] = i === blocks - 1 ? 1 : 0;
    out[pos++] = part.length & 0xff;
    out[pos++] = (part.length >>> 8) & 0xff;
    out[pos++] = ~part.length & 0xff;
    out[pos++] = (~part.length >>> 8) & 0xff;
    out.set(part, pos);
    pos += part.length;
  }
  out.set(u32(adler32(raw)), pos);
  return out;
}

/** PNG de `width` × `height` pixels de la couleur `rgb` (0 à 1), d'alpha `alpha[i]` (0 à 1) par pixel. */
export function encodeAlphaPng(
  width: number,
  height: number,
  rgb: readonly number[],
  alpha: Float32Array,
  alphaScale: number,
): Uint8Array {
  const to8 = (v: number | undefined) => Math.round(Math.min(1, Math.max(0, v ?? 0)) * 255);
  const palette = new Uint8Array(256 * 3);
  const trns = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    palette[i * 3] = to8(rgb[0]);
    palette[i * 3 + 1] = to8(rgb[1]);
    palette[i * 3 + 2] = to8(rgb[2]);
    trns[i] = i;
  }
  const raw = new Uint8Array((width + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width + 1)] = 0;
    for (let x = 0; x < width; x++) {
      raw[y * (width + 1) + 1 + x] = to8((alpha[y * width + x] ?? 0) * alphaScale);
    }
  }
  const ihdr = new Uint8Array([...u32(width), ...u32(height), 8, 3, 0, 0, 0]);
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("PLTE", palette),
    chunk("tRNS", trns),
    chunk("IDAT", zlibStored(raw)),
    chunk("IEND", new Uint8Array(0)),
  ];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const png = new Uint8Array(total);
  let pos = 0;
  for (const part of parts) {
    png.set(part, pos);
    pos += part.length;
  }
  return png;
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function toBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    out += (B64[a >> 2] ?? "") + (B64[((a & 3) << 4) | (b >> 4)] ?? "");
    out += i + 1 < bytes.length ? (B64[((b & 15) << 2) | (c >> 6)] ?? "") : "=";
    out += i + 2 < bytes.length ? (B64[c & 63] ?? "") : "=";
  }
  return out;
}

export type TextureSpec = {
  readonly baseFrequency: number | string;
  readonly numOctaves: number;
  readonly color: readonly number[];
  readonly alpha: number;
};

export type Texture = { uri: string; width: number; height: number };

function frequencies(spec: TextureSpec): [number, number] {
  if (typeof spec.baseFrequency === "number") return [spec.baseFrequency, spec.baseFrequency];
  const [x = 0, y = x] = spec.baseFrequency.split(/\s+/).map(Number);
  return [x, y];
}

const cache = new Map<string, Texture>();

/**
 * La tuile d'une texture des jetons (grain ou brossage) en PNG (data URI). feColorMatrix des jetons : la couleur
 * est constante, l'alpha du résultat est `alpha` × l'alpha du bruit.
 */
export function textureTile(spec: TextureSpec, width: number, height: number): Texture {
  const key = JSON.stringify([spec, width, height]);
  const cached = cache.get(key);
  if (cached) return cached;
  const [fx, fy] = frequencies(spec);
  const noise = fractalNoiseTile(width, height, { baseFrequencyX: fx, baseFrequencyY: fy, numOctaves: spec.numOctaves });
  const png = encodeAlphaPng(width, height, spec.color, noise, spec.alpha);
  const texture = { uri: `data:image/png;base64,${toBase64(png)}`, width, height };
  cache.set(key, texture);
  return texture;
}
