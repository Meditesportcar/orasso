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
  STORY_VIDEO_PENDING_MAX_BYTES,
  STORY_VIDEO_UPLOADS_MAX_PARALLEL,
  storyVideoLabels,
  type UploadPurpose,
  type UploadResult,
} from "@orasso/shared";
import { and, count, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import sharp from "sharp";

import { uploads } from "../../db/schema";
import { now } from "../../lib/deps";
import { AppError, forbidden, notFound, validation } from "../../lib/errors";
import { Mp4Error, mp4ErrorMessage, readMp4File, stripMp4Metadata } from "../../lib/mp4";
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
  // Lot R9e : photo d'album d'un média, côté le plus long 1600 comme `media_content`.
  album_photo: 1600,
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
  album_photo: "album-uploads",
};
/** Extension du fichier rangé : la vidéo reste un MP4, tout le reste est recompressé en WebP. */
const extOf = (purpose: UploadPurpose) => (purpose === "story_video" ? "mp4" : "webp");

/** Surface maximale d'une vidéo (un 4K) : au-delà, le téléphone d'un spectateur ne la lirait pas. */
const VIDEO_MAX_PIXELS = 4096 * 2304;
/**
 * Envois de vidéos en cours (chacun écrit un fichier de 60 Mo au plus, en flux : le corps ne passe jamais en mémoire). Au plus
 * `STORY_VIDEO_UPLOADS_MAX_PARALLEL` en tout, un seul par personne ; la place est prise **avant** de lire le corps et rendue
 * dans un `finally`.
 */
let videoUploadsRunning = 0;
const videoUploaders = new Set<string>();

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
      if (purpose === "story_video") {
        const [sum] = await tx
          .select({ bytes: sql<number>`coalesce(sum(${uploads.bytes}), 0)::float8` })
          .from(uploads)
          // Seuls les envois vidéo en attente comptent (pas les photos), comme dans `assertVideoRoom`.
          .where(and(eq(uploads.userId, v.user.id), eq(uploads.purpose, "story_video"), isNull(uploads.consumedAt)));
        if ((sum?.bytes ?? 0) + info.bytes > STORY_VIDEO_PENDING_MAX_BYTES) {
          throw new AppError(429, "rate_limited", storyVideoLabels.apiPendingFull);
        }
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

/**
 * Refus avant toute lecture du corps : cette personne garde déjà trop d'octets de vidéos non publiées (les envois de plus
 * de 24 h ne comptent plus : la tâche `uploads.purge` et `register` les effacent). `register` refait le calcul sous verrou.
 */
async function assertVideoRoom(userId: string, incoming: number): Promise<void> {
  const [sum] = await withTx((tx) =>
    tx
      .select({ bytes: sql<number>`coalesce(sum(${uploads.bytes}), 0)::float8` })
      .from(uploads)
      .where(
        and(
          eq(uploads.userId, userId),
          // Seuls les envois vidéo en attente comptent (les photos ont leur propre plafond de fichiers).
          eq(uploads.purpose, "story_video"),
          isNull(uploads.consumedAt),
          gte(uploads.createdAt, new Date(now().getTime() - PENDING_UPLOAD_TTL_MS)),
        ),
      ),
  );
  if ((sum?.bytes ?? 0) + incoming > STORY_VIDEO_PENDING_MAX_BYTES) {
    throw new AppError(429, "rate_limited", storyVideoLabels.apiPendingFull);
  }
}

export const uploadsService = {
  async upload(v: Viewer, purpose: UploadPurpose, file: File, plateRects?: PlateRect[]): Promise<UploadResult> {
    if (v.profile.suspendedUntil && v.profile.suspendedUntil > now()) {
      throw forbidden("Ton compte est suspendu : lecture seule.");
    }
    rateLimit(
      purpose === "media_content"
        ? "mediaFileUpload"
        : purpose === "album_photo"
          ? "albumPhotoUpload"
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
    // Les vidéos arrivent brutes par `POST /me/uploads/story-video` (jamais en multipart : le corps serait lu en mémoire).
    if (purpose === "story_video") throw validation(storyVideoLabels.apiWrongType);
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
   * Lot R7g (tour 2) : une vidéo de story, reçue **brute** (`POST /me/uploads/story-video`, `Content-Type: video/mp4`,
   * `Content-Length` obligatoire et 60 Mo au plus). Rien n'est lu avant que les garde-fous aient parlé : limite de débit,
   * place dans les envois en cours (6 en tout, 1 par personne, libérée dans un `finally`) et plafond d'octets en attente.
   * Le corps va ensuite sur le disque **en flux**, compté octet par octet (plus long ou plus court que `Content-Length` :
   * refus, fichier effacé) : la mémoire de l'API ne porte jamais plus que quelques morceaux. Puis le lecteur de conteneur
   * (`lib/mp4.ts`, sans ffmpeg) vérifie le format, la durée, le codec et les dimensions, et les boîtes qui peuvent porter la
   * position GPS ou l'appareil (`udta`, `meta`, `uuid`) sont neutralisées dans le fichier avant l'enregistrement. Rien n'est
   * décodé ni transformé (décision de Damien du 09/11 : pas de floutage de plaque pour les vidéos).
   */
  async uploadStoryVideo(v: Viewer, req: Request): Promise<UploadResult> {
    if (v.profile.suspendedUntil && v.profile.suspendedUntil > now()) {
      throw forbidden("Ton compte est suspendu : lecture seule.");
    }
    const type = (req.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase();
    if (type !== "video/mp4" && type !== "video/quicktime") {
      throw new AppError(415, "unsupported_media_type", storyVideoLabels.apiWrongType);
    }
    const header = req.headers.get("content-length")?.trim() ?? "";
    if (!/^\d{1,12}$/.test(header)) throw new AppError(411, "validation_error", storyVideoLabels.apiLengthRequired);
    const declared = Number(header);
    if (declared === 0) throw validation("Fichier vide");
    if (declared > STORY_VIDEO_MAX_BYTES) {
      throw new AppError(
        413,
        "payload_too_large",
        "Vidéo de 60 Mo au plus : envoie-la depuis l'appli, elle la compresse.",
      );
    }
    if (!req.body) throw validation(storyVideoLabels.apiBadBody);
    rateLimit("storyVideoUpload", v.user.id);
    await assertVideoRoom(v.user.id, declared);
    if (videoUploadsRunning >= STORY_VIDEO_UPLOADS_MAX_PARALLEL || videoUploaders.has(v.user.id)) {
      throw new AppError(429, "rate_limited", storyVideoLabels.apiBusy);
    }
    videoUploadsRunning++;
    videoUploaders.add(v.user.id);
    const id = randomUUID();
    const key = `private/${FOLDER.story_video}/${id}.mp4`;
    try {
      let seen = 0;
      let badLength = false;
      const counted = req.body.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller) {
            seen += chunk.byteLength;
            if (seen > declared) {
              badLength = true;
              throw new Error("corps plus long que Content-Length");
            }
            controller.enqueue(chunk);
          },
          flush() {
            if (seen !== declared) {
              badLength = true;
              throw new Error("corps plus court que Content-Length");
            }
          },
        }),
      );
      try {
        await storage.putStream(key, counted);
      } catch (error) {
        // `putStream` a déjà effacé le fichier partiel.
        if (badLength) throw validation(storyVideoLabels.apiBadBody);
        throw error;
      }
      try {
        const path = storage.localPath(key);
        const info = await readMp4File(path);
        if (!info.h264) throw new AppError(400, "codec", storyVideoLabels.apiCodec);
        if (info.durationMs > STORY_VIDEO_LIMIT_MS) throw new AppError(400, "too_long", storyVideoLabels.apiTooLong);
        if (info.durationMs < STORY_VIDEO_MIN_MS) throw validation(storyVideoLabels.apiUnreadable);
        if (info.width * info.height > VIDEO_MAX_PIXELS) {
          throw validation("Définition trop grande : 4K au plus. Envoie-la depuis l'appli, elle la compresse.");
        }
        // Lieu, appareil, auteur : effacés du fichier lui-même (même taille, le reste se lit comme avant).
        await stripMp4Metadata(path);
        await register(v, key, "story_video", { width: info.width, height: info.height, bytes: declared });
        return { id, key, width: info.width, height: info.height, durationMs: info.durationMs };
      } catch (error) {
        await storage.remove(key).catch(() => undefined);
        if (error instanceof Mp4Error) {
          throw new AppError(415, "unsupported_media_type", mp4ErrorMessage(error));
        }
        throw error;
      }
    } finally {
      videoUploadsRunning--;
      videoUploaders.delete(v.user.id);
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
