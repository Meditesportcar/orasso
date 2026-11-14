// Lot C5 (D34) puis lot C6 : photos du seed. Priorité aux photos de Damien (`photos-seed/` à la racine du dépôt, ou le
// dossier de `PHOTOS_SEED_DIR`) pour les affiches ; sinon la sélection réelle de `assets/photos` (22 photos de
// JohnGRD Photographie, recompressées, sans EXIF). Préfixes : `event-` (scènes), `car-`, `moto-`, `detail-`.
// Toutes sont rendues en WebP (le pilote de stockage ne sert un `content-type` d'image que pour .webp).
import { createHash } from "node:crypto";
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

/**
 * 08/11 (seed en direct) : la `index`-ième photo de voiture relue « aucune plaque lisible » (`NO_PLATE_REVIEWED`), en
 * WebP, pour la donner au vrai service d'ajout de photo avec `noPlate: true`.
 */
export async function reviewedNoPlateCar(index: number): Promise<{ name: string; data: Buffer } | null> {
  const reviewed = (await realPool("car")).filter((p) => NO_PLATE_REVIEWED.has(p.name));
  return reviewed[index % Math.max(reviewed.length, 1)] ?? null;
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

/**
 * Vrai si ces octets sont l'ancien dégradé factice (`fakePhotoWebp`, posé en photo d'affiche avant le lot C5, D34). Preuve : une
 * image de 1200 × 800 dont (1) le coin bas droit est le gris de fin du dégradé (#17191c), (2) les rangées du haut et du bas, le
 * côté gauche, sont lisses (pas de grain : de pas en pas de 100 px, jamais plus de 18 d'écart par canal) et (3) les deux « roues »
 * (disques de rayon 70 centrés en (400, 590) et (800, 590)) sont du #0d0e10 uni. Une photo réelle (ou celle d'un organisateur,
 * même sombre, même 1200 × 800) n'a pas ces trois marques à la fois ; une image illisible n'en est pas une.
 */
export async function isLegacyFakePhoto(data: Buffer): Promise<boolean> {
  try {
    const meta = await sharp(data).metadata();
    if (meta.width !== 1200 || meta.height !== 800) return false;
    const { data: px, info } = await sharp(data).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const at = (x: number, y: number) => {
      const i = (y * info.width + x) * info.channels;
      return [px[i] ?? 0, px[i + 1] ?? 0, px[i + 2] ?? 0] as const;
    };
    const near = (a: readonly number[], b: readonly number[], tolerance: number) =>
      a.every((v, k) => Math.abs(v - (b[k] ?? 0)) <= tolerance);
    if (!near(at(1190, 790), [0x17, 0x19, 0x1c], 14)) return false;
    // Lisse : le dégradé varie d'au plus ~12 par canal en 100 px ; le grain d'une photo, bien plus.
    const line = (points: (readonly [number, number])[]) => {
      for (let k = 1; k < points.length; k++) {
        const [x0, y0] = points[k - 1] as readonly [number, number];
        const [x1, y1] = points[k] as readonly [number, number];
        if (!near(at(x0, y0), at(x1, y1), 18)) return false;
      }
      return true;
    };
    const across = (y: number) => Array.from({ length: 12 }, (_, k) => [k * 100, y] as const);
    const down = (x: number) => Array.from({ length: 8 }, (_, k) => [x, k * 100] as const);
    if (!line(across(5)) || !line(across(795)) || !line(down(5))) return false;
    return [
      [400, 590],
      [800, 590],
      [370, 590],
      [830, 590],
    ].every(([x, y]) => near(at(x as number, y as number), [0x0d, 0x0e, 0x10], 14));
  } catch {
    return false;
  }
}

/** Entier stable dérivé d'un slug (choix déterministe d'une photo ou d'un style : le même événement a toujours la même). */
export function slugIndex(slug: string, modulo: number): number {
  return modulo > 0 ? createHash("sha1").update(slug).digest().readUInt32BE(0) % modulo : 0;
}

/** Logo de MéditeSportCar (artefact DA v2), en WebP 512 px. */
export async function mscLogo(): Promise<Buffer> {
  return sharp(await readFile(join(ASSETS_DIR, "logo-msc.png")))
    .resize(512, 512, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 90 })
    .toBuffer();
}
