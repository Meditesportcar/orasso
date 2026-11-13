// « En story » (lot R9f, T38) : une photo d'album où je suis identifié (voiture ou pseudo), ou dont je suis le média auteur, devient
// une story **personnelle** (persona `fan`), sans re-téléversement : le serveur compose lui-même la story depuis le fichier de
// l'album (9:16, fond flouté, comme toute story photo). `stories.source_album_photo_id` garde la photo d'origine : la story porte le
// **crédit** du média (« Photos : <média> »), **non retirable** (aucune route ne le modifie), incrusté sur le fichier qui sort
// d'Orasso, et tombe si l'identification est retirée ou si la photo ou l'album disparaît (`dropStoriesOfAlbumPhotos`).
//
// Plaque (T38, règle des plaques d'une story) : `blurred` ou `none` : la copie telle quelle (`plate_state blurred | none_confirmed`) ;
// `kept` : la copie est **floutée** avec les cadres gardés par le média (une story exige une plaque traitée) ; `unknown` (ancienne
// galerie, plaque jamais regardée) : 409 `plate_unknown`.
import { randomBytes, randomUUID } from "node:crypto";
import {
  albumCreditLine,
  albumTagLabels,
  type PlateRect,
  type ShareToStory,
  STORY_LIVE_MAX,
  type StoryCredit,
  storyExpiresAt,
  storyLabels,
  storyPlateOfAlbumPhoto,
} from "@orasso/shared";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { eventAlbumPhotos, eventAlbums, mediaProfiles, stories } from "../../db/schema";
import { now } from "../../lib/deps";
import { AppError, forbidden, notFound } from "../../lib/errors";
import { rateLimit } from "../../lib/rateLimit";
import type { Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";
import { type Tx, withTx } from "../../lib/tx";
import { notMaskedCopy } from "../stories/common";
import { composeStoryPhoto } from "../stories/compose";
import { removeOrRetry } from "../vehicles/photos-blur";
import { assertWritable } from "./guards";
import { visibleAlbum } from "./tag-visibility";
import { mediaKey } from "./view";

/** Points d'attente pour les tests de concurrence : `afterLocks` est attendu dans la transaction, verrous pris et droits relus, avant l'insertion. Jamais posé hors des tests. */
export const shareToStoryTestHooks: { afterLocks?: () => Promise<void> } = {};

export type StoryFromAlbum = { id: string; expiresAt: string; replayed: boolean };

/** Les crédits (« Photos : <média> ») de ces stories reprises d'une photo d'album : story → média. Une requête. */
export async function albumCreditsOf(
  rows: readonly { id: string; sourceAlbumPhotoId: string | null }[],
): Promise<Map<string, StoryCredit>> {
  const out = new Map<string, StoryCredit>();
  const sources = rows.filter((r) => r.sourceAlbumPhotoId);
  if (!sources.length) return out;
  const found = await db
    .select({ photoId: eventAlbumPhotos.id, mediaId: mediaProfiles.id, name: mediaProfiles.name })
    .from(eventAlbumPhotos)
    .innerJoin(eventAlbums, eq(eventAlbums.id, eventAlbumPhotos.albumId))
    .innerJoin(mediaProfiles, eq(mediaProfiles.id, eventAlbums.mediaProfileId))
    .where(
      inArray(
        eventAlbumPhotos.id,
        sources.flatMap((r) => (r.sourceAlbumPhotoId ? [r.sourceAlbumPhotoId] : [])),
      ),
    );
  const byPhoto = new Map(found.map((f) => [f.photoId, f]));
  for (const r of sources) {
    const f = r.sourceAlbumPhotoId ? byPhoto.get(r.sourceAlbumPhotoId) : undefined;
    if (f) out.set(r.id, { mediaKey: mediaKey(f.mediaId), mediaName: f.name });
  }
  return out;
}

/** La ligne de crédit imprimée sur le fichier qui sort d'Orasso (export d'une story reprise d'une photo d'album), sinon `null`. */
export async function albumCreditLineOf(sourceAlbumPhotoId: string | null): Promise<string | null> {
  if (!sourceAlbumPhotoId) return null;
  const credit = (await albumCreditsOf([{ id: "x", sourceAlbumPhotoId }])).get("x");
  return credit ? albumCreditLine(credit.mediaName) : null;
}

export async function shareToStory(v: Viewer, photoId: string, input: ShareToStory): Promise<StoryFromAlbum> {
  assertWritable(v);
  rateLimit("storyWrite", v.user.id);
  const [photo] = await db
    .select()
    .from(eventAlbumPhotos)
    .where(and(eq(eventAlbumPhotos.id, photoId.toLowerCase()), isNull(eventAlbumPhotos.deletedAt)));
  if (!photo) throw notFound(albumTagLabels.errors.photoNotFound);
  const join = await visibleAlbum(db, v, photo.albumId);
  // Un brouillon n'est partagé par personne : la story n'a de sens que pour un album publié.
  if (join.a.status !== "published") throw notFound(albumTagLabels.errors.albumNotFound);
  const isMediaAuthor = join.m.userId === v.user.id;
  const identified = async (ex: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]) => {
    if (isMediaAuthor) return true;
    const res = await ex.execute(sql`select 1 from album_photo_tags t join profiles p on p.user_id = t.user_id
      where t.photo_id = ${photo.id} and t.user_id = ${v.user.id} and t.removed_at is null
        and p.deleted_at is null and p.banned_at is null limit 1`);
    return res.rows.length > 0;
  };
  // Réservé à qui est identifié sur la photo (voiture ou pseudo) et au média auteur.
  if (!(await identified(db))) throw forbidden(albumTagLabels.errors.notIdentified);
  const plate = storyPlateOfAlbumPhoto(photo.plateState);
  if (!plate.ok) throw new AppError(409, "plate_unknown", albumTagLabels.errors.plateUnknown);
  // Rejouée : déjà en story (vivante), la même. Lue d'abord sans verrou (évite de composer un fichier pour rien), puis **sous le verrou**.
  const alreadyLive = async (ex: typeof db | Tx = db) => {
    const [live] = await ex
      .select({ id: stories.id, expiresAt: stories.expiresAt })
      .from(stories)
      .where(
        and(
          eq(stories.authorId, v.user.id),
          eq(stories.sourceAlbumPhotoId, photo.id),
          isNull(stories.deletedAt),
          sql`${stories.expiresAt} > ${now()}`,
        ),
      );
    return live ? ({ id: live.id, expiresAt: live.expiresAt.toISOString(), replayed: true } as const) : null;
  };
  const again = await alreadyLive();
  if (again) return again;

  const source = await storage.get(photo.storageKey);
  if (!source) throw notFound(albumTagLabels.errors.photoNotFound);
  // `kept` : floutée avec les cadres gardés ; `blurred` : le fichier de l'album l'est déjà ; `none` : rien à flouter.
  const rects: PlateRect[] = plate.blur ? ((photo.plateRects ?? []) as PlateRect[]) : [];
  const id = randomUUID();
  const composed = await composeStoryPhoto(source, { rects });
  const key = `private/stories/${id}/${randomBytes(8).toString("hex")}.webp`;
  await storage.put(key, composed.data);
  const at = now();
  // Un compte privé ne publie jamais « à tout le monde » : ses abonnés acceptés, rien de plus large.
  const audience = v.profile.visibility === "private" ? "followers" : (input.audience ?? "public");
  try {
    const winner = await withTx(async (tx) => {
      const capKey = `u:${v.user.id}`;
      // Verrous : le plafond de stories, puis la photo (une identification retirée en même temps tombe avant ou après, jamais entre les deux).
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`story-cap:${capKey}`}))`);
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`album:${photo.albumId.toLowerCase()}`}))`);
      // Les droits, relus sous verrou : identifié maintenant, album et photo toujours là.
      const [still] = await tx
        .select({ id: eventAlbumPhotos.id })
        .from(eventAlbumPhotos)
        .innerJoin(eventAlbums, eq(eventAlbums.id, eventAlbumPhotos.albumId))
        .where(
          and(eq(eventAlbumPhotos.id, photo.id), isNull(eventAlbumPhotos.deletedAt), isNull(eventAlbums.deletedAt)),
        )
        // La ligne de la photo est gardée jusqu'à l'insertion : une suppression (modération, média) attend la fin du partage et
        // fait alors tomber la story qu'il vient de créer ; jamais une photo retirée dans une nouvelle story.
        .for("share", { of: eventAlbumPhotos });
      if (!still) throw notFound(albumTagLabels.errors.photoNotFound);
      if (!(await identified(tx))) throw forbidden(albumTagLabels.errors.notIdentified);
      // Deux appels simultanés : le second retrouve la story du premier (le fichier qu'il a composé est effacé plus bas).
      const dup = await alreadyLive(tx);
      if (dup) return dup;
      await shareToStoryTestHooks.afterLocks?.();
      const [live] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(stories)
        .where(
          and(
            sql`${stories.deletedAt} is null`,
            sql`${stories.expiresAt} > ${at}`,
            notMaskedCopy(at),
            and(eq(stories.persona, "fan"), eq(stories.authorId, v.user.id)),
          ),
        );
      if ((live?.n ?? 0) >= STORY_LIVE_MAX) throw new AppError(409, "too_many_stories", storyLabels.tooManyStories);
      await tx.insert(stories).values({
        id,
        authorId: v.user.id,
        persona: "fan",
        audience,
        mediaKind: "photo",
        storageKey: key,
        width: composed.info.width,
        height: composed.info.height,
        status: "ready",
        plateState: plate.plate,
        caption: input.caption,
        sourceAlbumPhotoId: photo.id,
        expiresAt: storyExpiresAt(at),
        createdAt: at,
        updatedAt: at,
      });
      return null;
    });
    if (winner) {
      await removeOrRetry(key);
      return winner;
    }
  } catch (error) {
    await removeOrRetry(key);
    throw error;
  }
  return { id, expiresAt: storyExpiresAt(at).toISOString(), replayed: false };
}
