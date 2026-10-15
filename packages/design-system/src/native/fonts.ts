// Archivo en natif : une instance statique par largeur, graisse et style (scripts/generate-native-fonts.py).
// L'axe de largeur (wdth) d'une police variable n'est pas fiable sur Android : on n'en dépend pas.
// En React Native on n'indique pas fontWeight pour une police personnalisée : la famille porte tout.

import { useFonts } from "expo-font";
import type { ArchivoFamily } from "./fontFamily";

export const archivoFonts: Record<ArchivoFamily, number> = {
  "Archivo-Expanded-Black": require("./fonts/Archivo-Expanded-Black.ttf"),
  "Archivo-Expanded-BlackItalic": require("./fonts/Archivo-Expanded-BlackItalic.ttf"),
  "Archivo-Narrow-Bold": require("./fonts/Archivo-Narrow-Bold.ttf"),
  "Archivo-Regular": require("./fonts/Archivo-Regular.ttf"),
  "Archivo-SemiBold": require("./fonts/Archivo-SemiBold.ttf"),
  "Archivo-ExtraBold": require("./fonts/Archivo-ExtraBold.ttf"),
};

/** Charge les six polices ; l'appli attend `true` avant d'afficher l'interface (écran d'ouverture). */
export function useOrassoFonts(): boolean {
  const [loaded, error] = useFonts(archivoFonts);
  // Une police absente ne bloque pas l'appli : la police système prend le relais.
  return loaded || error !== null;
}
