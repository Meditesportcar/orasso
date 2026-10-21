// Lot C5 (D34) : photos d'événements du seed. Priorité aux photos de Damien (`photos-seed/` à la racine du dépôt, ou le
// dossier de `PHOTOS_SEED_DIR`) ; sinon les 7 photos de l'artefact DA v2 (`assets/photos`, crédit « JohnGRD Photographie »),
// en démonstration. Toutes sont rendues en WebP (le pilote de stockage ne sert un `content-type` d'image que pour .webp).
import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { repoRoot } from "../../src/env";

export const ASSETS_DIR = fileURLToPath(new URL("./assets/", import.meta.url));
const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);

async function imagesIn(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir)).filter((f) => IMAGE_EXT.has(extname(f).toLowerCase())).sort();
  } catch {
    return [];
  }
}

/** Les photos d'événement disponibles, en WebP (2000 px au plus), dans un ordre stable. */
export async function demoEventPhotos(): Promise<{ name: string; data: Buffer }[]> {
  const own = process.env.PHOTOS_SEED_DIR || join(repoRoot, "photos-seed");
  let dir = own;
  let names = await imagesIn(dir);
  if (!names.length) {
    dir = join(ASSETS_DIR, "photos");
    names = await imagesIn(dir);
  }
  const out: { name: string; data: Buffer }[] = [];
  for (const name of names) {
    const data = await sharp(await readFile(join(dir, name)))
      .rotate()
      .resize(2000, 2000, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
    out.push({ name, data });
  }
  return out;
}

/** Logo de MéditeSportCar (artefact DA v2), en WebP 512 px. */
export async function mscLogo(): Promise<Buffer> {
  return sharp(await readFile(join(ASSETS_DIR, "logo-msc.png")))
    .resize(512, 512, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 90 })
    .toBuffer();
}
