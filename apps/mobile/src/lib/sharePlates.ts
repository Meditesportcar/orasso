// Filet de sécurité de l'affiche à partager (lot M6, tour 2) : la plaque re-détectée sur l'affiche composée, avec la
// détection existante (`detectPlates`, ML Kit sur le téléphone ; `null` sur le web). Recette web seulement (`RECETTE` :
// Metro ou version compilée de recette, jamais l'APK) : `window.__orassoFakePlates` simule une détection, pour atteindre l'état « plaque
// trouvée » sans caméra ni ML Kit.
import { plateOnSharePoster, SHARE_SIZES, type ShareFormat, type ShareStyle, type ShareZone } from "@orasso/shared";
import { Platform } from "react-native";

import { detectPlates } from "./plates/detect";
import { RECETTE } from "./recette";

type Detected = Awaited<ReturnType<typeof detectPlates>>;

/**
 * Lot R3a (retour 7 ; tour 2) : toute la partie lisible de la photo est vérifiée ; seules sont écartées les lectures
 * presque entièrement dans les zones réelles des textes d'Orasso (`texts`, renvoyées par l'API : nom, marque, chiffres,
 * pied, QR, sceau s'il est dessiné). Sans ces zones (panne), rien n'est écarté. Détection simulée comprise.
 */
export async function detectSharePlates(
  uri: string,
  format: ShareFormat,
  style: ShareStyle,
  texts: readonly ShareZone[] = [],
): Promise<Detected> {
  const found = await detectRaw(uri, format);
  return found === null ? null : found.filter((rect) => plateOnSharePoster(format, style, rect, texts));
}

async function detectRaw(uri: string, format: ShareFormat): Promise<Detected> {
  const { width, height } = SHARE_SIZES[format];
  if (RECETTE && Platform.OS === "web") {
    const g = globalThis as { __orassoFakePlates?: Detected; __orassoFakePlatesDelayMs?: number };
    const fake = g.__orassoFakePlates;
    if (fake !== undefined) {
      // Une détection lente (recette du tour 3 : changer de style pendant la vérification).
      if (g.__orassoFakePlatesDelayMs) await new Promise((r) => setTimeout(r, g.__orassoFakePlatesDelayMs));
      return fake;
    }
  }
  return detectPlates(uri, width, height);
}
