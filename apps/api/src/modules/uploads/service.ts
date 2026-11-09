// Envoi de fichiers générique (ARCHITECTURE-SUITE § 0.3, lot 18) : une image décodée et recompressée par le serveur
// (le type annoncé et l'extension ne comptent pas), nom de fichier tiré par le serveur, clé privée pour les images de
// message, d'incident et de rapport (jamais servies par `/api/files`). Le fichier attend d'être rattaché (une seule
// fois, par son auteur) ; ceux jamais rattachés sont effacés après 24 h.
import { randomUUID } from "node:crypto";
import {
  MEDIA_GALLERY_MAX_PHOTOS,
  type PlateRect,
  privateUploadPurposes,
  STORY_VIDEO_LIMIT_MS,
  STORY_VIDEO_MAX_BYTES,
  STORY_VIDEO_MIN_MS,
  STORY_VIDEO_UPLOADS_MAX_PARALLEL,
  storyVideoLabels,
  type UploadPurpose,
  type UploadResult,
} from "@orasso/shared";
import { and, count, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import sharp from "sharp";

import { uploads } from "../../db/schema";
import { now } from "../../lib/deps";
import { AppError, forbidden, notFound, validation } from "../../lib/errors";
import { Mp4Error, readMp4File } from "../../lib/mp4";
import { rateLimit } from "../../lib/rateLimit";
import type { Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";
import { type Tx, withTx } from "../../lib/tx";
import { requireAnnouncementUploader } from "../communication/guards";
import { blurPlateRegions } from "../vehicles/photos-blur";

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
/** Fichiers envoyés mais pas encore rattachés, par personne (bornés sous verrou). */
export const MAX_PENDING_UPLOADS = MEDIA_GALLERY_MAX_PHOTOS + 10;
/** Un fichier jamais rattaché est effacé après ce délai. */
export const PENDING_UPLOAD_TTL_MS = 24 * 3_600_000;
/** Formats lus (décodage réel par sharp, pas l'extension). */
const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp", "heif"]);
/** Au-delà, l'image n'est pas décodée (bombe de décompression). */
const MAX_INPUT_PIXELS = 50_000_000;

const SIZE: Record<UploadPurpose, number> = {
  message: 1600,
  crew_logo: 512,
  incident: 1600,
  report: 1600,
  provider_photo: 1600,
  announcement: 1600,
  media_logo: 512,
  media_content: 1600,
  event_poster_photo: 2000,
  // Lot R5c1 (D36) : côté le plus long, format d'origine gardé (jamais de carré).
  crew_post: 2048,
  // Lot R7e1 : photo du Fil, 1080 × 1350 en 4:5 (côté le plus long 1350 ; le 1:1 et le paysage tiennent dans la boîte).
  feed_post: 1350,

  // Lot R7f1 : photo de story, côté le plus long 2048, aucun recadrage (la composition 9:16 se fait dans `stories/compose.ts`).
  story: 2048,
  story_video: 0,
  // Lot R7g : première image d'une vidéo, 1080 de côté au plus (le serveur la recompresse en WebP).
  story_poster: 1080,
};
const FOLDER: Record<UploadPurpose, string> = {
  message: "messages",
  crew_logo: "crew-logos",
  incident: "incidents",
  report: "reports",
  provider_photo: "provider-photos",
  announcement: "announcements",
  media_logo: "media-logos",
  media_content: "media-contents",
  event_poster_photo: "event-poster-photos",
  crew_post: "crew-posts",
  feed_post: "feed-posts",

  story: "story-uploads",
  story_video: "story-videos",
  story_poster: "story-posters",
};
/** Extension du fichier rangé : la vidéo reste un MP4, tout le reste est recompressé en WebP. */
const extOf = (purpose: UploadPurpose) => (purpose === "story_video" ? "mp4" : "webp");

/** Surface maximale d'une vidéo (un 4K) : au-delà, le téléphone d'un spectateur ne la lirait pas. */
const VIDEO_MAX_PIXELS = 4096 * 2304;
/** Envois de vidéos en cours (chacun pèse sur la mémoire de l'API : au plus `STORY_VIDEO_UPLOADS_MAX_PARALLEL`). */
let videoUploadsRunning = 0;

export const isPrivatePurpose = (purpose: UploadPurpose) => privateUploadPurposes.includes(purpose);

/** Image décodée, tournée selon l'EXIF, métadonnées retirées, réduite et en WebP ; 415 si ce n'est pas une image. */
async function toWebp(input: Buffer, purpose: UploadPurpose) {
  try {
    const meta = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
    if (!meta.format || !ACCEPTED_FORMATS.has(meta.format)) throw new Error("format");
    const side = SIZE[purpose];
    return await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize(side, side, {
        fit: purpose === "crew_logo" || purpose === "media_logo" ? "cover" : "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new AppError(415, "unsupported_media_type", "Image illisible (JPEG, PNG, WebP ou HEIC)");
  }
}

/** Fichiers en attente de plus de 24 h : lignes supprimées, clés rendues (fichiers effacés après la validation). */
async function purgeExpired(tx: Tx, userId: string): Promise<string[]> {
  const rows = await tx
    .delete(uploads)
    .where(
      and(
        eq(uploads.userId, userId),
        isNull(uploads.consumedAt),
        lt(uploads.createdAt, new Date(now().getTime() - PENDING_UPLOAD_TTL_MS)),
      ),
    )
    .returning({ key: uploads.key });
  return rows.map((r) => r.key);
}

/**
 * Enregistre un fichier envoyé (déjà sur le disque) : verrou par personne, purge des envois périmés, plafond d'envois en
 * attente. Refus : le fichier est effacé, rien ne reste orphelin.
 */
async function register(
  v: Viewer,
  key: string,
  purpose: UploadPurpose,
  info: { width: number; height: number; bytes: number },
): Promise<void> {
  let expired: string[] = [];
  try {
    await withTx(async (tx) => {
      // Verrou par personne : le plafond de fichiers en attente tient face à des envois simultanés.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`uploads:${v.user.id}`}))`);
      expired = await purgeExpired(tx, v.user.id);
      const [pending] = await tx
        .select({ n: count() })
        .from(uploads)
        .where(and(eq(uploads.userId, v.user.id), isNull(uploads.consumedAt)));
      if ((pending?.n ?? 0) >= MAX_PENDING_UPLOADS) {
        throw new AppError(429, "rate_limited", "Trop de fichiers en attente d'envoi : réessaie plus tard.");
      }
      await tx.insert(uploads).values({
        key,
        userId: v.user.id,
        purpose,
        width: info.width,
        height: info.height,
        bytes: info.bytes,
      });
    });
  } catch (error) {
    // Rien en base : le fichier écrit ne doit pas rester orphelin.
    await storage.remove(key).catch(() => undefined);
    throw error;
  }
  for (const old of expired) await storage.remove(old).catch(() => undefined);
}

export const uploadsService = {
  async upload(v: Viewer, purpose: UploadPurpose, file: File, plateRects?: PlateRect[]): Promise<UploadResult> {
    if (v.profile.suspendedUntil && v.profile.suspendedUntil > now()) {
      throw forbidden("Ton compte est suspendu : lecture seule.");
    }
    rateLimit(
      purpose === "media_content"
        ? "mediaFileUpload"
        : purpose === "crew_post"
          ? "crewPhotoUpload"
          : purpose === "feed_post"
            ? "feedPhotoUpload"
            : purpose === "story_video" || purpose === "story_poster"
              ? "storyVideoUpload"
              : "fileUpload",
      v.user.id,
    );
    // Photo d'annonce (lot 20) : seulement un organisateur qui peut publier.
    if (purpose === "announcement") await requireAnnouncementUploader(v);
    if (file.size === 0) throw validation("Fichier vide");
    if (purpose === "story_video") return uploadsService.uploadVideo(v, file);
    if (file.size > MAX_UPLOAD_BYTES) throw new AppError(413, "payload_too_large", "Image de 15 Mo au plus");
    const webp = await toWebp(Buffer.from(await file.arrayBuffer()), purpose);
    // Lot 57 (D28) : plaques floutées sur l'image recompressée, avant tout stockage (aucun original gardé).
    const image = plateRects?.length ? await blurPlateRegions(webp.data, plateRects) : webp;
    const folder = FOLDER[purpose];
    const id = randomUUID();
    const key = `${isPrivatePurpose(purpose) ? "private/" : ""}${folder}/${id}.webp`;
    await storage.put(key, image.data);
    await register(v, key, purpose, { width: image.info.width, height: image.info.height, bytes: image.info.size });
    return { id, key, width: image.info.width, height: image.info.height };
  },

  /**
   * Lot R7g : une vidéo de story. Le fichier va sur le disque sans tampon de plus, puis le lecteur de conteneur
   * (`lib/mp4.ts`, sans ffmpeg) vérifie le format MP4/MOV, la durée (31 s au plus), le codec (H.264) et les dimensions. Un
   * fichier refusé est effacé tout de suite. Rien n'est décodé ni transformé : la vidéo est servie telle que l'appareil l'a
   * produite (décision de Damien du 09/11 : pas de floutage de plaque pour les vidéos).
   */
  async uploadVideo(v: Viewer, file: File): Promise<UploadResult> {
    if (file.size > STORY_VIDEO_MAX_BYTES) {
      throw new AppError(
        413,
        "payload_too_large",
        "Vidéo de 60 Mo au plus : envoie-la depuis l'appli, elle la compresse.",
      );
    }
    if (videoUploadsRunning >= STORY_VIDEO_UPLOADS_MAX_PARALLEL) {
      throw new AppError(429, "rate_limited", storyVideoLabels.apiBusy);
    }
    videoUploadsRunning++;
    const id = randomUUID();
    const key = `private/${FOLDER.story_video}/${id}.mp4`;
    try {
      await storage.putStream(key, file.stream());
      try {
        const info = await readMp4File(storage.localPath(key));
        if (!info.h264) throw new AppError(400, "codec", storyVideoLabels.apiCodec);
        if (info.durationMs > STORY_VIDEO_LIMIT_MS) throw new AppError(400, "too_long", storyVideoLabels.apiTooLong);
        if (info.durationMs < STORY_VIDEO_MIN_MS) throw validation(storyVideoLabels.apiUnreadable);
        if (info.width * info.height > VIDEO_MAX_PIXELS) {
          throw validation("Définition trop grande : 4K au plus. Envoie-la depuis l'appli, elle la compresse.");
        }
        await register(v, key, "story_video", { width: info.width, height: info.height, bytes: file.size });
        return { id, key, width: info.width, height: info.height, durationMs: info.durationMs };
      } catch (error) {
        await storage.remove(key).catch(() => undefined);
        if (error instanceof Mp4Error) {
          throw new AppError(
            415,
            "unsupported_media_type",
            error.kind === "no_video" ? storyVideoLabels.apiNoVideo : storyVideoLabels.apiUnreadable,
          );
        }
        throw error;
      }
    } finally {
      videoUploadsRunning--;
    }
  },

  /** UUID déjà présent dans le nom du fichier : aucune colonne ni migration nécessaire. */
  async remove(v: Viewer, id: string): Promise<void> {
    const keys = (Object.entries(FOLDER) as [UploadPurpose, string][]).map(
      ([purpose, folder]) => `${isPrivatePurpose(purpose) ? "private/" : ""}${folder}/${id}.${extOf(purpose)}`,
    );
    await withTx(async (tx) => {
      // Même verrou que l'envoi ; DELETE et consume se départagent aussi par le verrou de ligne PostgreSQL.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`uploads:${v.user.id}`}))`);
      const [row] = await tx
        .select()
        .from(uploads)
        .where(and(inArray(uploads.key, keys), eq(uploads.userId, v.user.id), isNull(uploads.consumedAt)))
        .for("update");
      if (!row) throw notFound("Envoi introuvable");
      await storage.remove(row.key);
      await tx.delete(uploads).where(eq(uploads.key, row.key));
    });
  },

  /**
   * Tâche quotidienne `uploads.purge` : tout fichier jamais rattaché depuis plus de 24 h disparaît (enregistrement puis
   * fichier), quel que soit son auteur. Rend le nombre de fichiers effacés.
   */
  async purgeExpired(): Promise<number> {
    const rows = await withTx((tx) =>
      tx
        .delete(uploads)
        .where(
          and(isNull(uploads.consumedAt), lt(uploads.createdAt, new Date(now().getTime() - PENDING_UPLOAD_TTL_MS))),
        )
        .returning({ key: uploads.key }),
    );
    for (const r of rows) await storage.remove(r.key).catch(() => undefined);
    return rows.length;
  },

  /**
   * Rattache un fichier à son usage, dans la transaction de l'appelant : seulement par son auteur, pour l'usage prévu,
   * une seule fois. `null` si la clé ne convient pas.
   */
  async consume(tx: Tx, userId: string, key: string, purpose: UploadPurpose) {
    const [row] = await tx
      .update(uploads)
      .set({ consumedAt: now() })
      .where(
        and(eq(uploads.key, key), eq(uploads.userId, userId), eq(uploads.purpose, purpose), isNull(uploads.consumedAt)),
      )
      .returning();
    return row ?? null;
  },
};
