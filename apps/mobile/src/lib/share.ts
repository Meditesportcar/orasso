// Partager (lot R7f4 : généralisé à tout contenu d'Orasso ; lots 31, 50 et M6 pour l'affiche d'un véhicule) :
// l'affiche d'un véhicule : l'API rend le PNG (story 9:16 ou post 4:5, trois styles,
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
import {
  type ExportKind,
  type ExportMediaKind,
  exportCacheName,
  exportFileName,
  exportKindOf,
  nativeShareOptions,
  nextExportNonce,
  releaseAction,
  shareIfOpen,
} from "./shareFile";

const shareError = (status: number | null, detail?: string) => {
  const info = shareErrorInfo(status, detail);
  return new ApiRequestError(info.status, info.code, info.message);
};

export type ShareOutcome = "shared" | "saved" | "unavailable";

/** Une affiche rendue : de quoi l'afficher (`uri`) et la partager. `temp` : fichier d'export du cache, à effacer ensuite. */
export type PreparedShare = { uri: string; fileName: string; temp?: boolean };

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

/** Libère une affiche : l'adresse d'objet (web) ; sur le téléphone, le fichier d'export du cache est effacé pour de bon. */
export function releasePrepared(prepared: PreparedShare): void {
  const action = releaseAction(prepared, Platform.OS);
  if (action === "revoke") URL.revokeObjectURL(prepared.uri);
  else if (action === "delete") {
    try {
      new File(prepared.uri).delete();
    } catch {
      // Déjà effacé, ou cache vidé par le système : rien à faire.
    }
  }
}

/**
 * Ouvre la feuille de partage du système (téléphone) ou enregistre le fichier (navigateur). `save` : la même feuille,
 * titrée pour enregistrer l'image (Instagram, galerie, fichiers…).
 */
export async function sendShareImage(
  prepared: PreparedShare,
  kind: "share" | "save" = "share",
  mime: "image/png" | "image/jpeg" | "video/mp4" = "image/png",
  isOpen: () => boolean = () => true,
): Promise<ShareOutcome | null> {
  if (Platform.OS === "web") {
    const link = document.createElement("a");
    link.href = prepared.uri;
    link.download = prepared.fileName;
    link.click();
    return "saved";
  }
  // Fermée pendant l'attente : rien ne s'ouvre (`null`).
  return shareIfOpen<ShareOutcome>(
    isOpen,
    () => Sharing.isAvailableAsync(),
    () => Sharing.shareAsync(prepared.uri, nativeShareOptions(mime, kind)),
    "shared",
    "unavailable",
  );
}

// --- Fichiers qui sortent d'Orasso (lot R7f4) ---------------------------------------------------------------------------
// Le fichier part du rendu serveur (plaques floutées, signature « orasso.fr », 9:16 ou 4:5) : l'appli le télécharge avec le
// jeton dans le cache de l'appareil (jamais dans la galerie) puis ouvre la feuille de partage du système. Sur le web, le
// navigateur l'enregistre.

/** Adresse du fichier d'un contenu pas encore partagé (événement, voiture, souvenir, résultat de vote). */
export const shareExportPath = (type: string, id: string, format: "story" | "post") =>
  `/api/me/share/export?type=${type}&id=${id}&format=${format}`;
/** Adresse du fichier de ma story (auteur seul). */
export const storyExportPath = (id: string) => `/api/stories/${id}/export`;
/** Adresse du fichier de ma publication du Fil (auteur seul). */
export const postExportPath = (id: string) => `/api/feed-posts/${id}/export`;

export type { ExportKind };

/**
 * Télécharge un fichier sortant. `key` : base du nom dans le cache, suivie d'un suffixe unique par téléchargement (deux
 * téléchargements du même contenu ne partagent jamais un fichier). Un téléchargement coupé efface son fichier partiel.
 * `mediaKind` : la nature réelle du fichier (une story vidéo sort en .mp4 / video/mp4, jamais en image).
 */
export async function prepareExport(
  path: string,
  fileName: string,
  key: string,
  mediaKind: ExportMediaKind = "photo",
): Promise<PreparedShare & ExportKind> {
  const url = apiUrl(path);
  if (Platform.OS === "web") {
    let res: Response;
    try {
      res = await fetch(url, { headers: authHeaders() });
    } catch {
      throw shareError(0);
    }
    if (!res.ok) throw shareError(res.status);
    const type = res.headers.get("content-type") ?? "image/jpeg";
    const blob = await res.blob();
    const video = type.startsWith("video/");
    return {
      uri: URL.createObjectURL(blob),
      fileName: video ? fileName.replace(/.jpg$/, ".mp4") : fileName,
      mime: video ? "video/mp4" : "image/jpeg",
      ext: video ? "mp4" : "jpg",
    };
  }
  const kind = exportKindOf(mediaKind);
  const target = new File(Paths.cache, exportCacheName(key, kind, nextExportNonce()));
  try {
    const file = await File.downloadFileAsync(url, target, { headers: authHeaders() });
    return { uri: file.uri, fileName: exportFileName(fileName, kind), temp: true, ...kind };
  } catch (e) {
    // Téléchargement coupé : le fichier partiel (ouvert avant la copie) ne reste pas dans le cache.
    try {
      if (target.exists) target.delete();
    } catch {
      // rien à effacer
    }
    throw shareError(null, e instanceof Error ? e.message : String(e));
  }
}
