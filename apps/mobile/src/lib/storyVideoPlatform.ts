// Ce que « une vidéo de story » demande au système (lot R7g), version téléphone : lire l'en-tête du fichier (codec, durée,
// dimensions : `readMp4` de `@orasso/shared`, quelques octets seulement), le recompresser en H.264 720p
// (`react-native-compressor`, Nitro, nouvelle architecture), en tirer la première image (`expo-video-thumbnails`).
// La version du navigateur de recette est `storyVideoPlatform.web.ts` (mêmes noms).
import { type Mp4Info, readMp4, STORY_VIDEO_BITRATE, STORY_VIDEO_SHORT_SIDE } from "@orasso/shared";
import { File } from "expo-file-system";
import { getThumbnailAsync } from "expo-video-thumbnails";
import { Video } from "react-native-compressor";

/** Taille du fichier en octets, `null` s'il n'est pas lisible. */
export function fileSize(uri: string): Promise<number | null> {
  try {
    return Promise.resolve(new File(uri).size ?? null);
  } catch {
    return Promise.resolve(null);
  }
}

/** Ce que l'en-tête du fichier dit (H.264 ou non, durée, dimensions) ; `null` si le conteneur n'est pas lisible. */
export async function probeVideo(uri: string): Promise<Mp4Info | null> {
  let handle: ReturnType<File["open"]> | null = null;
  try {
    const file = new File(uri);
    const opened = file.open();
    handle = opened;
    const size = opened.size ?? file.size ?? 0;
    return await readMp4({
      size,
      read: async (offset, length) => {
        opened.offset = offset;
        return opened.readBytes(Math.min(length, Math.max(0, size - offset)));
      },
    });
  } catch {
    return null;
  } finally {
    try {
      handle?.close();
    } catch {
      // Ignoré : un fichier déjà fermé.
    }
  }
}

/** Recompresse en H.264, 720p (petit côté), environ 3,5 Mb/s ; la position du téléphone et la date ne sont pas recopiées. */
export function compressVideo(uri: string, onProgress: (ratio: number) => void): Promise<string> {
  return Video.compress(
    uri,
    {
      compressionMethod: "manual",
      // `maxSize` = le grand côté : 1280 pour un 720 × 1280.
      maxSize: Math.round((STORY_VIDEO_SHORT_SIDE * 16) / 9),
      bitrate: STORY_VIDEO_BITRATE,
      minimumFileSizeForCompress: 0,
      preserveMetadata: false,
    },
    onProgress,
  );
}

/** La première image (à 0,5 s : jamais une image noire de début de prise), en fichier d'image du cache. */
export async function posterOf(uri: string): Promise<{ uri: string; width: number; height: number }> {
  try {
    return await getThumbnailAsync(uri, { time: 500, quality: 0.85 });
  } catch {
    return getThumbnailAsync(uri, { time: 0, quality: 0.85 });
  }
}
