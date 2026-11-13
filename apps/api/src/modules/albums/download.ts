// « Enregistrer » une photo d'album (lot R9f, T39) : `GET /album-photos/:id/download` rend le fichier de la photo **avec le crédit
// du média incrusté** (« Photos : <média> », en bas à gauche, comme la signature d'un fichier qui sort d'Orasso). Refusé (403) si le
// média n'a pas autorisé l'enregistrement (`allow_save`) ou si la personne n'est pas identifiée sur la photo ; le média auteur peut
// toujours. Sans dépendance native : l'appli passe par la feuille de partage du système, le site par un téléchargement. Compté par
// la limite `albumDownload` seulement (jamais qui a téléchargé quoi dans une réponse ni dans un journal).
import { albumCreditLine, albumTagLabels, canSavePhoto, type PlateRect } from "@orasso/shared";
import { and, eq, isNull, sql } from "drizzle-orm";
import sharp from "sharp";

import { db } from "../../db/client";
import { eventAlbumPhotos } from "../../db/schema";
import { AppError, forbidden, notFound } from "../../lib/errors";
import { rateLimit } from "../../lib/rateLimit";
import type { Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";
import { textLine } from "../events/poster/text";
import { blurPlateRegions, MAX_INPUT_PIXELS } from "../vehicles/photos-blur";
import { visibleAlbum } from "./tag-visibility";

const CREAM = "#f3ebdd";

/** Le crédit en pastille sombre, en bas à gauche, proportionnée à la photo (jamais coupée). */
export async function withCredit(image: Buffer, mediaName: string): Promise<Buffer> {
  const meta = await sharp(image, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width < 1 || height < 1) throw new Error("Image illisible");
  const size = Math.max(22, Math.round(width * 0.03));
  const margin = Math.round(size * 0.8);
  const padX = Math.round(size * 0.7);
  const padY = Math.round(size * 0.42);
  const label = await textLine(albumCreditLine(mediaName), {
    font: "bold",
    size,
    color: CREAM,
    keepCase: true,
    maxWidth: Math.max(40, width - margin * 2 - padX * 2),
  });
  const w = Math.ceil(label.width + padX * 2);
  const h = Math.ceil(label.cap + padY * 2);
  const pill = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" rx="${Math.round(h / 2.4)}" fill="#0b0c0e" fill-opacity=".66"/></svg>`,
  );
  const left = margin;
  const top = Math.max(0, height - margin - h);
  return sharp(image, { limitInputPixels: MAX_INPUT_PIXELS })
    .composite([
      { input: pill, left, top },
      { input: label.data, left: left + padX, top: Math.round(top + padY - label.capTop) },
    ])
    .webp({ quality: 88 })
    .toBuffer();
}

export const albumDownload = {
  async photo(v: Viewer, photoId: string): Promise<{ data: Buffer; type: string; name: string }> {
    rateLimit("albumDownload", v.user.id);
    const [photo] = await db
      .select()
      .from(eventAlbumPhotos)
      .where(and(eq(eventAlbumPhotos.id, photoId.toLowerCase()), isNull(eventAlbumPhotos.deletedAt)));
    if (!photo) throw notFound(albumTagLabels.errors.photoNotFound);
    const join = await visibleAlbum(db, v, photo.albumId);
    const isMediaAuthor = join.m.userId === v.user.id;
    if (!isMediaAuthor) {
      // Identifié sur cette photo (voiture ou pseudo), compte en règle.
      const res = await db.execute(sql`select 1 from album_photo_tags t join profiles p on p.user_id = t.user_id
        where t.photo_id = ${photo.id} and t.user_id = ${v.user.id} and t.removed_at is null
          and p.deleted_at is null and p.banned_at is null limit 1`);
      if (!res.rows.length) throw forbidden(albumTagLabels.errors.notIdentified);
    }
    if (!canSavePhoto({ allowSave: join.a.allowSave, isMediaAuthor })) {
      throw new AppError(403, "save_not_allowed", albumTagLabels.errors.saveNotAllowed);
    }
    // Tout fichier qui sort d'Orasso a ses plaques floutées : `kept` est flouté avec les cadres gardés, `unknown` (ancienne galerie,
    // plaque jamais regardée) est refusé.
    if (photo.plateState === "unknown") {
      throw new AppError(409, "plate_unknown", albumTagLabels.errors.saveUnknownPlate);
    }
    const stored = await storage.get(photo.storageKey);
    if (!stored) throw notFound(albumTagLabels.errors.photoNotFound);
    const file =
      photo.plateState === "kept" && photo.plateRects?.length
        ? (await blurPlateRegions(stored, photo.plateRects as PlateRect[])).data
        : stored;
    return {
      data: await withCredit(file, join.m.name),
      type: "image/webp",
      name: `orasso-photo-${photo.id.slice(0, 8)}.webp`,
    };
  },
};
