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

export async function recognizeText(_uri: string): Promise<TextLineResult[] | null> {
  return null;
}
