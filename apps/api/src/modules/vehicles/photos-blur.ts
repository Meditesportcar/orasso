// Floutage de plaque sur les photos du garage (lot 51, ARCHITECTURE-DA-V2 § 5.6, V9).
// Le flou est appliqué par l'API sur la photo stockée et il est irréversible : aucun original n'est gardé. L'appli
// propose les rectangles (détection locale ou cadre posé à la main) ; la personne les confirme avant l'envoi.
import { randomBytes } from "node:crypto";
import type { PlateRect, VehicleFull } from "@orasso/shared";
import { and, eq } from "drizzle-orm";
import sharp, { type OverlayOptions } from "sharp";

import { vehiclePhotos, vehicles } from "../../db/schema";
import { now } from "../../lib/deps";
import { notFound } from "../../lib/errors";
import type { Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";
import { withTx } from "../../lib/tx";
import { vehiclesRepo } from "./repo";
import { vehicleFull } from "./serializers";

/** Facteur de pixellisation : la zone est réduite 12 fois puis agrandie au plus proche voisin. */
const PIXEL_FACTOR = 12;
const BLUR_SIGMA = 8;

type Box = { left: number; top: number; width: number; height: number };

/** Rectangle normalisé → pixels, borné à l'image (au moins 1 px). */
export function plateBox(r: PlateRect, width: number, height: number): Box {
  const left = Math.min(width - 1, Math.max(0, Math.floor(r.x * width)));
  const top = Math.min(height - 1, Math.max(0, Math.floor(r.y * height)));
  const right = Math.min(width, Math.max(left + 1, Math.ceil((r.x + r.w) * width)));
  const bottom = Math.min(height, Math.max(top + 1, Math.ceil((r.y + r.h) * height)));
  return { left, top, width: right - left, height: bottom - top };
}

/**
 * Pixellise puis floute chaque zone (extract → réduction ×12 → agrandissement `nearest` → `blur(8)` → composite).
 * L'image d'entrée doit déjà être orientée (photo stockée) ; sortie WebP comme à l'envoi.
 */
export async function blurPlateRegions(
  input: Buffer,
  rects: PlateRect[],
): Promise<{ data: Buffer; info: { width: number; height: number; size: number } }> {
  const base = sharp(input);
  const meta = await base.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const overlays: OverlayOptions[] = [];
  for (const r of rects) {
    const box = plateBox(r, width, height);
    const region = await sharp(input).extract(box).toBuffer();
    const small = await sharp(region)
      .resize(Math.max(1, Math.round(box.width / PIXEL_FACTOR)), Math.max(1, Math.round(box.height / PIXEL_FACTOR)), {
        fit: "fill",
      })
      .toBuffer();
    const pixelated = await sharp(small)
      .resize(box.width, box.height, { fit: "fill", kernel: "nearest" })
      .blur(BLUR_SIGMA)
      .toBuffer();
    overlays.push({ input: pixelated, left: box.left, top: box.top });
  }
  return base.composite(overlays).webp({ quality: 80 }).toBuffer({ resolveWithObject: true });
}

/** Un rectangle déjà couvert par une zone floutée n'a rien à flouter de plus (envoi rejoué : idempotent). */
export function coveredBy(r: PlateRect, applied: PlateRect[]): boolean {
  const e = 1e-6;
  return applied.some(
    (a) => r.x >= a.x - e && r.y >= a.y - e && r.x + r.w <= a.x + a.w + e && r.y + r.h <= a.y + a.h + e,
  );
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
        await storage.remove(replaced ? photo.storageKey : key);
      }
    }
    const row = await vehiclesRepo.findFullById(vehicleId);
    if (!row) throw notFound("Véhicule introuvable");
    return vehicleFull(row);
  },
};
