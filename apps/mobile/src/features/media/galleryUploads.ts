// Envoi des photos d'une galerie (lot 57, relecture) : un échec de publication ne doit pas bloquer la reprise. Les envois
// réussis sont gardés (par photo et zones floutées) et réutilisés à l'essai suivant ; ceux dont la photo a été retirée
// sont supprimés côté API (`DELETE /me/uploads/:id`) pour ne pas user le quota de fichiers.

export type SentUpload = { id: string; key: string };
/** Envois déjà réussis, par signature de photo (`uploadSignature`). */
export type UploadCache = Map<string, SentUpload>;

type PhotoLike = { photo: { uri: string }; rects: readonly unknown[] };

export function uploadSignature(item: PhotoLike): string {
  return `${item.photo.uri}|${JSON.stringify(item.rects)}`;
}

/**
 * Envoie les photos manquantes et rend les clés dans l'ordre des photos. Chaque envoi réussi est mémorisé tout de
 * suite (même si un envoi suivant échoue) ; les envois du cache qui ne correspondent plus à aucune photo sont supprimés.
 */
export async function syncGalleryUploads(
  photos: readonly PhotoLike[],
  cache: UploadCache,
  send: (item: PhotoLike, index: number) => Promise<SentUpload>,
  remove: (upload: SentUpload) => Promise<unknown>,
  onProgress?: (current: number, total: number) => void,
): Promise<string[]> {
  const wanted = new Set(photos.map(uploadSignature));
  for (const [signature, upload] of [...cache]) {
    if (wanted.has(signature)) continue;
    cache.delete(signature);
    await remove(upload).catch(() => undefined);
  }
  const keys: string[] = [];
  for (const [i, item] of photos.entries()) {
    onProgress?.(i + 1, photos.length);
    const signature = uploadSignature(item);
    let sent = cache.get(signature);
    if (!sent) {
      sent = await send(item, i);
      cache.set(signature, sent);
    }
    keys.push(sent.key);
  }
  return keys;
}

/** Supprime tout ce qui reste en cache (publication abandonnée ou terminée par un retrait). */
export async function discardGalleryUploads(
  cache: UploadCache,
  remove: (upload: SentUpload) => Promise<unknown>,
): Promise<void> {
  for (const upload of [...cache.values()]) await remove(upload).catch(() => undefined);
  cache.clear();
}
