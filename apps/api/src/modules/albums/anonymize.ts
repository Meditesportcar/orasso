// Compte supprimé (anonymisé) : les albums du média sont retirés (brouillons compris), leurs photos retirées et leurs fichiers rendus
// à effacer après la validation. Appelé par `anonymizeMediaForDeletedAccount`, dans la transaction de `accountService.anonymize`.
import { and, inArray, isNull } from "drizzle-orm";

import { eventAlbumPhotos, eventAlbums } from "../../db/schema";
import type { Tx } from "../../lib/tx";

export async function anonymizeAlbumsForDeletedAccount(tx: Tx, mediaProfileIds: string[], at: Date): Promise<string[]> {
  if (!mediaProfileIds.length) return [];
  const albums = await tx
    .select({ id: eventAlbums.id })
    .from(eventAlbums)
    .where(and(inArray(eventAlbums.mediaProfileId, mediaProfileIds), isNull(eventAlbums.deletedAt)));
  if (!albums.length) return [];
  const ids = albums.map((a) => a.id);
  const photos = await tx
    .update(eventAlbumPhotos)
    .set({ deletedAt: at })
    .where(and(inArray(eventAlbumPhotos.albumId, ids), isNull(eventAlbumPhotos.deletedAt)))
    .returning({ key: eventAlbumPhotos.storageKey });
  await tx
    .update(eventAlbums)
    .set({ deletedAt: at, officialAt: null, photosCount: 0, title: null })
    .where(inArray(eventAlbums.id, ids));
  return photos.map((p) => p.key);
}
