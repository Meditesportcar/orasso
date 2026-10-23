// Affiche à partager d'un véhicule (lots 31 et 50 ; lot M6) : l'API rend le PNG (story 9:16 ou post 4:5, trois styles,
// plaque floutée par le serveur) ; l'appli le télécharge avec le jeton de session dans le cache de l'appareil, l'affiche
// en aperçu, puis ouvre la feuille de partage du système (`expo-sharing`) pour Instagram, Messages, Enregistrer… Sur le
// web (recette), l'aperçu est une adresse d'objet et le fichier est enregistré par le navigateur.
import { formatShareMasks, type PlateRect, type ShareFormat, type ShareStyle } from "@orasso/shared";
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

/** Une affiche rendue : de quoi l'afficher (`uri`) et la partager. */
export type PreparedShare = { uri: string; fileName: string };

/**
 * `version` (`VehicleFull.shareVersion`) évite de resservir une affiche périmée après une modification ; `masks` : les
 * zones re-détectées sur l'affiche composée, que l'API floute en plus (filet de sécurité).
 */
export const shareImagePath = (
  vehicleId: string,
  format: ShareFormat,
  style: ShareStyle,
  version: string,
  masks: readonly PlateRect[] = [],
) =>
  `/api/me/vehicles/${vehicleId}/share-image?format=${format}&style=${style}&v=${encodeURIComponent(version)}${
    masks.length ? `&masks=${encodeURIComponent(formatShareMasks(masks))}` : ""
  }`;

const authHeaders = (): Record<string, string> => {
  const token = getSessionToken();
  return token ? { authorization: `Bearer ${token}` } : {};
};

/** Télécharge l'affiche et la garde : l'aperçu et le partage s'en servent. */
export async function prepareShareImage(
  vehicleId: string,
  format: ShareFormat,
  style: ShareStyle,
  version: string,
  masks: readonly PlateRect[] = [],
): Promise<PreparedShare> {
  const fileName = `orasso-${format}-${style}.png`;
  const url = apiUrl(shareImagePath(vehicleId, format, style, version, masks));
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
    const masked = masks.length ? `-m${masks.length}` : "";
    const file = await File.downloadFileAsync(
      url,
      new File(Paths.cache, `orasso-${vehicleId}-${format}-${style}-${version}${masked}.png`),
      { headers: authHeaders(), idempotent: true },
    );
    return { uri: file.uri, fileName };
  } catch (e) {
    throw shareError(null, e instanceof Error ? e.message : String(e));
  }
}

/** Libère l'adresse d'objet d'une affiche (web) ; sans effet sur le téléphone. */
export function releasePrepared(prepared: PreparedShare): void {
  if (Platform.OS === "web" && prepared.uri.startsWith("blob:")) URL.revokeObjectURL(prepared.uri);
}

/**
 * Ouvre la feuille de partage du système (téléphone) ou enregistre le fichier (navigateur). `save` : la même feuille,
 * titrée pour enregistrer l'image (Instagram, galerie, fichiers…).
 */
export async function sendShareImage(prepared: PreparedShare, kind: "share" | "save" = "share"): Promise<ShareOutcome> {
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
    dialogTitle: kind === "save" ? "Enregistrer l'image" : "Partager sur Instagram",
  });
  return "shared";
}
