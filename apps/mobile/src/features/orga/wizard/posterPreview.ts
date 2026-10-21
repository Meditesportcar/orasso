// Aperçu de l'affiche dans l'appli (lot 53) : `POST /posters/preview` rend un PNG (rien n'est écrit) ; on le montre
// par une adresse `data:` (le client JSON de l'appli ne lit pas les images).
import type { PosterFormat, PosterSettings } from "@orasso/shared";
import { Platform } from "react-native";

import { apiUrl } from "@/api";
import { authOriginHeader } from "@/lib/api/cookies";
import { getSessionToken } from "@/lib/http";

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Octets → base64 (sans dépendance : `btoa` manque sur certains moteurs). */
export function toBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    const n = (a << 16) | (b << 8) | c;
    out += B64[(n >> 18) & 63];
    out += B64[(n >> 12) & 63];
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63] : "=";
    out += i + 2 < bytes.length ? B64[n & 63] : "=";
  }
  return out;
}

export type PreviewInput = PosterSettings & {
  date: string;
  place: string;
  structureName: string;
  structureId: string;
  format: PosterFormat;
  width: number;
};

/** Adresse `data:image/png` de l'aperçu, ou `null` si l'API refuse (limite, réseau). */
export async function posterPreview(input: PreviewInput): Promise<string | null> {
  const path = "/api/posters/preview";
  const headers: Record<string, string> = { "content-type": "application/json" };
  const token = getSessionToken();
  if (token) headers.authorization = `Bearer ${token}`;
  Object.assign(headers, authOriginHeader(path, Platform.OS !== "web", apiUrl("/")));
  try {
    const res = await fetch(apiUrl(path), { method: "POST", headers, body: JSON.stringify(input) });
    if (!res.ok) return null;
    return `data:image/png;base64,${toBase64(new Uint8Array(await res.arrayBuffer()))}`;
  } catch {
    return null;
  }
}
