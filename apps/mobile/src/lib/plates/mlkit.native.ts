// Lecture du texte d'une photo avec ML Kit, sur l'appareil (lot 51, dépendance native H8 : l'APK v2 du lot 58 est
// nécessaire). Expo Go ou build sans le module : « absent », l'écran de la plaque propose « À la main ». Aucune image ni
// aucun texte ne quitte le téléphone.
// Lot R3a (échec sur le Pixel de Damien, aucune trace) : la raison d'un échec est gardée (`RecognizeResult`), écrite au
// logcat (tag ReactNativeJS) et envoyée à GlitchTip si Sentry est initialisé : le nom et le message de l'erreur
// seulement, jamais l'image ni le texte lu.
import * as Sentry from "@sentry/react-native";
import { NativeModules } from "react-native";

import type { RecognizeResult, TextLineResult } from "./mlkit";

export type { RecognizeResult, TextCorners, TextFrame, TextLineResult } from "./mlkit";

/** Code court d'une erreur de ML Kit : son code natif, sinon son nom (« Error » seul ne dit rien : le message coupé). */
function errorCode(e: unknown): string {
  if (e && typeof e === "object") {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string" && code && code !== "Text recognition failed") return code.slice(0, 40);
    if (e instanceof Error) {
      if (e.name && e.name !== "Error") return e.name.slice(0, 40);
      return (e.message || "Error").slice(0, 40);
    }
  }
  return String(e).slice(0, 40);
}

export async function recognizeTextResult(uri: string): Promise<RecognizeResult> {
  // Sans module natif (Expo Go, ancien APK), le paquet lève une erreur à l'appel : on ne l'importe même pas.
  if (!NativeModules.TextRecognition) {
    console.warn("[plaque] ML Kit absent de cette version de l'appli : détection impossible");
    return { status: "absent" };
  }
  try {
    const { default: TextRecognition } = await import("@react-native-ml-kit/text-recognition");
    const result = await TextRecognition.recognize(uri);
    const lines: TextLineResult[] = result.blocks.flatMap((block) =>
      block.lines.map((line) => ({
        text: line.text,
        frame: line.frame,
        corners: line.cornerPoints,
        elements: line.elements.map((e) => ({ text: e.text, frame: e.frame, corners: e.cornerPoints })),
      })),
    );
    console.info(`[plaque] ML Kit : ${result.blocks.length} bloc(s), ${lines.length} ligne(s) lue(s)`);
    return { status: "ok", lines };
  } catch (e) {
    const name = e instanceof Error ? e.name : typeof e;
    const message = e instanceof Error ? e.message : String(e);
    console.warn(`[plaque] ML Kit en échec : ${name} : ${message}`);
    if (Sentry.getClient()) Sentry.captureException(e, { tags: { area: "plate-detection" } });
    return { status: "error", code: errorCode(e) };
  }
}

export async function recognizeText(uri: string): Promise<TextLineResult[] | null> {
  const r = await recognizeTextResult(uri);
  return r.status === "ok" ? r.lines : null;
}
