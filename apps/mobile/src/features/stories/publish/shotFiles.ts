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
