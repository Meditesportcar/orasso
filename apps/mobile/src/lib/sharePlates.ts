// Filet de sécurité de l'affiche à partager (lot M6, tour 2) : la plaque re-détectée sur l'affiche composée, avec la
// détection existante (`detectPlates`, ML Kit sur le téléphone ; `null` sur le web). Recette web seulement (`RECETTE` :
// Metro ou version compilée de recette, jamais l'APK) : `window.__orassoFakePlates` simule une détection, pour atteindre l'état « plaque
// trouvée » sans caméra ni ML Kit.
import { Platform } from "react-native";

import { detectPlates } from "./plates/detect";
import { RECETTE } from "./recette";

type Detected = Awaited<ReturnType<typeof detectPlates>>;

export async function detectSharePlates(uri: string, width: number, height: number): Promise<Detected> {
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
