// « Enregistrer » une photo d'album où l'on est identifié (lot R9f, T39) : le serveur rend la photo **avec le crédit du média incrusté** et
// les plaques floutées (`GET /album-photos/:id/download`) ; l'appli la garde dans le cache de l'appareil, ouvre la feuille de partage du
// système (`expo-sharing`, déjà dans l'appli : « Enregistrer l'image », Fichiers, Instagram…) puis efface le fichier. Jamais dans la
// galerie directement (`expo-media-library` n'est pas dans l'appli). Le partage ne s'ouvre jamais après la fermeture de l'écran ni après un
// changement de compte (`saveFlow`). Sur le web (recette), le navigateur télécharge le fichier.
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

import { apiUrl } from "@/api";
import { getSessionToken } from "@/lib/http";
import { accountGuard } from "@/lib/kv";
import { type SaveOutcome, saveFlow } from "./savePhotoFlow";

export type { SaveOutcome };

const headers = (): Record<string, string> => {
  const token = getSessionToken();
  return token ? { authorization: `Bearer ${token}` } : {};
};

export const albumDownloadPath = (photoId: string) => `/api/album-photos/${photoId}/download`;

/** `null` : l'écran s'est fermé (ou le compte a changé) pendant le téléchargement, rien n'a été ouvert. */
export async function savePhoto(photoId: string, isOpen: () => boolean): Promise<SaveOutcome | null> {
  const url = apiUrl(albumDownloadPath(photoId));
  const guard = accountGuard();
  if (Platform.OS === "web") {
    const res = await fetch(url, { headers: headers() });
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    if (!isOpen() || !guard.current()) return null;
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `orasso-photo-${photoId.slice(0, 8)}.webp`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(href), 10_000);
    return "saved";
  }
  const target = new File(Paths.cache, `orasso-album-${photoId}-${Date.now().toString(36)}.webp`);
  const erase = () => {
    try {
      if (target.exists) target.delete();
    } catch {
      // déjà effacé
    }
  };
  try {
    return await saveFlow<File>({
      isOpen,
      sameAccount: guard.current,
      download: () => File.downloadFileAsync(url, target, { headers: headers() }),
      release: erase,
      isAvailable: () => Sharing.isAvailableAsync(),
      share: (file) =>
        Sharing.shareAsync(file.uri, {
          mimeType: "image/webp",
          UTI: "org.webmproject.webp",
          dialogTitle: "Enregistrer l'image",
        }),
    });
  } finally {
    // Le fichier du cache ne reste jamais : ni partiel après un échec, ni complet après le partage.
    erase();
  }
}
