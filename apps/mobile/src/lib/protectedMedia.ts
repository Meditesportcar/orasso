// Médias protégés des stories vidéo (lot R7g) : la vignette et la vidéo viennent de routes qui vérifient l'audience à chaque
// lecture (jeton de session en `Authorization`). Rien n'est écrit sur le disque du téléphone. La vignette est lue une fois et
// gardée **en mémoire** (quelques entrées) pour que la story suivante s'ouvre sans trou ; le cache est vidé quand le compte
// change. La vidéo : le téléphone la lit par morceaux avec l'en-tête (`expo-video`, `headers`) après une sonde qui rend le
// statut de l'API (403 et 404 = « plus disponible ») ; le navigateur de recette, qui ne peut pas poser l'en-tête sur une
// balise vidéo, la lit en entier dans un objet en mémoire.
import { Platform } from "react-native";

import { apiUrl } from "@/api";
import { getSessionToken } from "./http";
import { onCacheScopeDropped } from "./kv";

const authHeaders = (): Record<string, string> => {
  const token = getSessionToken();
  return token ? { authorization: `Bearer ${token}` } : {};
};

function asDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

const POSTERS_MAX = 4;
const posters = new Map<string, Promise<string | null>>();
onCacheScopeDropped(async () => {
  posters.clear();
});

/** La vignette d'une vidéo, en mémoire (`null` si elle n'arrive pas : la vidéo se lit quand même, sur fond uni). */
export function loadPoster(url: string | null): Promise<string | null> {
  if (!url) return Promise.resolve(null);
  const known = posters.get(url);
  if (known) return known;
  const task = fetch(apiUrl(url), { headers: authHeaders(), cache: "no-store" })
    .then((res) => (res.ok ? res.blob() : null))
    .then((blob) => (blob ? asDataUrl(blob) : null))
    .catch(() => null);
  posters.set(url, task);
  while (posters.size > POSTERS_MAX) {
    const oldest = posters.keys().next().value;
    if (oldest === undefined) break;
    posters.delete(oldest);
  }
  // Un échec n'est pas gardé : la lecture suivante réessaie.
  void task.then((data) => {
    if (!data) posters.delete(url);
  });
  return task;
}

export type VideoReady =
  | { ok: true; source: { uri: string; headers?: Record<string, string> }; release: () => void }
  | { ok: false; status: number };

/** Sonde la vidéo (statut de l'API) puis rend la source à donner au lecteur. `status` 0 : pas de réponse. */
export async function openStoryVideo(url: string, signal?: AbortSignal): Promise<VideoReady> {
  try {
    if (Platform.OS === "web") {
      const res = await fetch(apiUrl(url), { headers: authHeaders(), cache: "no-store", signal });
      if (!res.ok) return { ok: false, status: res.status };
      const objectUrl = URL.createObjectURL(await res.blob());
      return { ok: true, source: { uri: objectUrl }, release: () => URL.revokeObjectURL(objectUrl) };
    }
    const probe = await fetch(apiUrl(url), {
      headers: { ...authHeaders(), range: "bytes=0-0" },
      cache: "no-store",
      signal,
    });
    if (!probe.ok) return { ok: false, status: probe.status };
    return { ok: true, source: { uri: apiUrl(url), headers: authHeaders() }, release: () => undefined };
  } catch {
    return { ok: false, status: 0 };
  }
}
