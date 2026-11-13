// Façade des albums pour l'APK en ligne (lot R9e, ARCHITECTURE-R8 § 3.2) : les routes `media-contents` d'avant servent les **liens** de
// `media_contents` et les **albums** publiés, mis en forme `contentView` (`kind: "gallery"`, 30 photos au plus, `featured` = album
// officiel). Une galerie reprise garde l'identifiant de son ancien contenu (la migration pose `event_albums.id = media_contents.id`) :
// un appareil qui garde l'ancienne liste continue de modifier, supprimer et compter ses vues. Une façade se retire à la vague suivante.

import { randomBytes, randomUUID } from "node:crypto";
import {
  albumTitle,
  MEDIA_GALLERY_MAX_PHOTOS,
  type MediaContentCreate,
  type MediaContentUpdate,
  type MediaContentView,
  mediaLabels,
} from "@orasso/shared";
import { and, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { eventAlbumPhotos, eventAlbums, events, legacyFileBlocks } from "../../db/schema";
import { now } from "../../lib/deps";
import { conflict, forbidden, notFound, validation } from "../../lib/errors";
import { rateLimit } from "../../lib/rateLimit";
import type { Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";
import { withTx } from "../../lib/tx";
import { contentView, type MediaContentRow } from "../media/serializers";
import { notificationsService } from "../notifications/service";
import { uploadsService } from "../uploads/service";
import { assertWritable, isAccredited, isUniqueViolation, mediaOfUser, requireMedia } from "./guards";
import { setAlbumOfficial } from "./official";
import { albumsService, removeFiles } from "./service";
import {
  type AlbumJoin,
  type AlbumPhotoRow,
  albumBase,
  albumPhotoKey,
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

/**
 * `ownerOf` : la liste du titulaire (« Mes contenus ») : un album devenu invisible (accréditation retombée…) reste listé (titre, vues) mais
 * **sans photos** (`photos: []`) : l'APK en ligne charge les images sans jeton, une adresse protégée y donnerait 401 et une adresse publique
 * 404. L'appli nouvelle (R9e-2) charge les photos protégées avec le mécanisme authentifié de `CrewPhotoImage`.
 */
async function viewsOf(rows: AlbumJoin[], ownerOf = false): Promise<MediaContentView[]> {
  const ids = rows.map((r) => r.a.id);
  const photos = await loadFirstPhotos(db, ids, MEDIA_GALLERY_MAX_PHOTOS);
  const visible = new Set<string>();
  if (ownerOf && ids.length) {
    const seen = await albumBase().where(and(inArray(eventAlbums.id, ids), albumVisibleSql(now())));
    for (const r of seen) visible.add(r.a.id);
  }
  return rows.map((r) => legacyView(r, ownerOf && !visible.has(r.a.id) ? [] : (photos.get(r.a.id) ?? [])));
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

async function contentById(id: string, ownerOf = false): Promise<MediaContentView> {
  const [row] = await albumBase().where(eq(eventAlbums.id, id));
  if (!row) throw notFound(mediaLabels.contentNotFound);
  const [view] = await viewsOf([row], ownerOf);
  if (!view) throw notFound(mediaLabels.contentNotFound);
  return view;
}

/**
 * Album déjà publié par ce média sur cet événement avec exactement ces envois (tentative rejouée). Les photos copiées gardent la clé de leur
 * original (`legacy_source_key`) ; celles d'une galerie reprise par la migration ou publiée avant le correctif ont gardé cette clé comme
 * `storage_key`.
 */
async function sameGallery(mediaProfileId: string, input: MediaContentCreate): Promise<string | null> {
  if (!input.photoKeys.length) return null;
  const res = await db.execute<{ id: string }>(sql`
    select a.id from event_albums a
    where a.media_profile_id = ${mediaProfileId} and a.event_id = ${input.eventId} and a.deleted_at is null
      and (select array_agg(coalesce(p.legacy_source_key, p.storage_key) order by p.position) from event_album_photos p
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

  /**
   * `GET /events/:id/accreditations` (organisation) : les albums **visibles** de l'événement (publiés, média accrédité et en règle, événement
   * publié et pas sur invitation : règle V6). Un album devenu invisible n'est plus proposé à « Mettre en avant » ; sur un événement
   * `invite_only`, la page presse n'affiche aucun album.
   */
  async forOrganizer(eventId: string): Promise<MediaContentView[]> {
    const rows = await albumBase().where(and(eq(eventAlbums.eventId, eventId), albumVisibleSql(now())));
    return viewsOf(rows);
  },

  /** « Mes accréditations » : par média et événement, le nombre d'albums publiés et leurs vues (la couverture). */
  async coverage(
    profileIds: string[],
    eventIds: string[],
  ): Promise<{ profileId: string; eventId: string; n: number; views: number }[]> {
    if (!profileIds.length || !eventIds.length) return [];
    const rows = await db
      .select({
        profileId: eventAlbums.mediaProfileId,
        eventId: eventAlbums.eventId,
        n: sql<number>`count(*)::int`,
        views: sql<number>`coalesce(sum(${eventAlbums.views}), 0)::int`,
      })
      .from(eventAlbums)
      .where(
        and(
          inArray(eventAlbums.mediaProfileId, profileIds),
          inArray(eventAlbums.eventId, eventIds),
          eq(eventAlbums.status, "published"),
          isNull(eventAlbums.deletedAt),
        ),
      )
      .groupBy(eventAlbums.mediaProfileId, eventAlbums.eventId);
    return rows;
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
    return viewsOf(rows, true);
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
      if (again) return contentById(again, true);
    }
    rateLimit("mediaContent", v.user.id);
    const written: string[] = [];
    const sources: string[] = [];
    let committed = false;
    try {
      const id = await withTx(async (tx) => {
        const media = await requireMedia(tx, v);
        const [event] = await tx.select().from(events).where(eq(events.id, input.eventId));
        if (event?.status === "cancelled") throw conflict("conflict", mediaLabels.eventCancelled);
        if (!(await isAccredited(tx, input.eventId, media.id))) throw forbidden(mediaLabels.notAccredited);
        // Comme `addPhoto` : les photos sont copiées sous une clé **privée** d'album (jamais lisibles par `/api/files`) ; l'envoi
        // d'origine (public) est effacé après la validation (`removeOrRetry`). La clé de l'envoi est gardée dans `legacy_source_key` (rejeu
        // d'une galerie, `sameGallery`) et **bloquée** dans `legacy_file_blocks` (accès : `/api/files` répond 404 tant que le fichier existe,
        // même si l'album, l'événement ou le compte disparaissent).
        const albumId = randomUUID();
        const uploaded: { key: string; width: number | null; height: number | null; sourceKey: string }[] = [];
        for (const key of input.photoKeys) {
          const up = await uploadsService.consume(tx, v.user.id, key, "media_content");
          if (!up) throw validation(mediaLabels.imageUnknown);
          // Un envoi dont le fichier manque est refusé, comme un envoi inconnu.
          const data = await storage.get(up.key);
          if (!data) throw validation(mediaLabels.imageUnknown);
          const target = albumPhotoKey(albumId, randomBytes(16).toString("hex"));
          await storage.put(target, data);
          written.push(target);
          sources.push(up.key);
          await tx.insert(legacyFileBlocks).values({ key: up.key }).onConflictDoNothing();
          uploaded.push({ key: target, width: up.width, height: up.height, sourceKey: up.key });
        }
        const [album] = await tx
          .insert(eventAlbums)
          .values({
            id: albumId,
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
            legacySourceKey: up.sourceKey,
            // Cette galerie vient du chemin d'avant : on ne sait pas si l'envoi a été flouté (l'état est « inconnu »).
            plateState: "unknown" as const,
          })),
        );
        return album.id;
      });
      committed = true;
      await removeFiles(sources);
      return await contentById(id, true);
    } catch (error) {
      if (!committed) await removeFiles(written);
      // Deux envois simultanés de la même galerie : le second échoue sur les clés que le premier vient de consommer.
      const media = await mediaOfUser(db, v.user.id);
      const winner = media ? await sameGallery(media.id, input) : null;
      if (winner) return contentById(winner, true);
      if (isUniqueViolation(error)) throw conflict("conflict", mediaLabels.imageUnknown);
      throw error;
    }
  },

  /** `PATCH /me/media-contents/:id` sur l'identifiant d'un album : son titre ; `null` si ce n'est pas un album du média. */
  async update(v: Viewer, id: string, input: MediaContentUpdate): Promise<MediaContentView | null> {
    const profile = await mediaOfUser(db, v.user.id);
    if (!profile || !(await ownPublished(id, profile.id))) return null;
    // La limite d'écriture est comptée une seule fois, par `albumsService.patch`.
    assertWritable(v);
    // Seul le titre compte pour un album (ni adresse, ni plateforme) : sans titre, l'album est rendu tel quel.
    if (input.title !== undefined) await albumsService.patch(v, id, { title: input.title });
    return contentById(id, true);
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
    // R9g : la même fonction que la route neuve (`PUT|DELETE /events/:id/albums/:albumId/official`) ; la façade d'avant prévenait le média.
    await setAlbumOfficial(v, eventId, id, featured, async (tx, after, { event }) => {
      if (found.m.deletedAt) return;
      await notificationsService.notify(tx, found.m.userId, "media_content_featured", {
        title: mediaLabels.featuredTitle,
        body: mediaLabels.featuredBody(albumTitle(found.a.title, found.e.title), event.title),
        eventId: event.id,
        eventStartsAt: event.startsAt,
        data: { eventId: event.id, contentId: id, screen: "media_contents" },
        link: { label: "Voir l'événement", path: `/e/${event.slug}` },
      });
      after(() => notificationsService.kick());
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
