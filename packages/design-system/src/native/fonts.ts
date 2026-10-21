// Archivo en natif : une instance statique par largeur, graisse et style (scripts/generate-native-fonts.py).
// L'axe de largeur (wdth) d'une police variable n'est pas fiable sur Android : on n'en dépend pas.
// En React Native on n'indique pas fontWeight pour une police personnalisée : la famille porte tout.
// Lot C1 : dix-huit instances (largeurs de l'artefact DA v2), environ 40 Ko chacune (sous-ensemble latin).

import { useFonts } from "expo-font";
import type { ArchivoFamily } from "./fontFamily";

export const archivoFonts: Record<ArchivoFamily, number> = {
  "Archivo-Expanded-Black": require("./fonts/Archivo-Expanded-Black.ttf"),
  "Archivo-Expanded-BlackItalic": require("./fonts/Archivo-Expanded-BlackItalic.ttf"),
  "Archivo-Narrow-Bold": require("./fonts/Archivo-Narrow-Bold.ttf"),
  "Archivo-Regular": require("./fonts/Archivo-Regular.ttf"),
  "Archivo-SemiBold": require("./fonts/Archivo-SemiBold.ttf"),
  "Archivo-ExtraBold": require("./fonts/Archivo-ExtraBold.ttf"),
  "Archivo-118-Black": require("./fonts/Archivo-118-Black.ttf"),
  "Archivo-115-ExtraBold": require("./fonts/Archivo-115-ExtraBold.ttf"),
  "Archivo-115-Black": require("./fonts/Archivo-115-Black.ttf"),
  "Archivo-110-Black": require("./fonts/Archivo-110-Black.ttf"),
  "Archivo-110-Heavy": require("./fonts/Archivo-110-Heavy.ttf"),
  "Archivo-80-ExtraBold": require("./fonts/Archivo-80-ExtraBold.ttf"),
  "Archivo-75-Bold": require("./fonts/Archivo-75-Bold.ttf"),
  "Archivo-75-ExtraBold": require("./fonts/Archivo-75-ExtraBold.ttf"),
  "Archivo-75-Black": require("./fonts/Archivo-75-Black.ttf"),
  "Archivo-70-Black": require("./fonts/Archivo-70-Black.ttf"),
  "Archivo-62-ExtraBold": require("./fonts/Archivo-62-ExtraBold.ttf"),
  "Archivo-62-Black": require("./fonts/Archivo-62-Black.ttf"),
};

/** Charge les polices ; l'appli attend `true` avant d'afficher l'interface (écran d'ouverture). */
export function useOrassoFonts(): boolean {
  const [loaded, error] = useFonts(archivoFonts);
  // Une police absente ne bloque pas l'appli : la police système prend le relais.
  return loaded || error !== null;
}
