// Lecture du texte d'une photo pour l'accueil drive (lot 48) : web et tests. ML Kit n'existe que dans l'appli native
// (`driveOcr.native.ts`) ; ici, rien (`null`) : l'écran propose la saisie de la plaque au clavier.
export async function readPhotoText(_uri: string): Promise<string | null> {
  return null;
}

/** ML Kit est-il présent dans ce build ? (Expo Go, ancien APK, web : non.) */
export const ocrAvailable = (): boolean => false;
