// Préparation d'une vidéo de story sur le site (lot R7g) : le navigateur ne compresse pas. Le fichier est vérifié **avant** l'envoi
// (poids, durée, H.264 : l'en-tête est lu par `readMp4` de `@orasso/shared`, quelques octets) pour ne pas envoyer 60 Mo qui
// seront refusés ; l'API reste juge et répond avec les mêmes mots. La première image (vignette) est prise par un `<canvas>`.
import {
  storyVideoLabels as L,
  type Mp4Info,
  mp4BlobSource,
  readMp4,
  STORY_POSTER_MAX_SIDE,
  storyVideoIssue,
} from "@orasso/shared";

export type StoryClip = {
  file: File;
  url: string;
  poster: File;
  posterUrl: string;
  width: number;
  height: number;
  durationMs: number;
};

/** Ce qui empêche d'envoyer ce fichier, avec la phrase à afficher, ou `null` (pur et testé). */
export function clipIssue(size: number, info: Mp4Info | null): string | null {
  const issue = storyVideoIssue({ sizeBytes: size, durationMs: info?.durationMs ?? null });
  if (issue === "empty") return L.empty;
  if (issue === "too_big") return L.tooBig;
  if (!info) return L.unreadable;
  if (issue === "too_long") return L.tooLong;
  if (!info.h264) return L.codec;
  return null;
}

/** Lit l'en-tête du fichier ; `null` s'il n'est pas un MP4 ou MOV lisible. */
export const probeClip = (file: File): Promise<Mp4Info | null> =>
  readMp4(mp4BlobSource(file)).then(
    (info) => info,
    () => null,
  );

/** Première image à 0,5 s par un `<canvas>` (JPEG, 1080 px au plus sur le grand côté). */
async function posterOf(url: string): Promise<{ blob: Blob; width: number; height: number }> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(new Error("illisible"));
  });
  const at = Math.min(0.5, Math.max(0, (video.duration || 1) / 2));
  await new Promise<void>((resolve) => {
    video.onseeked = () => resolve();
    video.currentTime = at;
  });
  const scale = Math.min(1, STORY_POSTER_MAX_SIDE / Math.max(video.videoWidth, video.videoHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  if (!blob) throw new Error("image impossible");
  return { blob, width: canvas.width, height: canvas.height };
}

/** Vérifie et prépare une vidéo choisie ; lève `ClipRefused` avec la phrase à afficher. */
export class ClipRefused extends Error {}
export async function prepareStoryClip(file: File): Promise<StoryClip> {
  const info = await probeClip(file);
  const issue = clipIssue(file.size, info);
  if (issue || !info) throw new ClipRefused(issue ?? L.unreadable);
  const url = URL.createObjectURL(file);
  try {
    const poster = await posterOf(url);
    const posterFile = new File([poster.blob], "poster.jpg", { type: "image/jpeg" });
    return {
      file,
      url,
      poster: posterFile,
      posterUrl: URL.createObjectURL(posterFile),
      width: info.width,
      height: info.height,
      durationMs: info.durationMs,
    };
  } catch {
    URL.revokeObjectURL(url);
    throw new ClipRefused(L.unreadable);
  }
}

export function releaseClip(clip: StoryClip) {
  URL.revokeObjectURL(clip.url);
  URL.revokeObjectURL(clip.posterUrl);
}
