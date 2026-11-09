// Le Fil (lot R7e1) : lecture des publications (liste blanche des champs de `FeedPostView`), retrait. Toute lecture
// repasse par `canSeeFeedPost` : une publication qu'on ne peut pas voir est omise, quel que soit l'appelant.
import { canSeeFeedPost, type FeedPerson, type FeedPostView, isOfficialPseudo } from "@orasso/shared";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import { feedPostPhotos, feedPostReactions, feedPosts, profiles, userFollows, vehicles } from "../../db/schema";
import { storage } from "../../lib/storage";
import type { Executor, Tx } from "../../lib/tx";
import type { Profile } from "../profiles/repo";
import { vehiclesRepo } from "../vehicles/repo";
import { vehicleLabel } from "../vehicles/serializers";
import { factsOf } from "./access";
import { eventSummariesByIds } from "./summary";

export const personOf = (p: Pick<Profile, "pseudo" | "avatarKey" | "grade">): FeedPerson => ({
  pseudo: p.pseudo,
  avatarUrl: storage.url(p.avatarKey),
  grade: p.grade,
  official: isOfficialPseudo(p.pseudo),
});

/** Clé publique d'une photo du Fil (jamais de nom de personne dans la clé). */
export const feedPhotoKey = (postId: string, hex: string) => `feed/${postId}/${hex}.webp`;

/**
 * Publications visibles de `viewerId` parmi `ids`, dans l'ordre de `ids`. Les publications absentes, retirées, d'un
 * compte hors règle ou d'un compte privé non suivi sont omises.
 */
export async function loadPostViews(ex: Executor, ids: string[], viewerId: string, at: Date): Promise<FeedPostView[]> {
  if (!ids.length) return [];
  const rows = await ex
    .select({ post: feedPosts, author: profiles })
    .from(feedPosts)
    .innerJoin(profiles, eq(profiles.userId, feedPosts.authorId))
    .where(and(inArray(feedPosts.id, ids), isNull(feedPosts.deletedAt)));
  if (!rows.length) return [];
  const authorIds = [...new Set(rows.map((r) => r.post.authorId))];
  const followed = new Set(
    (
      await ex
        .select({ id: userFollows.followedId })
        .from(userFollows)
        .where(
          and(
            eq(userFollows.followerId, viewerId),
            inArray(userFollows.followedId, authorIds),
            eq(userFollows.status, "accepted"),
          ),
        )
    ).map((r) => r.id),
  );
  const visible = rows.filter((r) =>
    canSeeFeedPost({ userId: viewerId }, factsOf(r, at), {
      followAccepted: r.post.authorId === viewerId || followed.has(r.post.authorId),
    }),
  );
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
        .where(and(inArray(feedPostReactions.postId, postIds), eq(feedPostReactions.userId, viewerId)))
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

  const byId = new Map(visible.map((r) => [r.post.id, r]));
  return ids.flatMap((id): FeedPostView[] => {
    const r = byId.get(id);
    if (!r) return [];
    const vehicle = r.post.vehicleId ? vehicleById.get(r.post.vehicleId) : undefined;
    const event = r.post.eventId ? events.get(r.post.eventId) : undefined;
    return [
      {
        id: r.post.id,
        author: personOf(r.author),
        caption: r.post.caption,
        aspect: r.post.aspect,
        photos: photos
          .filter((p) => p.postId === r.post.id)
          .map((p) => ({ url: storage.url(p.storageKey) ?? "", width: p.width, height: p.height })),
        vehicle: vehicle ? { id: vehicle.id, label: vehicleLabel(vehicle) } : null,
        event: event ? { slug: event.slug, title: event.title } : null,
        reactionsCount: r.post.reactionsCount,
        reactedByMe: mine.has(r.post.id),
        createdAt: r.post.createdAt.toISOString(),
        mine: r.post.authorId === viewerId,
      },
    ];
  });
}

/**
 * Retrait d'une publication (par son auteur ou la modération), dans la transaction de l'appelant : suppression douce,
 * photos et flammes effacées. Rend les clés des fichiers à effacer après la validation.
 */
export async function softDeletePost(tx: Tx, postId: string, deletedBy: string, at: Date): Promise<string[]> {
  const [done] = await tx
    .update(feedPosts)
    .set({ deletedAt: at, deletedBy })
    .where(and(eq(feedPosts.id, postId), isNull(feedPosts.deletedAt)))
    .returning({ id: feedPosts.id });
  if (!done) return [];
  const photos = await tx
    .delete(feedPostPhotos)
    .where(eq(feedPostPhotos.postId, postId))
    .returning({ key: feedPostPhotos.storageKey });
  await tx.delete(feedPostReactions).where(eq(feedPostReactions.postId, postId));
  return photos.map((p) => p.key);
}

/** Véhicule actif de l'auteur (le véhicule d'une publication est toujours le sien). */
export async function ownActiveVehicle(ex: Executor, ownerId: string, vehicleId: string) {
  const [row] = await ex
    .select({ id: vehicles.id })
    .from(vehicles)
    .where(and(eq(vehicles.id, vehicleId), eq(vehicles.ownerId, ownerId), eq(vehicles.status, "active")));
  return row;
}
