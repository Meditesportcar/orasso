// Le Fil (lot R7e1) : lecture des publications (liste blanche des champs de `FeedPostView`), retrait. Toute lecture
// repasse par `canSeeFeedPost` : une publication qu'on ne peut pas voir est omise, quel que soit l'appelant.
import {
  authorKeyOf,
  canSeeFeedPost,
  type FeedAuthorView,
  type FeedCommentPreview,
  type FeedPerson,
  type FeedPostView,
} from "@orasso/shared";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import {
  eventAnnouncements,
  feedPostCoauthors,
  feedPostPhotos,
  feedPostReactions,
  feedPosts,
  profiles,
  userFollows,
  vehicles,
} from "../../db/schema";
import { managedPageKeys } from "../../lib/authorship";
import { storage } from "../../lib/storage";
import type { Executor, Tx } from "../../lib/tx";
import { commercialViews } from "../partnerships/commercial";
import type { Profile } from "../profiles/repo";
import { vehiclesRepo } from "../vehicles/repo";
import { vehicleLabel } from "../vehicles/serializers";
import { factsOf } from "./access";
import { EVENT_VISUAL_SIZE, eventVisualUrl, loadAttachViews } from "./attach";
import { loadPageInfo, pageKeyOf } from "./authors";
import { dropCoauthorNotifications, loadCoAuthors } from "./coauthors";
import { eventSummariesByIds } from "./summary";

export const personOf = (p: Pick<Profile, "pseudo" | "avatarKey" | "grade" | "official">): FeedPerson => ({
  pseudo: p.pseudo,
  avatarUrl: storage.url(p.avatarKey),
  grade: p.grade,
  // Donnée administrée (seed, puis l'administration), jamais déduite du pseudo.
  official: p.official,
});

/** La personne comme auteur d'une publication (vague R8) : sa clé `u:`, son pseudo comme nom. */
export const personAuthorView = (
  userId: string,
  p: Pick<Profile, "pseudo" | "avatarKey" | "grade" | "official">,
): FeedAuthorView => ({
  key: authorKeyOf("user", userId),
  kind: "user",
  name: p.pseudo,
  avatarUrl: storage.url(p.avatarKey),
  verified: false,
  pseudo: p.pseudo,
  grade: p.grade,
  official: p.official,
});

/**
 * Les deux derniers commentaires de chaque publication (R8k1 s'y branche sans toucher ce fichier). Le chargeur reçoit
 * toutes les publications visibles d'un coup (jamais une requête par publication) et le regard de la personne.
 */
export type LastCommentsLoader = (
  ex: Executor,
  postIds: string[],
  viewerId: string,
  at: Date,
) => Promise<Map<string, FeedCommentPreview[]>>;
let lastCommentsLoader: LastCommentsLoader = async () => new Map();
export function registerLastComments(loader: LastCommentsLoader): void {
  lastCommentsLoader = loader;
}

/** Dossier des photos du Fil : clés privées, servies seulement par `GET /feed-posts/:id/photos/:nom` (jamais `/api/files`). */
export const FEED_PHOTO_FOLDER = "private/feed/";

/** Clé privée d'une photo du Fil (jamais de nom de personne dans la clé). */
export const feedPhotoKey = (postId: string, hex: string) => `${FEED_PHOTO_FOLDER}${postId}/${hex}.webp`;

/** Nom d'une photo dans l'adresse : la fin de sa clé (`<32 hex>.webp`). */
export const feedPhotoName = (storageKey: string) => storageKey.slice(storageKey.lastIndexOf("/") + 1);

/** Adresse protégée d'une photo : la route revérifie, à chaque lecture, que la personne peut voir la publication. */
export const feedPhotoUrl = (postId: string, storageKey: string) =>
  `/api/feed-posts/${postId}/photos/${feedPhotoName(storageKey)}`;

/** Nom de fichier accepté dans l'adresse d'une photo. */
export const FEED_PHOTO_NAME_RE = /^[0-9a-f]{32}\.webp$/;

/**
 * Publications visibles de `viewerId` parmi `ids`, dans l'ordre de `ids`. Les publications absentes, retirées, d'un
 * compte hors règle ou d'un compte privé non suivi sont omises.
 */
export async function loadPostViews(
  ex: Executor,
  ids: string[],
  viewerId: string,
  at: Date,
  /** Lot R9a : la flamme est celle de la personne même quand la publication est lue avec le regard public d'une page. */
  flamerId: string = viewerId,
  /** Lot R9a : en casquette, la page active est la seule dont on a les droits (invitation de co-signature, `mine`). */
  managedKeys?: ReadonlySet<string>,
): Promise<FeedPostView[]> {
  if (!ids.length) return [];
  const rows = await ex
    .select({ post: feedPosts, author: profiles })
    .from(feedPosts)
    .innerJoin(profiles, eq(profiles.userId, feedPosts.authorId))
    .where(and(inArray(feedPosts.id, ids), isNull(feedPosts.deletedAt)));
  if (!rows.length) return [];
  // Publications de pages : la page (nom, logo) et son état, en une requête par sorte de page.
  const pages = await loadPageInfo(
    ex,
    rows.map((r) => r.post),
  );
  const fanAuthorIds = [...new Set(rows.filter((r) => r.post.persona === "fan").map((r) => r.post.authorId))];
  const followed = new Set(
    fanAuthorIds.length
      ? (
          await ex
            .select({ id: userFollows.followedId })
            .from(userFollows)
            .where(
              and(
                eq(userFollows.followerId, viewerId),
                inArray(userFollows.followedId, fanAuthorIds),
                eq(userFollows.status, "accepted"),
              ),
            )
        ).map((r) => r.id)
      : [],
  );
  const visible = rows.filter((r) => {
    const key = pageKeyOf(r.post);
    return canSeeFeedPost(
      { userId: viewerId },
      factsOf(r, at, key ? (pages.get(key)?.inGoodStanding ?? false) : false),
      { followAccepted: r.post.authorId === viewerId || followed.has(r.post.authorId) },
    );
  });
  if (!visible.length) return [];
  const postIds = visible.map((r) => r.post.id);
  const photos = await ex
    .select()
    .from(feedPostPhotos)
    .where(inArray(feedPostPhotos.postId, postIds))
    .orderBy(asc(feedPostPhotos.position));
  const mine = new Set(
    (
      await ex
        .select({ id: feedPostReactions.postId })
        .from(feedPostReactions)
        .where(and(inArray(feedPostReactions.postId, postIds), eq(feedPostReactions.userId, flamerId)))
    ).map((r) => r.id),
  );
  const vehicleIds = [...new Set(visible.flatMap((r) => (r.post.vehicleId ? [r.post.vehicleId] : [])))];
  const vehicleRows = vehicleIds.length
    ? (await vehiclesRepo.findFullByIds(vehicleIds, ex)).filter((v) => v.status === "active")
    : [];
  const vehicleById = new Map(vehicleRows.map((v) => [v.id, v]));
  const events = await eventSummariesByIds(
    ex,
    visible.flatMap((r) => (r.post.eventId ? [r.post.eventId] : [])),
  );
  // Rattachement (rôle, phase, présence validée), par lots.
  const attaches = await loadAttachViews(
    ex,
    visible.map((r) => ({
      id: r.post.id,
      authorId: r.post.authorId,
      persona: r.post.persona,
      eventId: r.post.eventId,
      eventRole: r.post.eventRole,
    })),
    at,
  );
  // « Mes » publications de page : les pages que je gère (affichage seulement, sans second facteur).
  const managed =
    managedKeys ??
    (visible.some((r) => r.post.persona !== "fan") ? await managedPageKeys(viewerId, ex) : new Set<string>());

  const commercialBy = await commercialViews(
    ex,
    visible.map((r) => r.post.commercialPartnerId),
  );
  const lastComments = await lastCommentsLoader(ex, postIds, viewerId, at);
  // Collaboration (R8o) : le co-auteur seulement s'il a accepté ; l'état de l'invitation à l'auteur d'origine seul.
  const coAuthors = await loadCoAuthors(
    ex,
    visible.map((r) => {
      const k = pageKeyOf(r.post);
      return { id: r.post.id, mine: k ? managed.has(k) : r.post.authorId === viewerId };
    }),
    viewerId,
    managedKeys,
  );
  const byId = new Map(visible.map((r) => [r.post.id, r]));
  return ids.flatMap((id): FeedPostView[] => {
    const r = byId.get(id);
    if (!r) return [];
    const key = pageKeyOf(r.post);
    const page = key ? pages.get(key) : undefined;
    const attached = attaches.get(r.post.id);
    const own = photos
      .filter((p) => p.postId === r.post.id)
      .map((p) => ({ url: feedPhotoUrl(r.post.id, p.storageKey), width: p.width, height: p.height }));
    // Sans photo propre : l'affiche de l'événement (une référence, jamais une copie). Sans affiche non plus, ou sans
    // événement, la publication n'est pas servie.
    const poster = !own.length && attached ? eventVisualUrl(attached.event) : null;
    if (!own.length && !poster) return [];
    const vehicle = r.post.vehicleId ? vehicleById.get(r.post.vehicleId) : undefined;
    const event = r.post.eventId ? events.get(r.post.eventId) : undefined;
    return [
      {
        id: r.post.id,
        author: page ? page.view : personAuthorView(r.post.authorId, r.author),
        caption: r.post.caption,
        aspect: r.post.aspect,
        photos: own.length ? own : [{ url: poster as string, ...EVENT_VISUAL_SIZE }],
        vehicle: vehicle ? { id: vehicle.id, label: vehicleLabel(vehicle) } : null,
        event: event
          ? { slug: event.slug, title: event.title }
          : attached
            ? { slug: attached.event.slug, title: attached.event.title }
            : null,
        reactionsCount: r.post.reactionsCount,
        reactedByMe: mine.has(r.post.id),
        createdAt: r.post.createdAt.toISOString(),
        mine: key ? managed.has(key) : r.post.authorId === viewerId,
        commercialPartner: r.post.commercialPartnerId ? (commercialBy.get(r.post.commercialPartnerId) ?? null) : null,
        coAuthor: coAuthors.get(r.post.id)?.coAuthor ?? null,
        coAuthorInvite: coAuthors.get(r.post.id)?.invite ?? null,
        coAuthoredByMe: coAuthors.get(r.post.id)?.byMe ?? false,
        attach: attached ? attached.attach : null,
        placeLabel: attached ? attached.event.city : r.post.placeLabel,
        visual: own.length ? "photos" : "event_poster",
        important: r.post.importantReason
          ? { reason: r.post.importantReason, sentAt: r.post.importantSentAt?.toISOString() ?? null }
          : null,
        pinned: r.post.pinnedAt !== null,
        commentsCount: r.post.commentsCount,
        commentsOff: r.post.commentsOff,
        lastComments: lastComments.get(r.post.id) ?? [],
      },
    ];
  });
}

/**
 * Retrait d'une publication (par son auteur ou la modération), dans la transaction de l'appelant : suppression douce,
 * photos et flammes effacées. Rend les clés des fichiers à effacer après la validation.
 * `keepPhotos` : un signalement attend sa décision, les photos restent (la modération les lit) ; elles partent à la
 * décision (`afterDecision` de la cible `feed_post`).
 */
export async function softDeletePost(
  tx: Tx,
  postId: string,
  deletedBy: string,
  at: Date,
  opts: { keepPhotos?: boolean } = {},
): Promise<string[]> {
  const [done] = await tx
    .update(feedPosts)
    .set({ deletedAt: at, deletedBy })
    .where(and(eq(feedPosts.id, postId), isNull(feedPosts.deletedAt)))
    .returning({ id: feedPosts.id, legacy: feedPosts.legacyAnnouncementId });
  if (!done) return [];
  await tx.delete(feedPostReactions).where(eq(feedPostReactions.postId, postId));
  // La suppression emporte la co-signature (R8o) : plus d'invitation, plus de demande, plus de notification.
  await dropCoauthorNotifications(tx, postId);
  await tx.delete(feedPostCoauthors).where(eq(feedPostCoauthors.postId, postId));
  // Lot R8d : une publication qui a repris une annonce emporte l'annonce d'origine (la façade des annonces la servait encore,
  // texte et image, y compris sans session). L'image publique de l'annonce part avec les autres fichiers, après la validation.
  const keys: string[] = [];
  if (done.legacy) {
    const [old] = await tx
      .select({ imageKey: eventAnnouncements.imageKey })
      .from(eventAnnouncements)
      .where(and(eq(eventAnnouncements.id, done.legacy), isNull(eventAnnouncements.deletedAt)))
      .for("update");
    if (old) {
      await tx
        .update(eventAnnouncements)
        .set({ deletedAt: at, imageKey: null, imageWidth: null, imageHeight: null })
        .where(eq(eventAnnouncements.id, done.legacy));
      if (old.imageKey) keys.push(old.imageKey);
    }
  }
  if (opts.keepPhotos) return keys;
  const photos = await tx
    .delete(feedPostPhotos)
    .where(eq(feedPostPhotos.postId, postId))
    .returning({ key: feedPostPhotos.storageKey });
  return [...keys, ...photos.map((p) => p.key)];
}

/** Véhicule actif de l'auteur (le véhicule d'une publication est toujours le sien). */
export async function ownActiveVehicle(ex: Executor, ownerId: string, vehicleId: string) {
  const [row] = await ex
    .select({ id: vehicles.id })
    .from(vehicles)
    .where(and(eq(vehicles.id, vehicleId), eq(vehicles.ownerId, ownerId), eq(vehicles.status, "active")));
  return row;
}
