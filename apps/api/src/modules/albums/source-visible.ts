// Une story reprise d'une photo d'album (« En story », lot R9f) suit la visibilité de l'album : elle n'est servie, en lecture comme en
// fichier ou en export, que tant que la photo existe et que l'album est visible de tous (publié, média en règle accrédité maintenant,
// événement publié et non privé). Ce n'est pas une suppression : l'accréditation qui revient, la story revient (jusqu'à son expiration).
import { and, eq, inArray, isNull } from "drizzle-orm";

import { eventAlbumPhotos, eventAlbums, events, mediaProfiles } from "../../db/schema";
import type { Executor } from "../../lib/tx";
import { albumVisibleSql } from "./view";

/** Parmi ces photos d'album, celles dont l'album est visible (et la photo non retirée) à `at`. Une seule requête. */
export async function visibleSourcePhotos(ex: Executor, photoIds: readonly string[], at: Date): Promise<Set<string>> {
  if (!photoIds.length) return new Set();
  const rows = await ex
    .select({ id: eventAlbumPhotos.id })
    .from(eventAlbumPhotos)
    .innerJoin(eventAlbums, eq(eventAlbums.id, eventAlbumPhotos.albumId))
    .innerJoin(events, eq(events.id, eventAlbums.eventId))
    .innerJoin(mediaProfiles, eq(mediaProfiles.id, eventAlbums.mediaProfileId))
    .where(and(inArray(eventAlbumPhotos.id, [...photoIds]), isNull(eventAlbumPhotos.deletedAt), albumVisibleSql(at)));
  return new Set(rows.map((r) => r.id));
}
