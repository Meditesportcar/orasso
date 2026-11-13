// Compte supprimé (anonymisé) : les albums du média sont retirés (brouillons compris), leurs photos retirées et leurs fichiers rendus
// à effacer après la validation. Appelé par `anonymizeMediaForDeletedAccount`, dans la transaction de `accountService.anonymize`
// (qui efface les clés rendues par `removeOrRetry` : un échec est replanifié, rejouable).
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { eventAlbumPhotos, eventAlbums } from "../../db/schema";
import type { Tx } from "../../lib/tx";

export async function anonymizeAlbumsForDeletedAccount(tx: Tx, mediaProfileIds: string[], at: Date): Promise<string[]> {
  if (!mediaProfileIds.length) return [];
  const keys: string[] = [];
  const albums = await tx
    .select({ id: eventAlbums.id })
    .from(eventAlbums)
    .where(and(inArray(eventAlbums.mediaProfileId, mediaProfileIds), isNull(eventAlbums.deletedAt)));
  if (albums.length) {
    const ids = albums.map((a) => a.id);
    const photos = await tx
      .update(eventAlbumPhotos)
      .set({ deletedAt: at })
      .where(and(inArray(eventAlbumPhotos.albumId, ids), isNull(eventAlbumPhotos.deletedAt)))
      .returning({ key: eventAlbumPhotos.storageKey });
    keys.push(...photos.map((p) => p.key));
    await tx
      .update(eventAlbums)
      .set({ deletedAt: at, officialAt: null, photosCount: 0, title: null })
      .where(inArray(eventAlbums.id, ids));
  }
  // Les **originaux** publics encore référencés (galerie publiée par l'ancien chemin dont l'effacement avait échoué), de **tous** les albums
  // du média, supprimés avant ou maintenant, photos retirées comprises : leur effacement est programmé. L'accès, lui, est bloqué par `legacy_file_blocks` (jamais
  // supprimée) : tant que le fichier existe, `/api/files` répond 404.
  const originals = await tx
    .select({ key: eventAlbumPhotos.legacySourceKey })
    .from(eventAlbumPhotos)
    .innerJoin(eventAlbums, eq(eventAlbums.id, eventAlbumPhotos.albumId))
    .where(
      and(inArray(eventAlbums.mediaProfileId, mediaProfileIds), sql`${eventAlbumPhotos.legacySourceKey} is not null`),
    );
  for (const o of originals) if (o.key) keys.push(o.key);
  return keys;
}
