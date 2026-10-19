// Lecture du texte d'une photo : web et tests. ML Kit n'existe que dans l'appli native (`mlkit.native.ts`) ; ici, pas
// de détection (`null`) : l'écran de la plaque propose « À la main ».

export type TextFrame = { left: number; top: number; width: number; height: number };
export type TextLineResult = { text: string; frame?: TextFrame; elements: { text: string; frame?: TextFrame }[] };

export async function recognizeText(_uri: string): Promise<TextLineResult[] | null> {
  return null;
}
