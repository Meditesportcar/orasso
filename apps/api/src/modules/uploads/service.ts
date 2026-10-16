// Envoi de fichiers générique (ARCHITECTURE-SUITE § 0.3, lot 18) : une image décodée et recompressée par le serveur
// (le type annoncé et l'extension ne comptent pas), nom de fichier tiré par le serveur, clé privée pour les images de
// message, d'incident et de rapport (jamais servies par `/api/files`). Le fichier attend d'être rattaché (une seule
// fois, par son auteur) ; ceux jamais rattachés sont effacés après 24 h.
import { randomUUID } from "node:crypto";
import { privateUploadPurposes, type UploadPurpose, type UploadResult } from "@orasso/shared";
import { and, count, eq, isNull, lt, sql } from "drizzle-orm";
import sharp from "sharp";

import { uploads } from "../../db/schema";
import { now } from "../../lib/deps";
import { AppError, forbidden, validation } from "../../lib/errors";
import { rateLimit } from "../../lib/rateLimit";
import type { Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";
import { type Tx, withTx } from "../../lib/tx";

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
/** Fichiers envoyés mais pas encore rattachés, par personne (bornés sous verrou). */
export const MAX_PENDING_UPLOADS = 20;
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
};
const FOLDER: Record<UploadPurpose, string> = {
  message: "messages",
  crew_logo: "crew-logos",
  incident: "incidents",
  report: "reports",
  provider_photo: "provider-photos",
  announcement: "announcements",
};

export const isPrivatePurpose = (purpose: UploadPurpose) => privateUploadPurposes.includes(purpose);

/** Image décodée, tournée selon l'EXIF, métadonnées retirées, réduite et en WebP ; 415 si ce n'est pas une image. */
async function toWebp(input: Buffer, purpose: UploadPurpose) {
  try {
    const meta = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
    if (!meta.format || !ACCEPTED_FORMATS.has(meta.format)) throw new Error("format");
    const side = SIZE[purpose];
    return await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize(side, side, { fit: purpose === "crew_logo" ? "cover" : "inside", withoutEnlargement: true })
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

export const uploadsService = {
  async upload(v: Viewer, purpose: UploadPurpose, file: File): Promise<UploadResult> {
    if (v.profile.suspendedUntil && v.profile.suspendedUntil > now()) {
      throw forbidden("Ton compte est suspendu : lecture seule.");
    }
    rateLimit("fileUpload", v.user.id);
    if (file.size === 0) throw validation("Fichier vide");
    if (file.size > MAX_UPLOAD_BYTES) throw new AppError(413, "payload_too_large", "Image de 15 Mo au plus");
    const image = await toWebp(Buffer.from(await file.arrayBuffer()), purpose);
    const folder = FOLDER[purpose];
    const key = `${isPrivatePurpose(purpose) ? "private/" : ""}${folder}/${randomUUID()}.webp`;
    let expired: string[] = [];
    await storage.put(key, image.data);
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
          width: image.info.width,
          height: image.info.height,
          bytes: image.info.size,
        });
      });
    } catch (error) {
      // Rien en base : le fichier écrit ne doit pas rester orphelin.
      await storage.remove(key).catch(() => undefined);
      throw error;
    }
    for (const old of expired) await storage.remove(old).catch(() => undefined);
    return { key, width: image.info.width, height: image.info.height };
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
