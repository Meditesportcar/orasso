// Envoi d'une vidéo de story (lot R7g) : `POST /me/uploads` (purpose `story_video`, 60 Mo au plus) avec sa progression réelle
// (octets partis, `XMLHttpRequest` : `fetch` n'en donne pas), puis la vignette (`story_poster`). Même en-têtes que le client
// ordinaire (jeton de session). Aucune file locale : sans réseau, l'envoi échoue et l'écran le dit.
import type { UploadResult } from "@orasso/shared";

import { apiUrl } from "@/api";
import { ApiRequestError, getSessionToken, NETWORK_MESSAGE, request } from "../http";

/** Dix minutes : 60 Mo sur une connexion de parking (mobile, une barre) peuvent être longs ; la progression reste affichée. */
const VIDEO_TIMEOUT_MS = 10 * 60_000;

export function uploadWithProgress(
  form: FormData,
  onProgress: (ratio: number) => void,
  timeoutMs = VIDEO_TIMEOUT_MS,
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", apiUrl("/api/me/uploads"));
    const token = getSessionToken();
    if (token) xhr.setRequestHeader("authorization", `Bearer ${token}`);
    xhr.timeout = timeoutMs;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress(Math.min(1, e.loaded / e.total));
    };
    xhr.onload = () => {
      let json: unknown = null;
      try {
        json = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        json = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(json as UploadResult);
      const api = (json as { error?: { code?: string; message?: string; details?: Record<string, unknown> } } | null)
        ?.error;
      reject(
        new ApiRequestError(xhr.status, api?.code ?? "internal", api?.message ?? `Erreur ${xhr.status}`, api?.details),
      );
    };
    const failed = () => reject(new ApiRequestError(0, "network", NETWORK_MESSAGE));
    xhr.onerror = failed;
    xhr.ontimeout = failed;
    xhr.onabort = failed;
    xhr.send(form);
  });
}

export const storiesVideoApi = {
  /** Vidéo envoyée : vérifiée par le serveur (conteneur, H.264, 31 s au plus) ; `durationMs` y est lue. */
  uploadStoryVideo: (form: FormData, onProgress: (ratio: number) => void) => uploadWithProgress(form, onProgress),
  /** Vignette (petite image) : un envoi ordinaire. */
  uploadStoryPoster: (form: FormData) =>
    request<UploadResult>("/api/me/uploads", { method: "POST", form, timeout: 60_000 }),
};
