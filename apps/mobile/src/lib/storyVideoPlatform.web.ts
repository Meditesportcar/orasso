// Version du navigateur de recette de `storyVideoPlatform.ts` (lot R7g) : l'en-tête est lu sur le fichier (`File.slice`), la
// première image est prise par un `<canvas>` à 0,5 s. Il n'y a pas de compression dans le navigateur : une vidéo qui n'est pas
// en H.264 ou trop lourde est refusée avec « envoie-la depuis l'appli » (`storyVideo.ts`).
import { type Mp4Info, mp4BlobSource, readMp4 } from "@orasso/shared";

async function blobOf(uri: string): Promise<Blob> {
  return (await fetch(uri)).blob();
}

export async function fileSize(uri: string): Promise<number | null> {
  try {
    return (await blobOf(uri)).size;
  } catch {
    return null;
  }
}

export async function probeVideo(uri: string): Promise<Mp4Info | null> {
  try {
    return await readMp4(mp4BlobSource(await blobOf(uri)));
  } catch {
    return null;
  }
}

export function compressVideo(_uri: string, _onProgress: (ratio: number) => void): Promise<string> {
  return Promise.reject(new Error("Pas de compression dans le navigateur"));
}

/** Première image par un `<canvas>` (fichier image en mémoire, adresse `blob:`). */
export async function posterOf(uri: string): Promise<{ uri: string; width: number; height: number }> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = uri;
  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(new Error("Vidéo illisible"));
  });
  const at = Math.min(0.5, Math.max(0, (video.duration || 1) / 2));
  await new Promise<void>((resolve) => {
    video.onseeked = () => resolve();
    video.currentTime = at;
  });
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, 1080 / Math.max(video.videoWidth, video.videoHeight));
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  if (!blob) throw new Error("Image impossible");
  return { uri: URL.createObjectURL(blob), width: canvas.width, height: canvas.height };
}
