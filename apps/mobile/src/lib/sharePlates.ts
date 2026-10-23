// Filet de sécurité de l'affiche à partager (lot M6, tour 2) : la plaque re-détectée sur l'affiche composée, avec la
// détection existante (`detectPlates`, ML Kit sur le téléphone ; `null` sur le web). Recette web seulement (jamais dans
// une version de production) : `window.__orassoFakePlates` simule une détection, pour atteindre l'état « plaque
// trouvée » sans caméra ni ML Kit.
import { Platform } from "react-native";

import { detectPlates } from "./plates/detect";

type Detected = Awaited<ReturnType<typeof detectPlates>>;

export async function detectSharePlates(uri: string, width: number, height: number): Promise<Detected> {
  if (__DEV__ && Platform.OS === "web") {
    const fake = (globalThis as { __orassoFakePlates?: Detected }).__orassoFakePlates;
    if (fake !== undefined) return fake;
  }
  return detectPlates(uri, width, height);
}
