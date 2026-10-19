// Lot 51 (floutage de plaque) : une photo à motif fin (damier), que la pixellisation efface forcément, et la mesure
// d'une zone de la photo stockée (écart type des pixels) pour vérifier qu'elle a été floutée et le reste non.
import { crc32, deflateSync } from "node:zlib";
import sharp from "sharp";

const API = `http://localhost:${process.env.API_PORT ?? 3001}`;

/** PNG 640 × 480, damier de 6 px crème et nuit : beaucoup de détails partout. */
export function checkerPhoto(width = 640, height = 480): Buffer {
  const row = (y: number) => {
    const r = Buffer.alloc(1 + width * 3);
    for (let x = 0; x < width; x++) {
      const on = (Math.floor(x / 6) + Math.floor(y / 6)) % 2 === 0;
      r.fill(on ? 235 : 25, 1 + x * 3, 4 + x * 3);
    }
    return r;
  };
  const raw = Buffer.concat(Array.from({ length: height }, (_, y) => row(y)));
  const chunk = (type: string, body: Buffer) => {
    const head = Buffer.alloc(4);
    head.writeUInt32BE(body.length);
    const tag = Buffer.from(type, "ascii");
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([tag, body])));
    return Buffer.concat([head, tag, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export type Rect = { x: number; y: number; w: number; h: number };

/** Écart type de la luminance sur une zone normalisée de l'image (damier net ≈ 100, zone floutée ≈ quelques unités). */
export async function regionSpread(image: Buffer, r: Rect): Promise<number> {
  const meta = await sharp(image).metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  const left = Math.floor(r.x * W);
  const top = Math.floor(r.y * H);
  const width = Math.max(1, Math.floor(r.w * W));
  const height = Math.max(1, Math.floor(r.h * H));
  const { data } = await sharp(image)
    .extract({ left, top, width, height })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let sum = 0;
  for (const v of data) sum += v;
  const mean = sum / data.length;
  let sq = 0;
  for (const v of data) sq += (v - mean) ** 2;
  return Math.sqrt(sq / data.length);
}

/** La photo stockée (adresse `/api/files/…` renvoyée par l'API). */
export async function storedPhoto(url: string): Promise<Buffer> {
  const res = await fetch(url.startsWith("http") ? url : `${API}${url}`);
  if (res.status !== 200) throw new Error(`Photo ${url} : ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Le centre d'un rectangle normalisé rétréci (on mesure loin des bords du cadre, où le flou se fond). */
export const inner = (r: Rect, k = 0.25): Rect => ({
  x: r.x + r.w * k,
  y: r.y + r.h * k,
  w: r.w * (1 - 2 * k),
  h: r.h * (1 - 2 * k),
});
