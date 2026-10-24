// Lecture du texte d'une photo : web et tests. ML Kit n'existe que dans l'appli native (`mlkit.native.ts`) ; ici, pas
// de détection (`null`) : l'écran de la plaque propose « À la main ».

export type TextFrame = { left: number; top: number; width: number; height: number };
/** Coins du texte lu (lot 59c), dans l'ordre de ML Kit : haut gauche, haut droit, bas droit, bas gauche du texte. */
export type TextCorners = readonly { x: number; y: number }[];
export type TextLineResult = {
  text: string;
  frame?: TextFrame;
  corners?: TextCorners;
  elements: { text: string; frame?: TextFrame; corners?: TextCorners }[];
};

/**
 * Lot R3a (demande du coordinateur, échec sur le Pixel de Damien) : le résultat d'une lecture, avec la raison d'un
 * échec. `absent` : pas de module ML Kit (web, Expo Go, ancien APK) ; `error` : ML Kit a levé une erreur (`code` : son
 * nom, court, sans texte lu) ; `ok` : lecture faite, éventuellement sans aucune ligne.
 */
export type RecognizeResult =
  | { status: "ok"; lines: TextLineResult[] }
  | { status: "absent" }
  | { status: "error"; code: string };

export async function recognizeTextResult(_uri: string): Promise<RecognizeResult> {
  return { status: "absent" };
}

export async function recognizeText(uri: string): Promise<TextLineResult[] | null> {
  const r = await recognizeTextResult(uri);
  return r.status === "ok" ? r.lines : null;
}
