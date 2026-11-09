// Choisir ou filmer une vidéo de story et la rendre envoyable (lot R7g, décision de Damien du 09/11 : une vidéo est publiée
// telle quelle, sans floutage de plaque, et compressée **sur le téléphone** avant l'envoi). Le même parcours pour la galerie
// et pour l'appareil : lire l'en-tête du fichier, refuser ce qui est trop long, compresser en H.264 720p ce qui est trop lourd
// ou n'est pas en H.264 (HEVC d'un iPhone), prendre la première image, vérifier le poids final.
import {
  storyVideoLabels as L,
  STORY_VIDEO_LIMIT_MS,
  STORY_VIDEO_MAX_BYTES,
  storyVideoIssue,
  storyVideoNeedsCompression,
} from "@orasso/shared";
import * as ImagePicker from "expo-image-picker";

import { canCompress, compressVideo, fileSize, posterOf, probeVideo } from "./storyVideoPlatform";
import { discardTempPhotos, rememberTempPhotos } from "./tempPhotos";

export type PickedVideo = {
  /** Le fichier à envoyer (le compressé, s'il y en a un). */
  uri: string;
  width: number;
  height: number;
  durationMs: number;
  sizeBytes: number;
  /** La première image (fichier d'image) : envoyée comme vignette, et fond de l'aperçu. */
  posterUri: string;
  /** Vrai si la vidéo a été recompressée sur le téléphone. */
  compressed: boolean;
};

export type VideoStage = "reading" | "compressing";

/** Refus lisible (la phrase est affichée telle quelle). */
export class VideoRefused extends Error {}

/**
 * Prépare le fichier `uri` (galerie ou appareil). `hint` : ce que le sélecteur ou l'appareil sait déjà (durée en ms,
 * dimensions) quand l'en-tête du fichier ne se lit pas.
 */
export async function prepareStoryVideo(
  uri: string,
  hint: { durationMs?: number | null; width?: number | null; height?: number | null },
  onStage: (stage: VideoStage, ratio?: number) => void,
  alive: () => boolean = () => true,
): Promise<PickedVideo> {
  const noted: string[] = [];
  const note = (u: string) => {
    noted.push(u);
    rememberTempPhotos(u);
  };
  try {
    onStage("reading");
    const first = await probeVideo(uri);
    const sizeBefore = await fileSize(uri);
    const durationBefore = first?.durationMs ?? hint.durationMs ?? null;
    if (durationBefore !== null && durationBefore > STORY_VIDEO_LIMIT_MS) throw new VideoRefused(L.tooLong);
    if (sizeBefore === 0) throw new VideoRefused(L.empty);

    let finalUri = uri;
    let compressed = false;
    if (storyVideoNeedsCompression({ sizeBytes: sizeBefore, h264: first ? first.h264 : null })) {
      // Pas de compression (navigateur de recette) : on dit ce qui ne va pas, comme le site.
      if (!canCompress) throw new VideoRefused(!first ? L.unreadable : !first.h264 ? L.codec : L.tooBigApp);
      onStage("compressing", 0);
      try {
        finalUri = await compressVideo(uri, (ratio) => alive() && onStage("compressing", ratio));
      } catch {
        // Aucun outil fiable (ou échec) : une vidéo déjà en H.264 et assez légère part telle quelle, sinon on refuse.
        if (!(first?.h264 && sizeBefore !== null && sizeBefore <= STORY_VIDEO_MAX_BYTES)) {
          const heavy = sizeBefore !== null && sizeBefore > STORY_VIDEO_MAX_BYTES;
          throw new VideoRefused(heavy ? L.tooBigApp : L.compressFailed);
        }
      }
      if (finalUri !== uri) {
        note(finalUri);
        compressed = true;
      }
    }
    if (!alive()) throw new VideoRefused("");

    const info = (finalUri === uri ? first : await probeVideo(finalUri)) ?? first;
    const sizeBytes = (await fileSize(finalUri)) ?? sizeBefore ?? 0;
    const durationMs = info?.durationMs ?? durationBefore ?? 0;
    const issue = storyVideoIssue({ sizeBytes, durationMs });
    if (issue === "too_big") throw new VideoRefused(L.tooBigApp);
    if (issue === "too_long") throw new VideoRefused(L.tooLong);
    if (issue === "empty") throw new VideoRefused(L.empty);
    if (info && !info.h264) throw new VideoRefused(L.codec);

    const poster = await posterOf(finalUri);
    note(poster.uri);
    return {
      uri: finalUri,
      width: info?.width ?? hint.width ?? poster.width,
      height: info?.height ?? hint.height ?? poster.height,
      durationMs,
      sizeBytes,
      posterUri: poster.uri,
      compressed,
    };
  } catch (e) {
    discardTempPhotos(noted);
    throw e;
  }
}

/** Le sélecteur de la galerie (une vidéo, 30 s au plus). `null` : annulé. Jamais d'accès à la galerie sans ce geste. */
export async function pickGalleryVideo(
  onStage: (stage: VideoStage, ratio?: number) => void,
  alive?: () => boolean,
): Promise<PickedVideo | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["videos"],
    allowsMultipleSelection: false,
    // iOS : le système exporte lui-même en H.264 720p (le HEVC d'un iPhone n'arrive jamais jusqu'ici).
    videoExportPreset: ImagePicker.VideoExportPreset.H264_1280x720,
    videoMaxDuration: STORY_VIDEO_LIMIT_MS / 1000,
  });
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;
  return prepareStoryVideo(
    asset.uri,
    { durationMs: asset.duration ?? null, width: asset.width, height: asset.height },
    onStage,
    alive,
  );
}
