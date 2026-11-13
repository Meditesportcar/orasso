// « Enregistrer » une photo d'album où l'on est identifié (lot R9f, T39) : le serveur rend la photo **avec le crédit du média incrusté** et
// les plaques floutées (`GET /album-photos/:id/download`) ; l'appli la garde dans le cache de l'appareil, ouvre la feuille de partage du
// système (`expo-sharing`, déjà dans l'appli : « Enregistrer l'image », Fichiers, Instagram…) puis efface le fichier. Jamais dans la
// galerie directement (`expo-media-library` n'est pas dans l'appli). Sur le web (recette), le navigateur télécharge le fichier.
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

import { apiUrl } from "@/api";
import { getSessionToken } from "@/lib/http";

const MIME = "image/webp";

export type SaveOutcome = "shared" | "saved" | "unavailable";

const headers = (): Record<string, string> => {
  const token = getSessionToken();
  return token ? { authorization: `Bearer ${token}` } : {};
};

export const albumDownloadPath = (photoId: string) => `/api/album-photos/${photoId}/download`;

export async function savePhoto(photoId: string): Promise<SaveOutcome> {
  const url = apiUrl(albumDownloadPath(photoId));
  const name = `orasso-photo-${photoId.slice(0, 8)}.webp`;
  if (Platform.OS === "web") {
    const res = await fetch(url, { headers: headers() });
    if (!res.ok) throw new Error(String(res.status));
    const href = URL.createObjectURL(await res.blob());
    const link = document.createElement("a");
    link.href = href;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(href), 10_000);
    return "saved";
  }
  const target = new File(Paths.cache, `orasso-album-${photoId}-${Date.now().toString(36)}.webp`);
  try {
    const file = await File.downloadFileAsync(url, target, { headers: headers() });
    if (!(await Sharing.isAvailableAsync())) return "unavailable";
    await Sharing.shareAsync(file.uri, {
      mimeType: MIME,
      UTI: "org.webmproject.webp",
      dialogTitle: "Enregistrer l'image",
    });
    return "shared";
  } finally {
    // Le fichier du cache ne reste jamais : ni partiel après un échec, ni complet après le partage.
    try {
      if (target.exists) target.delete();
    } catch {
      // déjà effacé
    }
  }
}
