// Stories vidéo (lot R7g) : préparation d'une publication dont le média est une vidéo déjà envoyée (`story_video`) avec sa
// vignette (`story_poster`). Rien n'est transformé : la vidéo est publiée **telle quelle** (décision de Damien du 09/11, pas
// de floutage de plaque pour les vidéos, plus de ffmpeg sur le serveur). Le fichier est vérifié une seconde fois par le lecteur
// de conteneur, puis copié sous la story ; les envois d'origine sont effacés après la publication par l'appelant.
import { randomBytes } from "node:crypto";
import {
  STORY_VIDEO_LIMIT_MS,
  type StoryCreated,
  type StoryPlateState,
  storyVideoLabels,
  type UploadPurpose,
} from "@orasso/shared";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "../../db/client";
import { uploads } from "../../db/schema";
import { AppError, validation } from "../../lib/errors";
import { Mp4Error, readMp4File } from "../../lib/mp4";
import type { Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";
import { removeOrRetry } from "../vehicles/photos-blur";

/** Ce qu'une publication a besoin de savoir de son média, photo ou vidéo. */
export type Prepared = {
  mediaKind: "photo" | "video";
  key: string;
  posterKey: string | null;
  width: number;
  height: number;
  durationMs: number | null;
  plateState: StoryPlateState;
  /** Envois d'origine à rattacher dans la transaction puis à effacer après la publication. */
  sent: { key: string; purpose: UploadPurpose }[];
};

const pendingOf = async (userId: string, key: string, purpose: UploadPurpose) => {
  const [row] = await db
    .select()
    .from(uploads)
    .where(
      and(eq(uploads.key, key), eq(uploads.userId, userId), eq(uploads.purpose, purpose), isNull(uploads.consumedAt)),
    );
  return row ?? null;
};

export async function prepareVideo(
  v: Viewer,
  input: { uploadKey: string; posterKey: string },
  storyId: string,
  replay: () => Promise<StoryCreated | null>,
): Promise<Prepared | { replayed: StoryCreated }> {
  const video = await pendingOf(v.user.id, input.uploadKey, "story_video");
  const poster = await pendingOf(v.user.id, input.posterKey, "story_poster");
  // Un envoi presque simultané peut arriver après l'enregistrement du premier (fichiers consommés) : on retrouve alors sa story.
  const missing = async (message: string) => {
    const won = await replay();
    if (won) return { replayed: won };
    throw validation(message);
  };
  if (!video) return missing("Vidéo inconnue ou déjà utilisée : envoie-la à nouveau.");
  if (!poster) return missing(storyVideoLabels.apiPosterMissing);
  if ((await storage.size(video.key)) === null) return missing("Vidéo introuvable : envoie-la à nouveau.");
  if ((await storage.size(poster.key)) === null) return missing(storyVideoLabels.apiPosterMissing);

  // Seconde lecture du conteneur (en-têtes seulement) : la durée vient du fichier, jamais du client.
  let info: Awaited<ReturnType<typeof readMp4File>>;
  try {
    info = await readMp4File(storage.localPath(video.key));
  } catch (error) {
    if (error instanceof Mp4Error) {
      throw new AppError(415, "unsupported_media_type", storyVideoLabels.apiUnreadable);
    }
    throw error;
  }
  if (!info.h264) throw new AppError(400, "codec", storyVideoLabels.apiCodec);
  if (info.durationMs > STORY_VIDEO_LIMIT_MS) throw new AppError(400, "too_long", storyVideoLabels.apiTooLong);

  const dir = `private/stories/${storyId}`;
  const key = `${dir}/${randomBytes(8).toString("hex")}.mp4`;
  const posterKey = `${dir}/${randomBytes(8).toString("hex")}.webp`;
  try {
    await storage.copy(video.key, key);
    await storage.copy(poster.key, posterKey);
  } catch (error) {
    await removeOrRetry(key);
    await removeOrRetry(posterKey);
    throw error;
  }
  return {
    mediaKind: "video",
    key,
    posterKey,
    width: info.width,
    height: info.height,
    durationMs: info.durationMs,
    plateState: "not_required",
    sent: [
      { key: video.key, purpose: "story_video" },
      { key: poster.key, purpose: "story_poster" },
    ],
  };
}
