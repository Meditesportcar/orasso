// Carte à partager d'un véhicule (lots 31 et 50) : l'API rend le PNG (story 9:16 en trois styles, ou publication 1:1,
// sans plaque) ; l'appli le télécharge avec le jeton de session dans le cache de l'appareil, l'affiche en aperçu, puis
// ouvre la feuille de partage du système (`expo-sharing`) pour Instagram, Messages, Enregistrer… Sur le web (recette),
// l'aperçu est une adresse d'objet et le fichier est enregistré par le navigateur.
import type { ShareFormat, ShareStyle } from "@orasso/shared";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

import { apiUrl } from "@/api";
import { ApiRequestError, getSessionToken, NETWORK_MESSAGE } from "./http";

export type ShareOutcome = "shared" | "saved" | "unavailable";

/** Une carte rendue : de quoi l'afficher (`uri`) et la partager. */
export type PreparedShare = { uri: string; fileName: string };

/** `version` (`VehicleFull.shareVersion`) évite de resservir une carte périmée après une modification. */
export const shareImagePath = (vehicleId: string, format: ShareFormat, style: ShareStyle, version: string) =>
  `/api/me/vehicles/${vehicleId}/share-image?format=${format}&style=${style}&v=${encodeURIComponent(version)}`;

const authHeaders = (): Record<string, string> => {
  const token = getSessionToken();
  return token ? { authorization: `Bearer ${token}` } : {};
};

/** Télécharge la carte et la garde : l'aperçu et le partage s'en servent. */
export async function prepareShareImage(
  vehicleId: string,
  format: ShareFormat,
  style: ShareStyle,
  version: string,
): Promise<PreparedShare> {
  const fileName = format === "story" ? `orasso-story-${style}.png` : "orasso-post.png";
  const url = apiUrl(shareImagePath(vehicleId, format, style, version));
  if (Platform.OS === "web") {
    let res: Response;
    try {
      res = await fetch(url, { headers: authHeaders() });
    } catch {
      throw new ApiRequestError(0, "network", NETWORK_MESSAGE);
    }
    if (!res.ok) throw new ApiRequestError(res.status, "internal", "Impossible de générer la carte.");
    return { uri: URL.createObjectURL(await res.blob()), fileName };
  }
  try {
    const file = await File.downloadFileAsync(
      url,
      new File(Paths.cache, `orasso-${vehicleId}-${format}-${style}-${version}.png`),
      { headers: authHeaders(), idempotent: true },
    );
    return { uri: file.uri, fileName };
  } catch {
    throw new ApiRequestError(0, "network", "Impossible de générer la carte : vérifie ta connexion.");
  }
}

/** Ouvre la feuille de partage du système (téléphone) ou enregistre le fichier (navigateur). */
export async function sendShareImage(prepared: PreparedShare): Promise<ShareOutcome> {
  if (Platform.OS === "web") {
    const link = document.createElement("a");
    link.href = prepared.uri;
    link.download = prepared.fileName;
    link.click();
    return "saved";
  }
  if (!(await Sharing.isAvailableAsync())) return "unavailable";
  await Sharing.shareAsync(prepared.uri, {
    mimeType: "image/png",
    UTI: "public.png",
    dialogTitle: "Partager sur Instagram",
  });
  return "shared";
}
