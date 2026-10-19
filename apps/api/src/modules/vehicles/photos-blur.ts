// Floutage de plaque sur les photos du garage (lot 51, ARCHITECTURE-DA-V2 § 5.6, V9).
// Le flou est appliqué par l'API sur la photo stockée et il est irréversible : aucun original n'est gardé. L'appli
// propose les rectangles (détection locale ou cadre posé à la main) ; la personne les confirme avant l'envoi.
import { randomBytes } from "node:crypto";
import type { PlateRect, VehicleFull } from "@orasso/shared";
import { and, eq } from "drizzle-orm";
import sharp, { type OverlayOptions } from "sharp";

import { vehiclePhotos, vehicles } from "../../db/schema";
import { deps, now } from "../../lib/deps";
import { notFound } from "../../lib/errors";
import type { Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";
import { withTx } from "../../lib/tx";
import { vehiclesRepo } from "./repo";
import { vehicleFull } from "./serializers";

/**
 * La zone est réduite à une grille fixe, quelle que soit sa taille (une plaque prise de près fait 800 px) : 9 blocs
 * en largeur, 3 au plus en hauteur, soit moins d'un bloc par caractère ; puis agrandie au plus proche voisin et
 * floutée d'un rayon proportionnel à sa hauteur (`hauteur / 4`) : aucun caractère n'est récupérable.
 */
export const BLUR_COLUMNS = 9;
export const BLUR_ROWS = 3;
/** Garde-fou de décodage (images piégées) : 50 millions de pixels au plus (une photo de 48 Mpx passe). */
export const MAX_INPUT_PIXELS = 50_000_000;

type Box = { left: number; top: number; width: number; height: number };

/** Rectangle normalisé → pixels, borné à l'image (au moins 1 px). */
export function plateBox(r: PlateRect, width: number, height: number): Box {
  const left = Math.min(width - 1, Math.max(0, Math.floor(r.x * width)));
  const top = Math.min(height - 1, Math.max(0, Math.floor(r.y * height)));
  const right = Math.min(width, Math.max(left + 1, Math.ceil((r.x + r.w) * width)));
  const bottom = Math.min(height, Math.max(top + 1, Math.ceil((r.y + r.h) * height)));
  return { left, top, width: right - left, height: bottom - top };
}

/** Rayon du flou d'une zone : proportionnel à sa hauteur (borné aux limites de sharp). */
export const blurSigma = (box: Box): number => Math.min(1000, Math.max(0.3, box.height / 4));

/**
 * Floute chaque zone : grille fixe (`BLUR_COLUMNS` × `BLUR_ROWS`), agrandissement `nearest`, flou de rayon
 * `hauteur / 4`, composite. L'image n'est décodée qu'une fois (pixels bruts) ; elle doit déjà être orientée (photo
 * stockée, ou sortie de la recompression à l'envoi) ; sortie WebP comme à l'envoi.
 */
export async function blurPlateRegions(
  input: Buffer,
  rects: PlateRect[],
): Promise<{ data: Buffer; info: { width: number; height: number; size: number } }> {
  const decoded = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const raw = { width: decoded.info.width, height: decoded.info.height, channels: decoded.info.channels };
  const overlays: OverlayOptions[] = [];
  for (const r of rects) {
    const box = plateBox(r, raw.width, raw.height);
    const small = await sharp(decoded.data, { raw })
      .extract(box)
      .resize(Math.min(BLUR_COLUMNS, box.width), Math.min(BLUR_ROWS, box.height), { fit: "fill" })
      .png()
      .toBuffer();
    const blurred = await sharp(small)
      .resize(box.width, box.height, { fit: "fill", kernel: "nearest" })
      .blur(blurSigma(box))
      .png()
      .toBuffer();
    overlays.push({ input: blurred, left: box.left, top: box.top });
  }
  return sharp(decoded.data, { raw }).composite(overlays).webp({ quality: 80 }).toBuffer({ resolveWithObject: true });
}

/** Un rectangle déjà couvert par une zone floutée n'a rien à flouter de plus (envoi rejoué : idempotent). */
export function coveredBy(r: PlateRect, applied: PlateRect[]): boolean {
  const e = 1e-6;
  return applied.some(
    (a) => r.x >= a.x - e && r.y >= a.y - e && r.x + r.w <= a.x + a.w + e && r.y + r.h <= a.y + a.h + e,
  );
}

/**
 * Retire un fichier de photo devenu inutile (l'original non flouté, ou la copie d'un envoi refusé). Un échec ne fait
 * pas échouer la requête déjà validée : il est journalisé et la suppression est reprise par la tâche `storage.remove`.
 */
export async function removeOrRetry(key: string): Promise<void> {
  try {
    await storage.remove(key);
  } catch (error) {
    console.error("Suppression de photo à reprendre :", key, error);
    await deps.jobs.send("storage.remove", { key }, new Date(now().getTime() + 60_000)).catch(() => undefined);
  }
}

/** Tâche `storage.remove` : seules les photos de véhicules sont concernées. */
export async function retryRemove(key: string): Promise<void> {
  if (!/^vehicles\/[0-9a-f-]{36}\/[0-9a-f]{16}\.webp$/.test(key)) return;
  await storage.remove(key);
}

export const photoBlurService = {
  /**
   * Floute la plaque d'une photo déjà envoyée (propriétaire seulement). La photo est réécrite sous une nouvelle clé
   * (le cache du navigateur ne garde pas l'ancienne) et l'ancienne est supprimée.
   */
  async blur(v: Viewer, vehicleId: string, photoId: string, rects: PlateRect[]): Promise<VehicleFull> {
    const vehicle = await vehiclesRepo.byId(vehicleId);
    if (!vehicle || vehicle.ownerId !== v.user.id) throw notFound("Véhicule introuvable");
    const photos = await vehiclesRepo.photos(vehicleId);
    const photo = photos.find((p) => p.id === photoId);
    if (!photo) throw notFound("Photo introuvable");
    const applied = photo.plateRects ?? [];
    const todo = rects.filter((r) => !coveredBy(r, applied));
    if (todo.length) {
      const source = await storage.get(photo.storageKey);
      if (!source) throw notFound("Photo introuvable");
      const output = await blurPlateRegions(source, todo);
      const key = `vehicles/${vehicleId}/${randomBytes(8).toString("hex")}.webp`;
      await storage.put(key, output.data);
      let replaced = false;
      try {
        await withTx(async (tx) => {
          // Deux floutages simultanés de la même photo : le second repart de la clé écrite par le premier.
          const [current] = await tx
            .select({ storageKey: vehiclePhotos.storageKey })
            .from(vehiclePhotos)
            .where(and(eq(vehiclePhotos.id, photoId), eq(vehiclePhotos.vehicleId, vehicleId)))
            .for("update");
          if (!current || current.storageKey !== photo.storageKey)
            throw notFound("Photo modifiée entre-temps, réessaie");
          await tx
            .update(vehiclePhotos)
            .set({
              storageKey: key,
              width: output.info.width,
              height: output.info.height,
              bytes: output.info.size,
              plateRects: [...applied, ...todo],
              plateBlurred: true,
            })
            .where(eq(vehiclePhotos.id, photoId));
          // La fiche Instagram (cache par `updated_at`) doit être refaite avec la photo floutée.
          await tx.update(vehicles).set({ updatedAt: now() }).where(eq(vehicles.id, vehicleId));
        });
        replaced = true;
      } finally {
        await removeOrRetry(replaced ? photo.storageKey : key);
      }
    }
    const row = await vehiclesRepo.findFullById(vehicleId);
    if (!row) throw notFound("Véhicule introuvable");
    return vehicleFull(row);
  },
};
