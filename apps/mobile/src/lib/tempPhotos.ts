// Photos temporaires de « Publier au Fil » (lot R7e2, tour 2) : les JPEG recadrés (et ceux d'origine) que l'appli écrit
// dans son cache avant l'envoi. Ils ne sont pas floutés : la plaque s'y lit. Ils sont donc effacés dès qu'ils ne servent
// plus (publication faite, abandon, départ de l'écran) et, par filet, quand le cache d'un compte est purgé (déconnexion).
import { File } from "expo-file-system";
import { Platform } from "react-native";

import { onCacheScopeDropped } from "./kv";

const live = new Set<string>();

/** Note ces fichiers : ils seront effacés par `discardTempPhotos`. */
export function rememberTempPhotos(...uris: string[]): void {
  for (const uri of uris) live.add(uri);
}

/** Efface ces fichiers (ou tous ceux qu'on a notés, sans argument). Une erreur d'effacement n'arrête rien. */
export function discardTempPhotos(uris?: readonly string[]): void {
  for (const uri of uris ?? [...live]) {
    live.delete(uri);
    try {
      if (Platform.OS === "web") {
        if (uri.startsWith("blob:")) URL.revokeObjectURL(uri);
        continue;
      }
      const file = new File(uri);
      if (file.exists) file.delete();
    } catch {
      // Ignoré : un fichier déjà parti, ou verrouillé, ne doit pas bloquer l'écran.
    }
  }
}

/** Les photos encore notées (pour les tests). */
export const tempPhotoCount = (): number => live.size;

/**
 * Change à chaque purge d'un compte (déconnexion, changement de compte) : une opération lancée avant et qui finit après
 * n'est plus d'actualité (ses JPEG tardifs sont effacés, jamais gardés).
 */
let epoch = 0;
export const tempPhotoEpoch = (): number => epoch;

onCacheScopeDropped(async () => {
  epoch++;
  discardTempPhotos();
});
