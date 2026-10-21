// Lecture du texte d'une photo avec ML Kit, sur l'appareil (lot 51, dépendance native H8 : l'APK v2 du lot 58 est
// nécessaire). Expo Go ou build sans le module : `null`, l'écran de la plaque propose « À la main ». Aucune image ni
// aucun texte ne quitte le téléphone.
import { NativeModules } from "react-native";

import type { TextLineResult } from "./mlkit";

export type { TextCorners, TextFrame, TextLineResult } from "./mlkit";

export async function recognizeText(uri: string): Promise<TextLineResult[] | null> {
  // Sans module natif (Expo Go, ancien APK), le paquet lève une erreur à l'appel : on ne l'importe même pas.
  if (!NativeModules.TextRecognition) return null;
  try {
    const { default: TextRecognition } = await import("@react-native-ml-kit/text-recognition");
    const result = await TextRecognition.recognize(uri);
    return result.blocks.flatMap((block) =>
      block.lines.map((line) => ({
        text: line.text,
        frame: line.frame,
        corners: line.cornerPoints,
        elements: line.elements.map((e) => ({ text: e.text, frame: e.frame, corners: e.cornerPoints })),
      })),
    );
  } catch {
    return null;
  }
}
