// Fiche Instagram d'un véhicule (lot 31) : l'API rend le PNG (story 9:16 ou publication 1:1, sans plaque) ; l'appli
// le télécharge avec le jeton de session dans le cache de l'appareil, puis ouvre la feuille de partage du système
// (`expo-sharing`) pour Instagram, Messages, Enregistrer… Sur le web (recette), le fichier est enregistré par le
// navigateur.
import type { ShareFormat } from "@orasso/shared";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

import { apiUrl } from "@/api";
import { ApiRequestError, getSessionToken, NETWORK_MESSAGE } from "./http";

export type ShareOutcome = "shared" | "saved" | "unavailable";

const path = (vehicleId: string, format: ShareFormat) => `/api/me/vehicles/${vehicleId}/share-image?format=${format}`;

export async function shareVehicleImage(vehicleId: string, format: ShareFormat): Promise<ShareOutcome> {
  const token = getSessionToken();
  const headers: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {};
  if (Platform.OS === "web") {
    // Navigateur : téléchargement du fichier.
    let res: Response;
    try {
      res = await fetch(apiUrl(path(vehicleId, format)), { headers });
    } catch {
      throw new ApiRequestError(0, "network", NETWORK_MESSAGE);
    }
    if (!res.ok) throw new ApiRequestError(res.status, "internal", "Impossible de générer la fiche.");
    const url = URL.createObjectURL(await res.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = `orasso-${format}.png`;
    link.click();
    URL.revokeObjectURL(url);
    return "saved";
  }
  let file: File;
  try {
    file = await File.downloadFileAsync(
      apiUrl(path(vehicleId, format)),
      new File(Paths.cache, `orasso-${vehicleId}-${format}.png`),
      { headers, idempotent: true },
    );
  } catch {
    throw new ApiRequestError(0, "network", "Impossible de générer la fiche : vérifie ta connexion.");
  }
  if (!(await Sharing.isAvailableAsync())) return "unavailable";
  await Sharing.shareAsync(file.uri, {
    mimeType: "image/png",
    UTI: "public.png",
    dialogTitle: "Partager sur Instagram",
  });
  return "shared";
}
