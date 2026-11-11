// Sans session (vague R8, lot R8a2, décision T4 de Damien du 11/11) : un visiteur non connecté ne voit **que les
// publications de l'organisateur**, sur la fiche de l'événement (le journal) et sur la page de la structure ; rien d'autre
// (ni publication d'une personne, d'un pro, d'un prestataire ou d'un média, ni mention, ni commentaire). Un type à part,
// `PublicPostView`, en liste blanche : ni `reactedByMe`, ni commentaires, ni co-auteur, ni `mine`, ni rien de la personne qui
// a publié. Les photos du Fil exigent une session : `GET /public/feed-posts/:id/photos/:nom` ne sert que celles d'une
// publication d'organisateur non retirée d'une structure en règle.
import {
  type AuthorKey,
  type AuthorPostsFilter,
  feedListErrors,
  type PublicPostsPage,
  type PublicPostView,
} from "@orasso/shared";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import { db } from "../../db/client";
import { feedPostPhotos, feedPosts, profiles, structures } from "../../db/schema";
import { notFound } from "../../lib/errors";
import { storage } from "../../lib/storage";
import type { Executor } from "../../lib/tx";
import { UUID_RE } from "./access";
import { EVENT_VISUAL_SIZE, eventVisualUrl, loadAttachViews } from "./attach";
import { loadPageInfo } from "./authors";
import { authorPostIds, decodeCursor, journalPostIds, pageInGoodStanding, pageOf, requireJournalEvent } from "./lists";
import { FEED_PHOTO_NAME_RE, feedPhotoKey, feedPhotoName } from "./posts";

/**
 * Structures vérifiées parmi `ids` : une structure en attente ou refusée n'est lisible que de ses membres
 * (`structuresService.getPublic`), jamais par un visiteur : ni ses publications, ni ses photos.
 */
async function verifiedStructures(ex: Executor, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const rows = await ex
    .select({ id: structures.id })
    .from(structures)
    .where(and(inArray(structures.id, ids), eq(structures.verification, "verified"), isNull(structures.deletedAt)));
  return new Set(rows.map((r) => r.id));
}

/** Adresse publique d'une photo d'une publication d'organisateur (jamais `/api/feed-posts/…`, qui exige une session). */
export const publicPhotoUrl = (postId: string, storageKey: string) =>
  `/api/public/feed-posts/${postId}/photos/${feedPhotoName(storageKey)}`;

/**
 * Les publications d'organisateur données, dans l'ordre, en `PublicPostView`. Défense en profondeur : même si l'appelant
 * se trompe d'identifiants, une publication qui n'est pas celle d'un organisateur en règle n'est jamais servie.
 */
export async function loadPublicViews(ex: Executor, ids: string[], at: Date): Promise<PublicPostView[]> {
  if (!ids.length) return [];
  const rows = await ex
    .select({ post: feedPosts, author: profiles })
    .from(feedPosts)
    .innerJoin(profiles, eq(profiles.userId, feedPosts.authorId))
    .where(and(inArray(feedPosts.id, ids), isNull(feedPosts.deletedAt), eq(feedPosts.persona, "organizer")));
  const pages = await loadPageInfo(
    ex,
    rows.map((r) => r.post),
  );
  const verified = await verifiedStructures(
    ex,
    rows.flatMap((r) => (r.post.structureId ? [r.post.structureId] : [])),
  );
  const ok = rows.filter((r) => {
    const page = r.post.structureId ? pages.get(`s:${r.post.structureId}`) : undefined;
    return page?.inGoodStanding && !r.author.bannedAt && r.post.structureId && verified.has(r.post.structureId);
  });
  if (!ok.length) return [];
  const photos = await ex
    .select()
    .from(feedPostPhotos)
    .where(
      inArray(
        feedPostPhotos.postId,
        ok.map((r) => r.post.id),
      ),
    )
    .orderBy(asc(feedPostPhotos.position));
  const attaches = await loadAttachViews(
    ex,
    ok.map((r) => ({
      id: r.post.id,
      authorId: r.post.authorId,
      persona: r.post.persona,
      eventId: r.post.eventId,
      eventRole: r.post.eventRole,
    })),
    at,
  );
  const byId = new Map(ok.map((r) => [r.post.id, r]));
  return ids.flatMap((id): PublicPostView[] => {
    const r = byId.get(id);
    if (!r) return [];
    const page = pages.get(`s:${r.post.structureId}`);
    const attached = attaches.get(id);
    const own = photos
      .filter((p) => p.postId === id)
      .map((p) => ({ url: publicPhotoUrl(id, p.storageKey), width: p.width, height: p.height }));
    const poster = !own.length && attached ? eventVisualUrl(attached.event) : null;
    if (!page || (!own.length && !poster)) return [];
    return [
      {
        id,
        // La page seulement : jamais le pseudo ni l'identifiant de qui a publié.
        author: {
          key: page.view.key,
          kind: page.view.kind,
          name: page.view.name,
          avatarUrl: page.view.avatarUrl,
          verified: page.view.verified,
        },
        caption: r.post.caption,
        photos: own.length ? own : [{ url: poster as string, ...EVENT_VISUAL_SIZE }],
        visual: own.length ? "photos" : "event_poster",
        attach: attached ? attached.attach : null,
        placeLabel: attached ? attached.event.city : r.post.placeLabel,
        important: r.post.importantReason
          ? { reason: r.post.importantReason, sentAt: r.post.importantSentAt?.toISOString() ?? null }
          : null,
        pinned: r.post.pinnedAt !== null,
        reactionsCount: r.post.reactionsCount,
        createdAt: r.post.createdAt.toISOString(),
      },
    ];
  });
}

/** Le journal d'un événement, sans session : l'épinglée en tête de la première page. */
export async function publicJournal(
  eventId: string,
  rawCursor: string | undefined,
  at: Date,
): Promise<PublicPostsPage> {
  const event = await requireJournalEvent(db, eventId);
  if (!(await verifiedStructures(db, [event.structureId])).has(event.structureId))
    throw notFound(feedListErrors.eventNotFound);
  const { ids, nextCursor } = await journalPostIds(db, event, decodeCursor(rawCursor), at);
  return { items: await loadPublicViews(db, ids, at), nextCursor };
}

/** Les publications d'une structure, sans session (toute autre clé exige une session : 401 côté route). */
export async function publicStructurePosts(
  key: AuthorKey,
  q: { cursor?: string; filter: AuthorPostsFilter },
  at: Date,
): Promise<PublicPostsPage> {
  if (
    key.kind !== "structure" ||
    !(await pageInGoodStanding(db, key)) ||
    !(await verifiedStructures(db, [key.id])).has(key.id)
  ) {
    throw notFound(feedListErrors.authorNotFound);
  }
  const rows = await authorPostIds(db, key, q.filter, decodeCursor(q.cursor), at);
  const { page, nextCursor } = pageOf(rows);
  return {
    items: await loadPublicViews(
      db,
      page.map((r) => r.id),
      at,
    ),
    nextCursor,
  };
}

/**
 * `GET /public/feed-posts/:id/photos/:nom` : une photo d'une publication d'organisateur non retirée, d'une structure en
 * règle ; 404 pour tout le reste (publication d'une personne, d'un pro, d'un prestataire ou d'un média, retirée, page
 * supprimée ou suspendue). Le fichier ne change jamais sous une même clé : son nom sert d'`ETag`.
 */
export async function publicPhoto(
  id: string,
  name: string,
  ifNoneMatch: string | undefined,
): Promise<{ status: 304; etag: string } | { status: 200; etag: string; data: Buffer }> {
  if (!UUID_RE.test(id) || !FEED_PHOTO_NAME_RE.test(name)) throw notFound(feedListErrors.photoNotFound);
  const [post] = await db
    .select({ post: feedPosts, author: profiles })
    .from(feedPosts)
    .innerJoin(profiles, eq(profiles.userId, feedPosts.authorId))
    .where(and(eq(feedPosts.id, id), isNull(feedPosts.deletedAt), eq(feedPosts.persona, "organizer")));
  if (!post || post.author.bannedAt) throw notFound(feedListErrors.photoNotFound);
  const page = (await loadPageInfo(db, [post.post])).get(`s:${post.post.structureId}`);
  if (
    !page?.inGoodStanding ||
    !post.post.structureId ||
    !(await verifiedStructures(db, [post.post.structureId])).has(post.post.structureId)
  ) {
    throw notFound(feedListErrors.photoNotFound);
  }
  const key = feedPhotoKey(id, name.slice(0, -".webp".length));
  const [known] = await db
    .select({ id: feedPostPhotos.id })
    .from(feedPostPhotos)
    .where(and(eq(feedPostPhotos.postId, id), eq(feedPostPhotos.storageKey, key)));
  if (!known) throw notFound(feedListErrors.photoNotFound);
  const etag = `"${name.slice(0, -".webp".length)}"`;
  const sent = (ifNoneMatch ?? "").split(",").map((t) => t.trim().replace(/^W\//, ""));
  if (sent.includes(etag)) return { status: 304, etag };
  const data = await storage.get(key);
  if (!data) throw notFound(feedListErrors.photoNotFound);
  return { status: 200, etag, data };
}
