// Fichiers qui sortent d'Orasso, côté téléphone (lot R7f4, tour 2) : la logique pure, sans module natif, pour la tester.
// Le type réel du fichier vient de la story (`mediaKind`) : une photo sort en `.jpg` (`image/jpeg`), une vidéo en `.mp4`
// (`video/mp4`) ; jamais une vidéo déclarée en image. Le fichier téléchargé vit dans le cache de l'appareil (jamais dans la
// galerie) et est effacé quand la feuille se ferme.

export type ExportMediaKind = "photo" | "video";
export type ExportKind = { mime: "image/jpeg" | "video/mp4"; ext: "jpg" | "mp4" };

/** Type, extension et UTI d'un fichier sortant selon sa nature. */
export const exportKindOf = (mediaKind: ExportMediaKind = "photo"): ExportKind =>
  mediaKind === "video" ? { mime: "video/mp4", ext: "mp4" } : { mime: "image/jpeg", ext: "jpg" };

/** Le nom du fichier avec la bonne extension (`orasso-story.jpg` devient `orasso-story.mp4` pour une vidéo). */
export const exportFileName = (fileName: string, kind: ExportKind): string =>
  `${fileName.replace(/\.(jpg|mp4)$/i, "")}.${kind.ext}`;

/** Nom du fichier dans le cache de l'appareil : le contenu, un suffixe unique par téléchargement, la bonne extension. */
export const exportCacheName = (key: string, kind: ExportKind, unique = ""): string =>
  `orasso-export-${key.replace(/[^a-zA-Z0-9_-]/g, "_")}${unique ? `-${unique}` : ""}.${kind.ext}`;

let exportCounter = 0;
/** Suffixe unique par téléchargement : deux téléchargements du même contenu ne partagent jamais un chemin du cache. */
export const nextExportNonce = (): string => `${Date.now().toString(36)}${(exportCounter++).toString(36)}`;

/** Ce que la feuille de partage du système reçoit : type MIME, UTI iOS et titre. */
export function nativeShareOptions(mime: "image/png" | "image/jpeg" | "video/mp4", kind: "share" | "save") {
  return {
    mimeType: mime,
    UTI: mime === "image/png" ? "public.png" : mime === "video/mp4" ? "public.mpeg-4" : "public.jpeg",
    dialogTitle: kind === "save" ? "Enregistrer l'image" : "Partager sur Instagram",
  };
}

/**
 * Que faire d'un fichier préparé quand on n'en a plus besoin : sur le web, libérer l'adresse d'objet ; sur le téléphone,
 * effacer le fichier du cache, mais seulement un fichier qu'on a créé pour un export (`temp`) : une affiche gardée sous un
 * nom stable peut être reprise par l'écran suivant.
 */
export function releaseAction(
  prepared: { uri: string; temp?: boolean },
  platform: string,
): "revoke" | "delete" | "none" {
  if (platform === "web") return prepared.uri.startsWith("blob:") ? "revoke" : "none";
  return prepared.temp ? "delete" : "none";
}

/**
 * Ouvre le partage du système seulement si la feuille est encore ouverte après l'attente de `isAvailable` : sinon rien
 * n'est ouvert et la fonction renvoie `null`.
 */
export async function shareIfOpen<O>(
  isOpen: () => boolean,
  isAvailable: () => Promise<boolean>,
  share: () => Promise<void>,
  done: O,
  unavailable: O,
): Promise<O | null> {
  const available = await isAvailable();
  if (!isOpen()) return null;
  if (!available) return unavailable;
  await share();
  return done;
}

/**
 * Prépare un export puis l'envoie, sauf si la feuille a été fermée entre-temps : un téléchargement qui finit après la
 * fermeture libère son fichier tout de suite et n'ouvre jamais le partage du système. `isOpen` est relu après chaque attente.
 * Renvoie `null` quand la feuille s'est fermée (rien n'a été envoyé).
 */
export async function exportWhileOpen<P, O>(
  isOpen: () => boolean,
  prepare: () => Promise<P>,
  keep: (file: P) => void,
  release: (file: P) => void,
  send: (file: P, isOpen: () => boolean) => Promise<O | null>,
): Promise<O | null> {
  const file = await prepare();
  if (!isOpen()) {
    release(file);
    return null;
  }
  keep(file);
  const outcome = await send(file, isOpen);
  if (outcome === null || !isOpen()) {
    release(file);
    return null;
  }
  return outcome;
}
