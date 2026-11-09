// Préparation des photos du composeur du Fil (lot R7e2, tour 5) : le verrou « une photo se prépare » est toujours libéré,
// et une conversion qui échoue ne laisse aucun aperçu derrière elle.

/** Message affiché quand une photo ne peut pas être préparée (le verrou est libéré, la saisie reste). */
export const PREPARE_FAILED = "Cette photo n'a pas pu être préparée. Réessaie.";

/**
 * Convertit les sources une à une. Si l'une échoue, ce qui était déjà produit est libéré (`release`) et l'erreur repart :
 * jamais de résultat partiel.
 */
export async function convertAll<S, T>(
  sources: readonly S[],
  convert: (source: S) => Promise<T>,
  release: (done: T) => void,
): Promise<T[]> {
  const done: T[] = [];
  try {
    for (const source of sources) done.push(await convert(source));
  } catch (e) {
    for (const d of done) release(d);
    throw e;
  }
  return done;
}

/** Tient le verrou le temps de la tâche, le libère dans tous les cas, et rend l'erreur à `onError` au lieu de la laisser partir. */
export async function holdLock(
  setLocked: (locked: boolean) => void,
  task: () => Promise<void>,
  onError: (message: string) => void,
): Promise<void> {
  setLocked(true);
  try {
    await task();
  } catch {
    onError(PREPARE_FAILED);
  } finally {
    setLocked(false);
  }
}
