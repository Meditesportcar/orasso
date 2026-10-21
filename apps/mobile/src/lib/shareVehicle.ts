// Carte à partager d'un véhicule (lots 31 et 50) : l'API rend le PNG (story 9:16 en trois styles, ou publication 1:1,
// sans plaque) ; l'appli le télécharge avec le jeton de session dans le cache de l'appareil, l'affiche en aperçu, puis
// ouvre la feuille de partage du système (`expo-sharing`) pour Instagram, Messages, Enregistrer… Sur le web (recette),
// l'aperçu est une adresse d'objet et le fichier est enregistré par le navigateur.
import type { ShareFormat, ShareStyle } from "@orasso/shared";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

import { apiUrl } from "@/api";
import { ApiRequestError, getSessionToken } from "./http";
import { shareErrorInfo } from "./shareErrors";

const shareError = (status: number | null, detail?: string) => {
  const info = shareErrorInfo(status, detail);
  return new ApiRequestError(info.status, info.code, info.message);
};

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
      throw shareError(0);
    }
    if (!res.ok) throw shareError(res.status);
    return { uri: URL.createObjectURL(await res.blob()), fileName };
  }
  try {
    const file = await File.downloadFileAsync(
      url,
      new File(Paths.cache, `orasso-${vehicleId}-${format}-${style}-${version}.png`),
      { headers: authHeaders(), idempotent: true },
    );
    return { uri: file.uri, fileName };
  } catch (e) {
    throw shareError(null, e instanceof Error ? e.message : String(e));
  }
}

/** Libère l'adresse d'objet d'une carte (web) ; sans effet sur le téléphone. */
export function releasePrepared(prepared: PreparedShare): void {
  if (Platform.OS === "web" && prepared.uri.startsWith("blob:")) URL.revokeObjectURL(prepared.uri);
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
