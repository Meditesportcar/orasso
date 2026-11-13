// Façade des albums pour l'APK en ligne (lot R9e, ARCHITECTURE-R8 § 3.2) : les routes `media-contents` d'avant servent les **liens** de
// `media_contents` et les **albums** publiés, mis en forme `contentView` (`kind: "gallery"`, 30 photos au plus, `featured` = album
// officiel). Une galerie reprise garde l'identifiant de son ancien contenu (la migration pose `event_albums.id = media_contents.id`) :
// un appareil qui garde l'ancienne liste continue de modifier, supprimer et compter ses vues. Une façade se retire à la vague suivante.
import {
  albumTitle,
  MEDIA_GALLERY_MAX_PHOTOS,
  type MediaContentCreate,
  type MediaContentUpdate,
  type MediaContentView,
  mediaLabels,
} from "@orasso/shared";
import { and, desc, eq, isNull, lt, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { eventAlbumPhotos, eventAlbums, events } from "../../db/schema";
import { requireOrganizerWrite } from "../../lib/access";
import { now } from "../../lib/deps";
import { conflict, forbidden, notFound, validation } from "../../lib/errors";
import { rateLimit } from "../../lib/rateLimit";
import type { Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";
import { withTx } from "../../lib/tx";
import { eventsRepo } from "../events/repo";
import { contentView, type MediaContentRow } from "../media/serializers";
import { notificationsService } from "../notifications/service";
import { uploadsService } from "../uploads/service";
import { assertWritable, isAccredited, isUniqueViolation, mediaOfUser, requireMedia } from "./guards";
import { albumsService } from "./service";
import {
  type AlbumJoin,
  type AlbumPhotoRow,
  albumBase,
  albumPublicPhotoUrl,
  albumVisibleSql,
  isPrivateAlbumKey,
  loadFirstPhotos,
} from "./view";

/** Un album en `MediaContentView`, avec la forme d'avant au champ près. */
function legacyView({ a, e, m }: AlbumJoin, photos: AlbumPhotoRow[]): MediaContentView {
  // `contentView` fait le gros du travail ; seules les photos changent d'adresse quand leur clé est privée.
  const row: MediaContentRow = {
    id: a.id,
    mediaProfileId: a.mediaProfileId,
    eventId: a.eventId,
    kind: "gallery",
    title: albumTitle(a.title, e.title),
    url: null,
    platform: "other",
    photoKeys: [],
    featuredAt: a.officialAt,
    views: a.views,
    publishedAt: a.publishedAt ?? a.createdAt,
    deletedAt: a.deletedAt,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
  return {
    ...contentView(row, e, m),
    photos: photos
      .slice(0, MEDIA_GALLERY_MAX_PHOTOS)
      .map((p) =>
        isPrivateAlbumKey(p.storageKey)
          ? { key: p.id, url: albumPublicPhotoUrl(a.id, p.storageKey) }
          : { key: p.storageKey, url: storage.url(p.storageKey) ?? "" },
      ),
  };
}

async function viewsOf(rows: AlbumJoin[]): Promise<MediaContentView[]> {
  const photos = await loadFirstPhotos(
    db,
    rows.map((r) => r.a.id),
    MEDIA_GALLERY_MAX_PHOTOS,
  );
  return rows.map((r) => legacyView(r, photos.get(r.a.id) ?? []));
}

/** Les liens d'un côté, les albums de l'autre : l'album mis en avant (officiel) d'abord, puis les plus récents. */
export function mergeContents(links: MediaContentView[], albums: MediaContentView[]): MediaContentView[] {
  if (!albums.length) return links;
  return [...links, ...albums].sort(
    (a, b) => Number(b.featured) - Number(a.featured) || b.publishedAt.localeCompare(a.publishedAt),
  );
}

/** Un album publié du média, non supprimé (la cible d'une modification faite avec les routes d'avant). */
async function ownPublished(id: string, mediaProfileId: string) {
  const [row] = await db
    .select({ id: eventAlbums.id })
    .from(eventAlbums)
    .where(
      and(
        eq(eventAlbums.id, id),
        eq(eventAlbums.mediaProfileId, mediaProfileId),
        eq(eventAlbums.status, "published"),
        isNull(eventAlbums.deletedAt),
      ),
    );
  return row?.id ?? null;
}

async function contentById(id: string): Promise<MediaContentView> {
  const [row] = await albumBase().where(eq(eventAlbums.id, id));
  if (!row) throw notFound(mediaLabels.contentNotFound);
  const [view] = await viewsOf([row]);
  if (!view) throw notFound(mediaLabels.contentNotFound);
  return view;
}

/** Album déjà publié par ce média sur cet événement avec exactement ces clés (tentative rejouée). */
async function sameGallery(mediaProfileId: string, input: MediaContentCreate): Promise<string | null> {
  if (!input.photoKeys.length) return null;
  const res = await db.execute<{ id: string }>(sql`
    select a.id from event_albums a
    where a.media_profile_id = ${mediaProfileId} and a.event_id = ${input.eventId} and a.deleted_at is null
      and (select array_agg(p.storage_key order by p.position) from event_album_photos p
           where p.album_id = a.id and p.deleted_at is null) = ${sql.param(input.photoKeys)}::text[]
    limit 1`);
  return res.rows[0]?.id ?? null;
}

export const albumsLegacy = {
  /** `GET /events/by-slug/:slug/media-contents` : les albums publiés visibles de l'événement (sans session). */
  async forEvent(eventId: string): Promise<MediaContentView[]> {
    const rows = await albumBase().where(and(eq(eventAlbums.eventId, eventId), albumVisibleSql(now())));
    return viewsOf(rows);
  },

  /** `GET /media/:id/contents` : une page d'albums, par identifiant décroissant (comme les contenus d'avant). */
  async forMedia(mediaProfileId: string, limit: number, cursor?: string): Promise<MediaContentView[]> {
    const rows = await albumBase()
      .where(
        and(
          eq(eventAlbums.mediaProfileId, mediaProfileId),
          albumVisibleSql(now()),
          cursor ? lt(eventAlbums.id, cursor) : undefined,
        ),
      )
      .orderBy(desc(eventAlbums.id))
      .limit(limit);
    return viewsOf(rows);
  },

  /** `GET /me/media-contents` : mes albums publiés (jamais un brouillon : l'ancienne forme ne les connaît pas). */
  async mine(mediaProfileId: string): Promise<MediaContentView[]> {
    const rows = await albumBase().where(
      and(
        eq(eventAlbums.mediaProfileId, mediaProfileId),
        eq(eventAlbums.status, "published"),
        isNull(eventAlbums.deletedAt),
      ),
    );
    return viewsOf(rows);
  },

  /**
   * `POST /me/media-contents` avec `kind: "gallery"` (APK en ligne) : un album **publié** d'un coup, de ses clés `media_content` (30 au
   * plus, le chemin d'aujourd'hui). Rejouée avec les mêmes clés, elle rend l'album déjà publié, avant la limite de débit.
   */
  async createGallery(v: Viewer, input: MediaContentCreate): Promise<MediaContentView> {
    assertWritable(v);
    const profile = await mediaOfUser(db, v.user.id);
    if (profile) {
      const again = await sameGallery(profile.id, input);
      if (again) return contentById(again);
    }
    rateLimit("mediaContent", v.user.id);
    try {
      const id = await withTx(async (tx) => {
        const media = await requireMedia(tx, v);
        const [event] = await tx.select().from(events).where(eq(events.id, input.eventId));
        if (event?.status === "cancelled") throw conflict("conflict", mediaLabels.eventCancelled);
        if (!(await isAccredited(tx, input.eventId, media.id))) throw forbidden(mediaLabels.notAccredited);
        const uploaded = [];
        for (const key of input.photoKeys) {
          const up = await uploadsService.consume(tx, v.user.id, key, "media_content");
          if (!up) throw validation(mediaLabels.imageUnknown);
          uploaded.push(up);
        }
        const [album] = await tx
          .insert(eventAlbums)
          .values({
            eventId: input.eventId,
            mediaProfileId: media.id,
            authorId: v.user.id,
            title: input.title,
            status: "published",
            publishedAt: now(),
            photosCount: uploaded.length,
          })
          .returning({ id: eventAlbums.id });
        if (!album) throw new Error("Album non enregistré");
        await tx.insert(eventAlbumPhotos).values(
          uploaded.map((up, position) => ({
            albumId: album.id,
            storageKey: up.key,
            width: up.width,
            height: up.height,
            position,
            // Cette galerie vient du chemin d'avant : on ne sait pas si l'envoi a été flouté (l'état est « inconnu »).
            plateState: "unknown" as const,
          })),
        );
        return album.id;
      });
      return await contentById(id);
    } catch (error) {
      // Deux envois simultanés de la même galerie : le second échoue sur les clés que le premier vient de consommer.
      const media = await mediaOfUser(db, v.user.id);
      const winner = media ? await sameGallery(media.id, input) : null;
      if (winner) return contentById(winner);
      if (isUniqueViolation(error)) throw conflict("conflict", mediaLabels.imageUnknown);
      throw error;
    }
  },

  /** `PATCH /me/media-contents/:id` sur l'identifiant d'un album : son titre ; `null` si ce n'est pas un album du média. */
  async update(v: Viewer, id: string, input: MediaContentUpdate): Promise<MediaContentView | null> {
    const profile = await mediaOfUser(db, v.user.id);
    if (!profile || !(await ownPublished(id, profile.id))) return null;
    assertWritable(v);
    rateLimit("mediaWrite", v.user.id);
    // Seul le titre compte pour un album (ni adresse, ni plateforme) : sans titre, l'album est rendu tel quel.
    if (input.title !== undefined) await albumsService.patch(v, id, { title: input.title });
    return contentById(id);
  },

  /** `DELETE /me/media-contents/:id` sur l'identifiant d'un album ; `false` si ce n'est pas un album du média. */
  async remove(v: Viewer, id: string): Promise<boolean> {
    const profile = await mediaOfUser(db, v.user.id);
    if (!profile || !(await ownPublished(id, profile.id))) return false;
    await albumsService.remove(v, id);
    return true;
  },

  /**
   * `PATCH /events/:id/media-contents/:cid/feature` sur l'identifiant d'un album : l'organisateur le met en avant (= album officiel,
   * un seul par événement : l'ancien est retiré) ou le retire. `null` si ce n'est pas un album de l'événement. R9g pose la vraie route.
   */
  async feature(v: Viewer, eventId: string, id: string, featured: boolean): Promise<MediaContentView | null> {
    const [found] = await albumBase().where(
      and(
        eq(eventAlbums.id, id),
        eq(eventAlbums.eventId, eventId),
        eq(eventAlbums.status, "published"),
        isNull(eventAlbums.deletedAt),
      ),
    );
    if (!found) return null;
    const event = await eventsRepo.byId(eventId);
    await requireOrganizerWrite(v, event.structureId);
    if (event.status === "cancelled") throw conflict("conflict", mediaLabels.eventCancelled);
    await withTx(async (tx, after) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`album-official:${eventId}`}))`);
      const [row] = await tx
        .select()
        .from(eventAlbums)
        .where(and(eq(eventAlbums.id, id), isNull(eventAlbums.deletedAt)))
        .for("update");
      if (!row) throw notFound(mediaLabels.contentNotFound);
      if (featured) {
        if (!(await isAccredited(tx, eventId, row.mediaProfileId))) throw forbidden(mediaLabels.notAccredited);
      }
      const was = row.officialAt !== null;
      if (featured) {
        await tx
          .update(eventAlbums)
          .set({ officialAt: null })
          .where(
            and(
              eq(eventAlbums.eventId, eventId),
              sql`${eventAlbums.officialAt} is not null`,
              sql`${eventAlbums.id} <> ${id}`,
            ),
          );
      }
      await tx
        .update(eventAlbums)
        .set({ officialAt: featured ? (row.officialAt ?? now()) : null })
        .where(eq(eventAlbums.id, id));
      if (featured && !was && !found.m.deletedAt) {
        await notificationsService.notify(tx, found.m.userId, "media_content_featured", {
          title: mediaLabels.featuredTitle,
          body: mediaLabels.featuredBody(albumTitle(row.title, found.e.title), event.title),
          eventId: event.id,
          eventStartsAt: event.startsAt,
          data: { eventId: event.id, contentId: id, screen: "media_contents" },
          link: { label: "Voir l'événement", path: `/e/${event.slug}` },
        });
        after(() => notificationsService.kick());
      }
    });
    return contentById(id);
  },

  /**
   * `POST /media-contents/:id/view` sur l'identifiant d'un album : la cible de la vue (propriétaire, compteur) ou `null`. Le
   * dédoublonnage par session et par heure reste dans `mediaService.view`.
   */
  async viewTarget(id: string): Promise<{ views: number; ownerId: string; bump: () => Promise<number> } | null> {
    const [row] = await albumBase().where(
      and(eq(eventAlbums.id, id), eq(eventAlbums.status, "published"), isNull(eventAlbums.deletedAt)),
    );
    if (!row) return null;
    return {
      views: row.a.views,
      ownerId: row.m.userId,
      bump: async () => {
        const [updated] = await db
          .update(eventAlbums)
          .set({ views: sql`${eventAlbums.views} + 1` })
          .where(eq(eventAlbums.id, id))
          .returning({ views: eventAlbums.views });
        return updated?.views ?? row.a.views;
      },
    };
  },
};
