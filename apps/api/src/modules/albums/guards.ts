// Droits d'écriture sur les albums : le titulaire du profil média (`media_profiles.user_id`), accrédité (`accepted`) à
// l'événement. L'acteur `m:` (casquette) n'est **pas** lu : une route `/me/...` est toujours celle du titulaire, comme
// `/me/media-contents`. Ce fichier ne dépend pas de `modules/media/service.ts` (qui, lui, appelle la façade d'ici).
import { albumLabels, mediaLabels } from "@orasso/shared";
import { and, eq, isNull, sql } from "drizzle-orm";

import { applications, eventAlbums, mediaProfiles } from "../../db/schema";
import { now } from "../../lib/deps";
import { AppError, forbidden, notFound } from "../../lib/errors";
import type { Viewer } from "../../lib/session";
import type { Executor, Tx } from "../../lib/tx";
import type { AlbumRow, MediaRow } from "./view";

/** Un compte suspendu lit, n'écrit pas. */
export function assertWritable(v: Viewer): void {
  if (v.profile.suspendedUntil && v.profile.suspendedUntil > now()) {
    throw forbidden("Ton compte est suspendu : lecture seule.");
  }
}

export const isUniqueViolation = (error: unknown) => {
  const e = error as { code?: string; cause?: { code?: string } };
  return (e.cause ?? e).code === "23505";
};

/** Le profil média (non supprimé) du compte. */
export async function mediaOfUser(ex: Executor, userId: string): Promise<MediaRow | null> {
  const [row] = await ex
    .select()
    .from(mediaProfiles)
    .where(and(eq(mediaProfiles.userId, userId), isNull(mediaProfiles.deletedAt)));
  return row ?? null;
}

export async function requireMedia(ex: Executor, v: Viewer): Promise<MediaRow> {
  const profile = await mediaOfUser(ex, v.user.id);
  if (!profile) throw notFound(mediaLabels.profileMissing);
  return profile;
}

/** Le média est retenu (`accepted`) à l'événement. */
export async function isAccredited(ex: Executor, eventId: string, mediaProfileId: string): Promise<boolean> {
  const [row] = await ex
    .select({ id: applications.id })
    .from(applications)
    .where(
      and(
        eq(applications.eventId, eventId),
        eq(applications.mediaProfileId, mediaProfileId),
        eq(applications.kind, "media"),
        eq(applications.status, "accepted"),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/** `403 not_accredited` si le média n'est pas retenu (`accepted`) à l'événement. */
export async function assertAccredited(ex: Executor, eventId: string, mediaProfileId: string): Promise<void> {
  if (!(await isAccredited(ex, eventId, mediaProfileId))) {
    throw new AppError(403, "not_accredited", albumLabels.notAccredited);
  }
}

/**
 * Verrou d'un album (sérialise les ajouts, retraits et la publication) : verrou consultatif de transaction, puis la **ligne** est
 * verrouillée (`for update`) : la purge des brouillons (`skip locked`) ignore un album en cours d'usage. L'identifiant est mis en
 * minuscules avant toute clé de verrou : `ABC…` et `abc…` sont le même album. `404` si l'album n'existe pas, est supprimé ou n'est
 * pas celui du média.
 */
export async function lockOwnAlbum(tx: Tx, albumId: string, mediaProfileId: string): Promise<AlbumRow> {
  const id = albumId.toLowerCase();
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`album:${id}`}))`);
  const [row] = await tx
    .select()
    .from(eventAlbums)
    .where(and(eq(eventAlbums.id, id), eq(eventAlbums.mediaProfileId, mediaProfileId), isNull(eventAlbums.deletedAt)))
    .for("update");
  if (!row) throw notFound(albumLabels.notFound);
  return row;
}
