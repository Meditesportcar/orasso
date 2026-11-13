// Photos d'un album (lot R9e) : l'ajout (une photo à la fois, T31), la décision de plaque gardée (T32) et le service du fichier.
//
// Ajout : l'envoi (`POST /me/uploads purpose=album_photo`, rectangles floutés à l'envoi si le média le demande) est consommé dans la
// transaction, le fichier est **copié** sous `private/albums/<albumId>/<hex>.webp` (le stockage n'a pas de déplacement ; l'envoi
// d'origine est effacé après la validation). Le plafond (200) et la position se tiennent sous le verrou de l'album : deux ajouts
// simultanés ne passent pas tous deux la 200e place. Un rejeu (`clientId`) rend la même photo.
import { randomBytes } from "node:crypto";
import {
  ALBUM_MAX_PHOTOS,
  type AlbumPhotoAdd,
  type AlbumPhotoView,
  albumLabels,
  canAddPhoto,
  type PlateRect,
  plateStateOf,
} from "@orasso/shared";
import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { eventAlbumPhotos, eventAlbums } from "../../db/schema";
import { AppError, conflict, notFound, validation } from "../../lib/errors";
import type { Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";
import { withTx } from "../../lib/tx";
import { UUID_RE } from "../feed/access";
import { uploadsService } from "../uploads/service";
import { blurPlateRegions, removeOrRetry } from "../vehicles/photos-blur";
import { assertAccredited, assertWritable, lockOwnAlbum, requireMedia } from "./guards";
import { ALBUM_PHOTO_NAME_RE, ALBUM_UPLOAD_FOLDER, albumPhotoKey, loadAlbum, photoView } from "./view";

/** `POST /me/albums/:id/photos` : ajoute une photo. `created: false` pour un rejeu. */
export async function addPhoto(
  v: Viewer,
  albumId: string,
  input: AlbumPhotoAdd,
): Promise<{ photo: AlbumPhotoView; created: boolean }> {
  assertWritable(v);
  const written: string[] = [];
  try {
    const done = await withTx(async (tx) => {
      const profile = await requireMedia(tx, v);
      const album = await lockOwnAlbum(tx, albumId, profile.id);
      // Rejeu : le même `clientId` rend la même photo (sans rien consommer, sans compter dans le plafond).
      const [again] = await tx
        .select()
        .from(eventAlbumPhotos)
        .where(and(eq(eventAlbumPhotos.albumId, album.id), eq(eventAlbumPhotos.clientId, input.clientId)));
      if (again) {
        if (again.deletedAt) throw conflict("conflict", albumLabels.photoNotFound);
        return { photo: again, source: null };
      }
      await assertAccredited(tx, album.eventId, profile.id);
      if (!canAddPhoto(album.photosCount).ok) {
        throw new AppError(409, "album_full", albumLabels.full(ALBUM_MAX_PHOTOS));
      }
      // L'envoi doit être une photo d'album de cette personne : jamais la clé d'un autre fichier.
      if (!input.uploadKey.startsWith(ALBUM_UPLOAD_FOLDER)) throw validation(albumLabels.imageUnknown);
      const upload = await uploadsService.consume(tx, v.user.id, input.uploadKey, "album_photo");
      if (!upload) throw validation(albumLabels.imageUnknown);
      const source = await storage.get(upload.key);
      if (!source) throw validation(albumLabels.imageUnknown);
      const rects = (input.plateRects ?? []) as PlateRect[];
      // « Floutée » : le serveur floute lui-même les cadres reçus sur la copie (l'envoi l'a déjà fait, mais la décision ne
      // repose jamais sur ce que dit le client) ; « telle quelle » et « aucune plaque » : la copie est l'image envoyée.
      let data = source;
      let width = upload.width;
      let height = upload.height;
      if (input.plateDecision === "blurred") {
        const blurred = await blurPlateRegions(source, rects);
        data = blurred.data;
        width = blurred.info.width;
        height = blurred.info.height;
      }
      const key = albumPhotoKey(album.id, randomBytes(16).toString("hex"));
      await storage.put(key, data);
      written.push(key);
      const [next] = await tx
        .select({ n: sql<number>`coalesce(max(${eventAlbumPhotos.position}), -1) + 1` })
        .from(eventAlbumPhotos)
        .where(and(eq(eventAlbumPhotos.albumId, album.id), isNull(eventAlbumPhotos.deletedAt)));
      const [photo] = await tx
        .insert(eventAlbumPhotos)
        .values({
          albumId: album.id,
          storageKey: key,
          width,
          height,
          position: next?.n ?? 0,
          plateState: plateStateOf(input.plateDecision),
          plateRects: input.plateDecision === "none" ? null : rects,
          clientId: input.clientId,
        })
        .returning();
      if (!photo) throw new Error("Photo non enregistrée");
      await tx
        .update(eventAlbums)
        .set({ photosCount: sql`${eventAlbums.photosCount} + 1` })
        .where(eq(eventAlbums.id, album.id));
      return { photo, source: upload.key };
    });
    if (done.source) await removeOrRetry(done.source);
    return { photo: photoView(albumId, done.photo), created: done.source !== null };
  } catch (error) {
    for (const key of written) await removeOrRetry(key);
    throw error;
  }
}

// --- Le fichier -----------------------------------------------------------------------------------------------------------

export type PhotoFile = { status: 304; etag: string } | { status: 200; etag: string; data: Buffer };

/**
 * `GET /albums/:id/photos/:nom` (membre : le média voit aussi ses brouillons) et `GET /public/albums/:id/photos/:nom` (sans
 * session : seulement un album publié et visible de tous). 404 pour tout le reste, sans dire pourquoi. Le fichier ne change jamais
 * sous une même clé : son nom sert d'`ETag`.
 */
export async function photoFile(
  albumId: string,
  name: string,
  viewerId: string | null,
  at: Date,
  ifNoneMatch: string | undefined,
  publicOnly: boolean,
): Promise<PhotoFile> {
  if (!UUID_RE.test(albumId) || !ALBUM_PHOTO_NAME_RE.test(name)) throw notFound(albumLabels.photoNotFound);
  const join = await loadAlbum(db, albumId, viewerId, at, publicOnly);
  if (!join) throw notFound(albumLabels.photoNotFound);
  const [photo] = await db
    .select({ key: eventAlbumPhotos.storageKey })
    .from(eventAlbumPhotos)
    .where(
      and(
        eq(eventAlbumPhotos.albumId, albumId),
        isNull(eventAlbumPhotos.deletedAt),
        sql`right(${eventAlbumPhotos.storageKey}, ${name.length + 1}) = ${`/${name}`}`,
      ),
    );
  if (!photo) throw notFound(albumLabels.photoNotFound);
  const etag = `"${name.slice(0, -".webp".length)}"`;
  const sent = (ifNoneMatch ?? "").split(",").map((t) => t.trim().replace(/^W\//, ""));
  if (sent.includes(etag)) return { status: 304, etag };
  const data = await storage.get(photo.key);
  if (!data) throw notFound(albumLabels.photoNotFound);
  return { status: 200, etag, data };
}
