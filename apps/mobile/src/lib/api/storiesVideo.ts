// Envoi d'une vidéo de story (lot R7g, tour 2) : le fichier **brut** vers `POST /me/uploads/story-video` (`Content-Type:
// video/mp4`, `Content-Length` posé par le système), jamais en multipart : le serveur l'écrit en flux sur son disque, sans le
// garder en mémoire. Sur téléphone, `UploadTask` d'expo-file-system (envoi natif d'un fichier du disque : taille connue, progression
// réelle en octets, le fichier ne passe pas par le JavaScript) ; dans le navigateur, `XMLHttpRequest` avec un `Blob`. Mêmes
// en-têtes que le client ordinaire (jeton de session). Aucune file locale : sans réseau, l'envoi échoue et l'écran le dit.
import { STORY_VIDEO_UPLOAD_PATH, type UploadResult } from "@orasso/shared";
import { File as DeviceFile, UploadTask, UploadType } from "expo-file-system";
import { Platform } from "react-native";

import { apiUrl } from "@/api";
import { ApiRequestError, getSessionToken, NETWORK_MESSAGE, request } from "../http";

/** Dix minutes : 60 Mo sur une connexion de parking (mobile, une barre) peuvent être longs ; la progression reste affichée. */
const VIDEO_TIMEOUT_MS = 10 * 60_000;

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

/** Navigateur (recettes web de l'appli) : un `Blob` en corps brut, `Content-Length` calculé par le navigateur. */
async function uploadInBrowser(
  uri: string,
  onProgress: (ratio: number) => void,
  timeoutMs: number,
): Promise<UploadResult> {
  const blob = await (await fetch(uri)).blob();
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", apiUrl(STORY_VIDEO_UPLOAD_PATH));
    const token = getSessionToken();
    if (token) xhr.setRequestHeader("authorization", `Bearer ${token}`);
    xhr.setRequestHeader("content-type", "video/mp4");
    xhr.timeout = timeoutMs;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress(Math.min(1, e.loaded / e.total));
    };
    xhr.onload = () => {
      try {
        resolve(parseResponse(xhr.status, xhr.responseText));
      } catch (error) {
        reject(error);
      }
    };
    xhr.onerror = () => reject(networkError());
    xhr.ontimeout = () => reject(networkError());
    xhr.onabort = () => reject(networkError());
    xhr.send(blob);
  });
}

/** Téléphone : envoi natif du fichier (`BINARY_CONTENT` = corps brut), progression en octets. */
async function uploadOnDevice(
  uri: string,
  onProgress: (ratio: number) => void,
  timeoutMs: number,
): Promise<UploadResult> {
  const token = getSessionToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
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
      throw networkError();
    } finally {
      task.release();
    }
    return parseResponse(res.status, res.body);
  } finally {
    clearTimeout(timer);
  }
}

export function uploadVideoFile(
  uri: string,
  onProgress: (ratio: number) => void,
  timeoutMs = VIDEO_TIMEOUT_MS,
): Promise<UploadResult> {
  return Platform.OS === "web"
    ? uploadInBrowser(uri, onProgress, timeoutMs)
    : uploadOnDevice(uri, onProgress, timeoutMs);
}

export const storiesVideoApi = {
  /** Vidéo envoyée : vérifiée par le serveur (conteneur, H.264, 31 s au plus) ; `durationMs` y est lue. */
  uploadStoryVideo: (uri: string, onProgress: (ratio: number) => void) => uploadVideoFile(uri, onProgress),
  /** Vignette (petite image) : un envoi ordinaire. */
  uploadStoryPoster: (form: FormData) =>
    request<UploadResult>("/api/me/uploads", { method: "POST", form, timeout: 60_000 }),
};
