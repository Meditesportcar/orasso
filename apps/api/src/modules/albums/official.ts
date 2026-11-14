// L'album « officiel » d'un événement (lot R9g, T46). Un seul par événement (index unique partiel `event_albums_official_key`) ; l'organisateur
// (la structure de l'événement, second facteur) le pose, le déplace ou le retire. Idempotent : poser l'étoile sur l'album qui l'a déjà, ou la
// retirer d'un album qui ne l'a pas, ne change rien. Le verrou de l'événement sérialise deux changements simultanés : un seul officiel au
// final. La façade `PATCH /events/:id/media-contents/:cid/feature` (APK en ligne) appelle la même fonction.
import { type AlbumSummary, eventPhotosLabels as L, mediaLabels } from "@orasso/shared";
import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { eventAlbums } from "../../db/schema";
import { requireOrganizerWrite } from "../../lib/access";
import { now } from "../../lib/deps";
import { conflict, forbidden, notFound } from "../../lib/errors";
import type { Viewer } from "../../lib/session";
import { type Tx, withTx } from "../../lib/tx";
import { eventsRepo } from "../events/repo";
import { isAccredited } from "./guards";
import { type AlbumJoin, albumBase, summariesOf } from "./view";

/** Rappel de la façade : l'album vient de recevoir l'étoile (la façade d'avant prévenait le média, la route neuve non : T46). */
export type OfficialHook = (
  tx: Tx,
  after: (cb: () => unknown) => void,
  ctx: { found: AlbumJoin; event: Awaited<ReturnType<typeof eventsRepo.byId>> },
) => Promise<void>;

/**
 * Pose (`official: true`) ou retire (`false`) l'étoile de l'album, pour l'organisateur de l'événement. 404 si l'album n'est pas un album
 * publié de l'événement (une fois les droits vérifiés : un non-organisateur ne sait rien de l'album).
 */
export async function setAlbumOfficial(
  v: Viewer,
  eventId: string,
  albumId: string,
  official: boolean,
  hook?: OfficialHook,
): Promise<AlbumJoin> {
  const id = albumId.toLowerCase();
  const eid = eventId.toLowerCase();
  const event = await eventsRepo.byId(eid);
  await requireOrganizerWrite(v, event.structureId);
  if (event.status === "cancelled") throw conflict("conflict", mediaLabels.eventCancelled);
  await withTx(async (tx, after) => {
    // Le verrou de l'événement : deux changements simultanés ne laissent qu'un officiel.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`album-official:${eid}`}))`);
    const [found] = await albumBase(tx).where(
      and(
        eq(eventAlbums.id, id),
        eq(eventAlbums.eventId, eid),
        eq(eventAlbums.status, "published"),
        isNull(eventAlbums.deletedAt),
      ),
    );
    if (!found) throw notFound(L.errors.albumNotFound);
    // Un album dont le média n'est plus accrédité n'est plus sur la fiche : on ne lui pose pas l'étoile (la retirer reste possible).
    if (official && !(await isAccredited(tx, eid, found.a.mediaProfileId))) throw forbidden(mediaLabels.notAccredited);
    const was = found.a.officialAt !== null;
    if (official) {
      await tx
        .update(eventAlbums)
        .set({ officialAt: null })
        .where(
          and(
            eq(eventAlbums.eventId, eid),
            sql`${eventAlbums.officialAt} is not null`,
            sql`${eventAlbums.id} <> ${id}`,
          ),
        );
    }
    await tx
      .update(eventAlbums)
      .set({ officialAt: official ? (found.a.officialAt ?? now()) : null })
      .where(eq(eventAlbums.id, id));
    if (official && !was && hook) await hook(tx, after, { found, event });
  });
  const [row] = await albumBase().where(eq(eventAlbums.id, id));
  if (!row) throw notFound(L.errors.albumNotFound);
  return row;
}

/** La route neuve : l'album après le changement, en `AlbumSummary` (liste blanche). */
export async function setAlbumOfficialView(
  v: Viewer,
  eventId: string,
  albumId: string,
  official: boolean,
): Promise<AlbumSummary> {
  const row = await setAlbumOfficial(v, eventId, albumId, official);
  const [summary] = await summariesOf(db, [row], v.user.id);
  if (!summary) throw notFound(L.errors.albumNotFound);
  return summary;
}
