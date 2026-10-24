// Lecture du texte d'une photo avec ML Kit, sur l'appareil (lot 51, dépendance native H8 : l'APK v2 du lot 58 est
// nécessaire). Expo Go ou build sans le module : `null`, l'écran de la plaque propose « À la main ». Aucune image ni
// aucun texte ne quitte le téléphone.
import { NativeModules } from "react-native";

import type { TextLineResult } from "./mlkit";

export type { TextCorners, TextFrame, TextLineResult } from "./mlkit";

export async function recognizeText(uri: string): Promise<TextLineResult[] | null> {
  // Sans module natif (Expo Go, ancien APK), le paquet lève une erreur à l'appel : on ne l'importe même pas.
  if (!NativeModules.TextRecognition) {
    // Lot R3a : visible dans le logcat (tag ReactNativeJS), sans l'image ni le texte lu.
    console.warn("[plaque] ML Kit absent de cette version de l'appli : détection impossible");
    return null;
  }
  try {
    const { default: TextRecognition } = await import("@react-native-ml-kit/text-recognition");
    const result = await TextRecognition.recognize(uri);
    const lines = result.blocks.reduce((n, block) => n + block.lines.length, 0);
    console.info(`[plaque] ML Kit : ${result.blocks.length} bloc(s), ${lines} ligne(s) lue(s)`);
    return result.blocks.flatMap((block) =>
      block.lines.map((line) => ({
        text: line.text,
        frame: line.frame,
        corners: line.cornerPoints,
        elements: line.elements.map((e) => ({ text: e.text, frame: e.frame, corners: e.cornerPoints })),
      })),
    );
  } catch (e) {
    // Lot R3a : l'erreur était avalée ; le message seul (jamais l'image ni le texte) passe au logcat.
    console.warn(`[plaque] ML Kit en échec : ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}
