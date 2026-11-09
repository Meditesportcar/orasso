// Stories vidéo (lot R7g, décision de Damien du 09/11 : pas de floutage de plaque pour les vidéos, plus de ffmpeg sur le
// serveur) : les limites et les règles pures que l'API, l'appli et le site partagent. Le serveur vérifie le conteneur
// (`apps/api/src/lib/mp4.ts`) ; l'appli compresse en H.264 720p avant l'envoi ; le site contrôle poids et durée dans le
// navigateur et laisse l'API juger le codec.

/** Poids d'une vidéo envoyée : 60 Mo (la vidéo sort déjà compressée du téléphone, environ 3,5 Mb/s ≈ 13 Mo pour 30 s). */
export const STORY_VIDEO_MAX_BYTES = 60 * 1024 * 1024;
/** Durée d'une story vidéo, telle que l'appli la propose (arrêt automatique de la prise de vue) : 30 s. */
export const STORY_VIDEO_MAX_MS = 30_000;
/** Ce que le serveur et les écrans tolèrent (arrondis des conteneurs et des lecteurs) : 31 s. */
export const STORY_VIDEO_LIMIT_MS = 31_000;
/** Compression sur le téléphone : petit côté, débit visé (bits/s). */
export const STORY_VIDEO_SHORT_SIDE = 720;
export const STORY_VIDEO_BITRATE = 3_500_000;
/** Vignette d'une vidéo : côté le plus long (le serveur la recompresse en WebP). */
export const STORY_POSTER_MAX_SIDE = 1080;
/** Un fichier reçu doit avoir au moins cette durée (anti-fichier vide). */
export const STORY_VIDEO_MIN_MS = 300;
/** Au plus ce nombre d'envois de 60 Mo en même temps sur le serveur (mémoire de l'API). */
export const STORY_VIDEO_UPLOADS_MAX_PARALLEL = 2;

export type StoryVideoIssue = "too_big" | "too_long" | "empty";

/**
 * Ce qui empêche d'envoyer cette vidéo, vu depuis l'appareil ou le navigateur (poids du fichier, durée lue par le
 * lecteur). `null` : on peut l'envoyer ; le serveur vérifie quand même (conteneur, codec, durée).
 */
export function storyVideoIssue(v: { sizeBytes: number | null; durationMs: number | null }): StoryVideoIssue | null {
  if (v.sizeBytes !== null && v.sizeBytes <= 0) return "empty";
  if (v.sizeBytes !== null && v.sizeBytes > STORY_VIDEO_MAX_BYTES) return "too_big";
  if (v.durationMs !== null && v.durationMs > STORY_VIDEO_LIMIT_MS) return "too_long";
  return null;
}

/** Hauteur / largeur d'un 9:16, avec 2 % de tolérance (720 × 1280, 1080 × 1920, 1080 × 1950 d'un téléphone). */
const RATIO_916 = 16 / 9;

/**
 * Comment une vidéo se pose dans le cadre 9:16 : `full` (elle le remplit), `blurred` (posée au centre sur sa vignette
 * floutée, à l'affichage : le fichier n'est jamais modifié). Dimensions inconnues : `full`.
 */
export function storyVideoLayout(width: number | null, height: number | null): "full" | "blurred" {
  if (!width || !height || width <= 0 || height <= 0) return "full";
  return Math.abs(height / width - RATIO_916) / RATIO_916 <= 0.02 ? "full" : "blurred";
}

/** « 0:07 » : le compteur d'une prise de vue ou d'une vidéo. */
export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Part jouée (0 à 1) de la barre de lecture d'une vidéo : `currentTime / duration`, bornée, 0 sans durée. */
export function videoProgress(currentSeconds: number, durationSeconds: number): number {
  if (!Number.isFinite(currentSeconds) || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0;
  return Math.min(1, Math.max(0, currentSeconds / durationSeconds));
}

/**
 * Une vidéo de la galerie doit être compressée avant l'envoi : trop lourde, ou pas en H.264 (HEVC d'un iPhone). Le codec
 * d'un fichier de la galerie n'est connu que du système ; `h264` à `null` (inconnu) compresse par prudence.
 */
export function storyVideoNeedsCompression(v: { sizeBytes: number | null; h264: boolean | null }): boolean {
  return v.h264 !== true || v.sizeBytes === null || v.sizeBytes > STORY_VIDEO_MAX_BYTES / 2;
}
