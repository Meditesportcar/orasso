// Envoi d'une vidéo de story (lot R7g, tour 2) : le fichier **brut** vers `POST /me/uploads/story-video` (`Content-Type:
// video/mp4`, `Content-Length` posé par le système), jamais en multipart : le serveur l'écrit en flux sur son disque, sans le
// garder en mémoire. Sur téléphone, `UploadTask` d'expo-file-system (envoi natif d'un fichier du disque : taille connue, progression
// réelle en octets, le fichier ne passe pas par le JavaScript) ; dans le navigateur, `XMLHttpRequest` avec un `Blob`. Mêmes
// en-têtes que le client ordinaire (jeton de session). Aucune file locale : sans réseau, l'envoi échoue et l'écran le dit.
import {
  STORY_VIDEO_UPLOAD_PATH,
  STORY_VIDEO_UPLOAD_TIMEOUT_MS,
  storyVideoLabels,
  type UploadResult,
} from "@orasso/shared";
import { File as DeviceFile, UploadTask, UploadType } from "expo-file-system";
import { Platform } from "react-native";

import { apiUrl } from "@/api";
import { ApiRequestError, getSessionToken, NETWORK_MESSAGE, request } from "../http";

/** Dix minutes (le même délai que l'API et Nginx) : 60 Mo sur une connexion de parking peuvent être longs ; la progression reste affichée. */
const VIDEO_TIMEOUT_MS = STORY_VIDEO_UPLOAD_TIMEOUT_MS;

/** Réponse de l'API : un succès rend le résultat, un refus devient l'erreur de l'API (code, message en français). */
function parseResponse(status: number, text: string): UploadResult {
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (status >= 200 && status < 300) return json as UploadResult;
  const api = (json as { error?: { code?: string; message?: string; details?: Record<string, unknown> } } | null)
    ?.error;
  throw new ApiRequestError(status, api?.code ?? "internal", api?.message ?? `Erreur ${status}`, api?.details);
}

const networkError = () => new ApiRequestError(0, "network", NETWORK_MESSAGE);
/** Délai dépassé : son propre message (la connexion est là, elle est trop lente), pas « Pas de connexion ». */
const timeoutError = () => new ApiRequestError(0, "timeout", storyVideoLabels.uploadTimeout);
/** Envoi abandonné par l'appli elle-même (écran quitté) : personne n'a de message à lire. */
const cancelledError = () => new ApiRequestError(0, "cancelled", "Envoi annulé");
export const isUploadCancelled = (error: unknown) => error instanceof ApiRequestError && error.code === "cancelled";
export const isUploadTimeout = (error: unknown) => error instanceof ApiRequestError && error.code === "timeout";

/** Navigateur (recettes web de l'appli) : un `Blob` en corps brut, `Content-Length` calculé par le navigateur. */
async function uploadInBrowser(
  uri: string,
  onProgress: (ratio: number) => void,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<UploadResult> {
  if (signal?.aborted) throw cancelledError();
  const blob = await (await fetch(uri)).blob();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(cancelledError());
    const xhr = new XMLHttpRequest();
    let cancelled = false;
    const onAbort = () => {
      cancelled = true;
      xhr.abort();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    const done = () => signal?.removeEventListener("abort", onAbort);
    xhr.open("POST", apiUrl(STORY_VIDEO_UPLOAD_PATH));
    const token = getSessionToken();
    if (token) xhr.setRequestHeader("authorization", `Bearer ${token}`);
    xhr.setRequestHeader("content-type", "video/mp4");
    xhr.timeout = timeoutMs;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress(Math.min(1, e.loaded / e.total));
    };
    xhr.onload = () => {
      done();
      try {
        resolve(parseResponse(xhr.status, xhr.responseText));
      } catch (error) {
        reject(error);
      }
    };
    xhr.onerror = () => {
      done();
      reject(networkError());
    };
    xhr.ontimeout = () => {
      done();
      reject(timeoutError());
    };
    xhr.onabort = () => {
      done();
      reject(cancelled ? cancelledError() : networkError());
    };
    xhr.send(blob);
  });
}

/** Téléphone : envoi natif du fichier (`BINARY_CONTENT` = corps brut), progression en octets. */
async function uploadOnDevice(
  uri: string,
  onProgress: (ratio: number) => void,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<UploadResult> {
  if (signal?.aborted) throw cancelledError();
  const token = getSessionToken();
  const controller = new AbortController();
  let timedOut = false;
  let cancelled = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  // Écran quitté : l'envoi natif s'arrête (le fichier n'est plus envoyé, le serveur coupe et efface le morceau reçu).
  const onAbort = () => {
    cancelled = true;
    controller.abort();
  };
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const task = new UploadTask(new DeviceFile(uri), apiUrl(STORY_VIDEO_UPLOAD_PATH), {
      httpMethod: "POST",
      uploadType: UploadType.BINARY_CONTENT,
      mimeType: "video/mp4",
      headers: { "content-type": "video/mp4", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      onProgress: ({ bytesSent, totalBytes }) => {
        if (totalBytes > 0) onProgress(Math.min(1, bytesSent / totalBytes));
      },
      signal: controller.signal,
    });
    let res: Awaited<ReturnType<UploadTask["uploadAsync"]>>;
    try {
      res = await task.uploadAsync();
    } catch {
      throw cancelled ? cancelledError() : timedOut ? timeoutError() : networkError();
    } finally {
      task.release();
    }
    return parseResponse(res.status, res.body);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

export function uploadVideoFile(
  uri: string,
  onProgress: (ratio: number) => void,
  timeoutMs = VIDEO_TIMEOUT_MS,
  signal?: AbortSignal,
): Promise<UploadResult> {
  return Platform.OS === "web"
    ? uploadInBrowser(uri, onProgress, timeoutMs, signal)
    : uploadOnDevice(uri, onProgress, timeoutMs, signal);
}

export const storiesVideoApi = {
  /** Vidéo envoyée : vérifiée par le serveur (conteneur, H.264, 31 s au plus) ; `durationMs` y est lue. */
  uploadStoryVideo: (uri: string, onProgress: (ratio: number) => void, signal?: AbortSignal) =>
    uploadVideoFile(uri, onProgress, VIDEO_TIMEOUT_MS, signal),
  /** Vignette (petite image) : un envoi ordinaire. */
  uploadStoryPoster: (form: FormData) =>
    request<UploadResult>("/api/me/uploads", { method: "POST", form, timeout: 60_000 }),
};
