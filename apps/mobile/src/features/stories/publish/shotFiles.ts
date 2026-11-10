// Garde-fous de « Publier une story » (lot R7f3, tour 2), sans React : testés par `shotFiles.test.ts`.
// 1. La photo brute de l'appareil (non recadrée, non floutée : la plaque s'y lit) est notée dès qu'elle existe et effacée
//    dès qu'elle ne sert plus, quoi qu'il arrive (écran quitté, recadrage raté).
// (La règle « rien ne part après le démontage de l'écran » est `sendIfAlive`, dans `@orasso/shared`, commune à l'appli et au site.)
import { discardTempPhotos, rememberTempPhotos } from "../../../lib/tempPhotos";

/** Note la photo brute qui vient d'arriver ; si l'écran est déjà parti, elle est effacée aussitôt. Vrai : on peut continuer. */
export function noteRawShot(uri: string, open: () => boolean): boolean {
  rememberTempPhotos(uri);
  if (open()) return true;
  discardTempPhotos([uri]);
  return false;
}

/** Exécute le traitement d'une photo brute ; elle est effacée à la fin, réussi ou raté. */
export async function withRawShot<T>(shot: { uri: string }, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } finally {
    discardTempPhotos([shot.uri]);
  }
}

/**
 * Fin de la préparation d'une prise vidéo brute de l'appareil (lot R7g, tour 2). `kept` : le fichier que le brouillon garde
 * (`null` : rien). La prise n'est effacée que si une autre vidéo l'a remplacée (copie compressée) ; sinon c'est elle qui sera
 * publiée, et elle vit jusqu'à la publication ou l'abandon (règle `tempPhotos`).
 */
export function settleRawTake(raw: string, kept: string | null): void {
  if (kept !== raw) discardTempPhotos([raw]);
}

/** Ce que l'appareil affiche : l'échec de sa propre prise, sinon le refus d'un média préparé par l'écran (vidéo de la galerie…). */
export const cameraMessage = (failed: string | null, error: string | null | undefined): string | null =>
  failed ?? error ?? null;
