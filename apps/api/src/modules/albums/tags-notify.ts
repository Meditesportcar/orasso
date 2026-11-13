// Notifications des identifications (lot R9f, T40 et T41).
//
// `album_tagged` : **une par album et par personne** (`groupKey album_tagged:<albumId>:<userId>`, fenêtre de 24 h de `notify` :
// dix photos donnent « 10 photos », pas dix lignes). Titre « <média> a publié N photos de ta <voiture> au <événement> » (par
// pseudo : « <média> t'a identifié sur N photos au <événement> »), `data.screen = "album-my-photos"`. Jamais quand l'intéressé
// s'identifie lui-même, jamais pour un compte supprimé ou banni. Un compte **privé** est prévenu (c'est lui). Les identifications
// posées **avant** la publication (le média identifie en brouillon) ne notifient qu'à la publication (un seul envoi) :
// `notified_at` nul = en attente. Famille « Événements », hors de l'Essentiel ; push avec le son habituel (le push silencieux
// n'existe pas dans la livraison : `silent` de `NotifyInput` supprime la ligne du Journal, voir le journal des choix).
//
// `album_tag_declined` : « Ce n'est pas ma voiture » prévient celui qui a posé l'identification : le média (notification
// personnelle) ou la structure (`notifyStructure`) ; jamais le pseudo d'un compte privé.
import {
  ALBUM_NOTIFICATION_THUMBS,
  albumTagLabels,
  albumTitle,
  tagDeclinedTitle,
  tagNotificationTitle,
} from "@orasso/shared";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { albumPhotoTags, eventAlbumPhotos, eventAlbums, notifications, profiles } from "../../db/schema";
import { now } from "../../lib/deps";
import { realtime } from "../../lib/realtime";
import { storage } from "../../lib/storage";
import type { Executor, Tx } from "../../lib/tx";
import { notificationsService, registerDeliveryGuard, registerJournalGuard } from "../notifications/service";
import { notifyStructure } from "../notifications/structure";
import { vehiclesRepo } from "../vehicles/repo";
import { vehicleLabel } from "../vehicles/serializers";
import { profileOk } from "./tag-visibility";
import { type AlbumJoin, albumBase, albumPhotoUrl, loadAlbum } from "./view";

type After = (cb: () => unknown) => void;

export const taggedGroupKey = (albumId: string, userId: string) => `album_tagged:${albumId}:${userId}`;

/** `inbox.changed` + livraison, après la validation de la transaction de l'appelant. */
const publishAfter = (after: After | undefined, userIds: readonly string[]) => {
  const publish = () => {
    for (const id of userIds) realtime.publish(`user:${id}`, "inbox.changed", {});
    notificationsService.kick();
  };
  if (after) after(publish);
  else publish();
};

/**
 * Envoie, pour chaque personne, la notification de ses identifications **en attente** (`notified_at` nul) dans cet album publié,
 * puis les marque envoyées. Rend les personnes prévenues. `userIds` : seulement celles-là (la pose d'une identification) ;
 * sinon toutes (la publication de l'album). Seules les identifications posées par **un autre** comptent (jamais soi-même).
 */
export async function sendTaggedNotifications(
  tx: Tx,
  albumId: string,
  opts: { userIds?: readonly string[]; after?: After } = {},
): Promise<string[]> {
  const join = await loadAlbumRaw(tx, albumId);
  // Un brouillon ne notifie jamais : le média peut y poser ses identifications, elles partent à la publication.
  if (join?.a.status !== "published" || join.a.deletedAt) return [];
  const at = now();
  const pending = await tx
    .select({
      id: albumPhotoTags.id,
      userId: albumPhotoTags.userId,
      kind: albumPhotoTags.targetKind,
      vehicleId: albumPhotoTags.vehicleId,
    })
    .from(albumPhotoTags)
    .innerJoin(eventAlbumPhotos, eq(eventAlbumPhotos.id, albumPhotoTags.photoId))
    .where(
      and(
        eq(eventAlbumPhotos.albumId, albumId),
        isNull(eventAlbumPhotos.deletedAt),
        isNull(albumPhotoTags.removedAt),
        isNull(albumPhotoTags.notifiedAt),
        sql`${albumPhotoTags.taggedBy} <> ${albumPhotoTags.userId}`,
        opts.userIds?.length ? inArray(albumPhotoTags.userId, [...opts.userIds]) : undefined,
      ),
    )
    .orderBy(asc(albumPhotoTags.userId));
  const byUser = new Map<string, typeof pending>();
  for (const row of pending) byUser.set(row.userId, [...(byUser.get(row.userId) ?? []), row]);
  const notified: string[] = [];
  for (const [userId, rows] of byUser) {
    // Les identifications d'un compte supprimé ou banni ne sont jamais annoncées (elles restent en attente, jamais servies).
    const [p] = await tx.select().from(profiles).where(eq(profiles.userId, userId));
    if (!p || p.deletedAt || p.bannedAt) continue;
    const ids = rows.map((r) => r.id);
    // Une seule personne à la fois, dans le même ordre : le verrou du regroupement est pris par `notify` (par compte et par clé).
    await tx.update(albumPhotoTags).set({ notifiedAt: at }).where(inArray(albumPhotoTags.id, ids));
    const total = await notifiedCount(tx, albumId, userId);
    const label = await firstVehicleLabel(tx, albumId, userId);
    const title = tagNotificationTitle({
      kind: label ? "vehicle" : "user",
      mediaName: join.m.name,
      count: total.count,
      vehicleLabel: label,
      eventTitle: join.e.title,
    });
    const albumName = albumTitle(join.a.title, join.e.title);
    const row = await notificationsService.notify(tx, userId, "album_tagged", {
      title,
      body: albumTagLabels.taggedBody(join.m.name, albumName),
      groupKey: taggedGroupKey(albumId, userId),
      eventId: join.e.id,
      eventStartsAt: join.e.startsAt,
      eventEndsAt: join.e.endsAt,
      after: opts.after,
      data: {
        albumId,
        screen: "album-my-photos",
        link: `/app/albums/${albumId}/mes-photos`,
        count: total.count,
        mediaKey: `m:${join.m.id}`,
        mediaName: join.m.name,
        mediaLogoUrl: storage.url(join.m.logoKey),
        eventTitle: join.e.title,
        thumbs: total.thumbs.map((k) => albumPhotoUrl(albumId, k)),
      },
    });
    // `notify` regroupe en ajoutant un à `count` : le compte juste est celui de la base (identifications actives annoncées).
    await tx
      .update(notifications)
      .set({ data: sql`${notifications.data} || ${JSON.stringify({ count: total.count })}::jsonb` })
      .where(eq(notifications.id, row.id));
    notified.push(userId);
  }
  if (notified.length) publishAfter(opts.after, notified);
  return notified;
}

/** Photos de cet album où la personne est identifiée **par un autre** et déjà annoncée (distinctes), et jusqu'à quatre clés pour la bande. */
async function notifiedCount(
  ex: Executor,
  albumId: string,
  userId: string,
): Promise<{ count: number; thumbs: string[] }> {
  const rows = await ex
    .select({ photoId: eventAlbumPhotos.id, key: eventAlbumPhotos.storageKey, position: eventAlbumPhotos.position })
    .from(albumPhotoTags)
    .innerJoin(eventAlbumPhotos, eq(eventAlbumPhotos.id, albumPhotoTags.photoId))
    .where(
      and(
        eq(eventAlbumPhotos.albumId, albumId),
        isNull(eventAlbumPhotos.deletedAt),
        eq(albumPhotoTags.userId, userId),
        isNull(albumPhotoTags.removedAt),
        sql`${albumPhotoTags.notifiedAt} is not null`,
        sql`${albumPhotoTags.taggedBy} <> ${albumPhotoTags.userId}`,
      ),
    )
    .orderBy(asc(eventAlbumPhotos.position));
  const distinct = new Map(rows.map((r) => [r.photoId, r.key]));
  return { count: distinct.size, thumbs: [...distinct.values()].slice(0, ALBUM_NOTIFICATION_THUMBS) };
}

/** Le nom de la première voiture identifiée de la personne dans cet album (par ordre de photo), `null` si elle l'est par son pseudo seulement. */
async function firstVehicleLabel(ex: Executor, albumId: string, userId: string): Promise<string | null> {
  const [row] = await ex
    .select({ vehicleId: albumPhotoTags.vehicleId })
    .from(albumPhotoTags)
    .innerJoin(eventAlbumPhotos, eq(eventAlbumPhotos.id, albumPhotoTags.photoId))
    .where(
      and(
        eq(eventAlbumPhotos.albumId, albumId),
        isNull(eventAlbumPhotos.deletedAt),
        eq(albumPhotoTags.userId, userId),
        eq(albumPhotoTags.targetKind, "vehicle"),
        isNull(albumPhotoTags.removedAt),
        sql`${albumPhotoTags.taggedBy} <> ${albumPhotoTags.userId}`,
      ),
    )
    .orderBy(asc(eventAlbumPhotos.position))
    .limit(1);
  if (!row?.vehicleId) return null;
  const v = await vehiclesRepo.findFullById(row.vehicleId, ex);
  return v ? vehicleLabel(v) : null;
}

/** L'album, son événement et son média, sans condition de visibilité (le serveur écrit pour une autre personne). */
export async function loadAlbumRaw(ex: Executor, albumId: string): Promise<AlbumJoin | null> {
  const [row] = await albumBase(ex).where(eq(eventAlbums.id, albumId)).limit(1);
  return row ?? null;
}

/**
 * « Ce n'est pas ma voiture » : prévient celui qui a posé l'identification, le média (notification personnelle) ou la structure
 * (une ligne par responsable, Activité de la structure). `withdraw` et le retrait par le poseur ne préviennent personne.
 */
export async function notifyDeclined(
  tx: Tx,
  join: AlbumJoin,
  tag: { taggedAs: "media" | "organizer" | "owner"; kind: "vehicle" | "user"; userId: string; photoId: string },
  after: After,
): Promise<void> {
  const [p] = await tx.select().from(profiles).where(eq(profiles.userId, tag.userId));
  // Le pseudo d'un compte privé ne part jamais dans la notification : « Un propriétaire dit que ce n'est pas sa voiture ».
  const pseudo = p && p.visibility === "public" ? p.pseudo : null;
  const album = albumTitle(join.a.title, join.e.title);
  const title = tagDeclinedTitle({ kind: tag.kind, pseudo, albumTitle: album });
  const content = {
    title,
    body: title,
    eventId: join.e.id,
    data: { albumId: join.a.id, photoId: tag.photoId, screen: "album", link: `/app/albums/${join.a.id}` },
  };
  if (tag.taggedAs === "media") {
    await notificationsService.notify(tx, join.m.userId, "album_tag_declined", { ...content, after });
    publishAfter(after, [join.m.userId]);
  } else if (tag.taggedAs === "organizer") {
    await notifyStructure(tx, join.e.structureId, "album_tag_declined", { ...content, after });
  }
}

// --- Livraison et lecture du Journal : jamais une ligne pour une identification qui n'existe plus -----------------------

/** Parmi ces lignes `album_tagged`, celles dont la personne a encore une identification active (compte en règle) dans l'album. */
async function stillTagged(userId: string, rows: readonly { id: string; data: unknown }[]): Promise<Set<string>> {
  const albums = new Map<string, string[]>();
  for (const r of rows) {
    const albumId = (r.data as { albumId?: unknown }).albumId;
    if (typeof albumId === "string") albums.set(albumId, [...(albums.get(albumId) ?? []), r.id]);
  }
  const keep = new Set<string>();
  if (!albums.size) return keep;
  const at = now();
  const [p] = await db.select().from(profiles).where(eq(profiles.userId, userId));
  if (!p || !profileOk(p, at)) return keep;
  const active = await db
    .select({ albumId: eventAlbumPhotos.albumId })
    .from(albumPhotoTags)
    .innerJoin(eventAlbumPhotos, eq(eventAlbumPhotos.id, albumPhotoTags.photoId))
    .where(
      and(
        eq(albumPhotoTags.userId, userId),
        isNull(albumPhotoTags.removedAt),
        isNull(eventAlbumPhotos.deletedAt),
        inArray(eventAlbumPhotos.albumId, [...albums.keys()]),
      ),
    );
  const live = new Set(active.map((a) => a.albumId));
  for (const [albumId, ids] of albums) {
    if (!live.has(albumId)) continue;
    // L'album doit rester visible de la personne (publié, média accrédité) : sinon la ligne ne mène nulle part.
    if (!(await loadAlbum(db, albumId, userId, at))) continue;
    for (const id of ids) keep.add(id);
  }
  return keep;
}

registerDeliveryGuard(["album_tagged"], async (n) => (await stillTagged(n.userId, [n])).has(n.id));
registerJournalGuard(["album_tagged"], async (userId, rows) => {
  const keep = await stillTagged(userId, rows);
  return new Map(rows.map((n) => [n.id, { shown: keep.has(n.id) }]));
});
