// Lot C5 (D34) puis lot C6 : photos du seed. Priorité aux photos de Damien (`photos-seed/` à la racine du dépôt, ou le
// dossier de `PHOTOS_SEED_DIR`) pour les affiches ; sinon la sélection réelle de `assets/photos` (22 photos de
// JohnGRD Photographie, recompressées, sans EXIF). Préfixes : `event-` (scènes), `car-`, `moto-`, `detail-`.
// Toutes sont rendues en WebP (le pilote de stockage ne sert un `content-type` d'image que pour .webp).
import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { repoRoot } from "../../src/env";
import { storage } from "../../src/lib/storage";

export const ASSETS_DIR = fileURLToPath(new URL("./assets/", import.meta.url));
const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);

async function imagesIn(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir)).filter((f) => IMAGE_EXT.has(extname(f).toLowerCase())).sort();
  } catch {
    return [];
  }
}

type Pool = "car" | "moto" | "detail";
const poolCache = new Map<string, { name: string; data: Buffer; width: number; height: number }[]>();

/** Les photos réelles d'un lot (voitures et scènes, motos ou détails), en WebP 1600 px, dans un ordre stable. */
async function realPool(pool: Pool) {
  const hit = poolCache.get(pool);
  if (hit) return hit;
  const dir = join(ASSETS_DIR, "photos");
  const wanted = (n: string) =>
    pool === "car" ? n.startsWith("car-") || n.startsWith("event-") : n.startsWith(`${pool}-`);
  const out = [];
  for (const name of (await imagesIn(dir)).filter(wanted)) {
    const { data, info } = await sharp(await readFile(join(dir, name)))
      .rotate()
      .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
    out.push({ name, data, width: info.width, height: info.height });
  }
  poolCache.set(pool, out);
  return out;
}

/**
 * Lot R4b, tour 3 : photos de `assets/photos` regardées une à une (24/10/2026) : aucune ne montre de plaque lisible
 * (plaques déjà masquées par un aplat sur l'image, ou hors champ : vue de côté, avant coupé, motos de profil ; les
 * voitures du fond sont trop loin pour être lues). Leur décision vraie est donc « aucune plaque visible ». Une photo
 * ajoutée plus tard au dossier n'est pas dans cette liste : sans décision, elle reste en silhouette hors du garage.
 */
const NO_PLATE_REVIEWED = new Set([
  "car-audi-s3.jpg",
  "car-bmw-i8.jpg",
  "car-e30-bbs.jpg",
  "car-golf-gti.jpg",
  "car-gt86.jpg",
  "car-gtr.jpg",
  "car-lamborghini.jpg",
  "car-lexus-is.jpg",
  "car-megane-rs.jpg",
  "car-mustang.jpg",
  "car-mx5.jpg",
  "car-seat-rouge.jpg",
  "car-subaru-sti.jpg",
  "car-supra.jpg",
  "event-e30-foule.jpg",
  "event-honda-rassemblement.jpg",
  "event-polizei-e30.jpg",
  "event-sheriff-scene.jpg",
  "moto-cbr-blanche.jpg",
  "moto-ninja.jpg",
  "moto-r1.jpg",
]);

/**
 * Pose la `index`-ième photo réelle du lot sous `key` (à la place d'un dégradé factice) ; renvoie ses dimensions et sa
 * décision de plaque (`noPlate` : photo regardée, aucune plaque lisible).
 */
export async function putRealPhoto(key: string, pool: Pool, index: number) {
  const photos = await realPool(pool);
  const photo = photos[index % photos.length];
  if (!photo) throw new Error(`Aucune photo réelle « ${pool} » dans ${ASSETS_DIR}`);
  await storage.put(key, photo.data);
  return {
    width: photo.width,
    height: photo.height,
    size: photo.data.length,
    noPlate: NO_PLATE_REVIEWED.has(photo.name),
  };
}

/** Les photos d'événement disponibles, en WebP (2000 px au plus), dans un ordre stable. */
export async function demoEventPhotos(): Promise<{ name: string; data: Buffer }[]> {
  const own = process.env.PHOTOS_SEED_DIR || join(repoRoot, "photos-seed");
  let dir = own;
  let names = await imagesIn(dir);
  if (!names.length) {
    dir = join(ASSETS_DIR, "photos");
    names = (await imagesIn(dir)).filter((n) => n.startsWith("car-") || n.startsWith("event-"));
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
