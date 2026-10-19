// Lecture du texte d'une photo avec ML Kit, sur l'appareil (accueil drive, lot 48 ; dépendance native H8 : l'APK v2 du
// lot 58 est nécessaire). Sans le module (Expo Go, ancien APK) : `null`, l'écran propose la saisie au clavier. Aucune
// image ni aucun texte ne quitte le téléphone.
import { NativeModules } from "react-native";

export const ocrAvailable = (): boolean => Boolean(NativeModules.TextRecognition);

export async function readPhotoText(uri: string): Promise<string | null> {
  // Sans module natif, le paquet lève une erreur à l'appel : on ne l'importe même pas.
  if (!ocrAvailable()) return null;
  try {
    const { default: TextRecognition } = await import("@react-native-ml-kit/text-recognition");
    const result = await TextRecognition.recognize(uri);
    // Une ligne par ligne lue : une plaque tient sur une ligne, `extractPlates` n'assemble jamais deux lignes.
    return result.blocks.flatMap((b) => b.lines.map((l) => l.text)).join("\n");
  } catch {
    return null;
  }
}
