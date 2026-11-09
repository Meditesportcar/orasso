// Le Fil (lot R7e1) : qui voit quoi. Une publication se voit avec une session, d'un auteur en règle, et — compte privé —
// seulement des abonnés acceptés (`canSeeFeedPost`, règle commune dans `packages/shared`). Les rubriques du Fil lisent
// leurs lignes avec les mêmes conditions en SQL (`authorVisibleSql`) ; les deux sont testées ensemble.
import { type AudienceRel, canSeeFeedPost, type FeedPostFacts } from "@orasso/shared";
import { and, eq, type SQL, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { feedPosts, profiles, userFollows } from "../../db/schema";
import { now } from "../../lib/deps";
import { notFound } from "../../lib/errors";
import type { Viewer } from "../../lib/session";
import type { Executor } from "../../lib/tx";

export type FeedPostRow = typeof feedPosts.$inferSelect;

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Supprimé, banni ou suspendu en ce moment. */
export function unavailable(
  p: { deletedAt: Date | null; bannedAt: Date | null; suspendedUntil: Date | null },
  at: Date,
) {
  return Boolean(p.deletedAt || p.bannedAt || (p.suspendedUntil && p.suspendedUntil > at));
}

/** Compte en règle, en SQL (`alias` : alias de la table `profiles`). */
export function profileOkSql(alias: string, at: Date): SQL {
  const a = sql.raw(alias);
  return sql`(${a}.deleted_at is null and ${a}.banned_at is null and (${a}.suspended_until is null or ${a}.suspended_until <= ${at}))`;
}

/**
 * L'auteur (colonne `userCol`, alias `profiles` = `alias`) est visible de `viewerId` : en règle, et public, ou moi, ou
 * un compte privé que je suis (abonnement accepté).
 */
export function authorVisibleSql(alias: string, userCol: SQL, viewerId: string, at: Date): SQL {
  const a = sql.raw(alias);
  return sql`(${profileOkSql(alias, at)} and (${a}.visibility = 'public' or ${userCol} = ${viewerId}
    or exists (select 1 from user_follows uf where uf.follower_id = ${viewerId} and uf.followed_id = ${userCol} and uf.status = 'accepted')))`;
}

export async function relationOf(viewerId: string, authorId: string, ex: Executor = db): Promise<AudienceRel> {
  if (viewerId === authorId) return { followAccepted: true };
  const [row] = await ex
    .select({ id: userFollows.followerId })
    .from(userFollows)
    .where(
      and(
        eq(userFollows.followerId, viewerId),
        eq(userFollows.followedId, authorId),
        eq(userFollows.status, "accepted"),
      ),
    )
    .limit(1);
  return { followAccepted: Boolean(row) };
}

/** La publication et son auteur, ou `undefined` (identifiant mal formé, inconnu). */
export async function postWithAuthor(id: string, ex: Executor = db) {
  if (!UUID_RE.test(id)) return undefined;
  const [row] = await ex
    .select({ post: feedPosts, author: profiles })
    .from(feedPosts)
    .innerJoin(profiles, eq(profiles.userId, feedPosts.authorId))
    .where(eq(feedPosts.id, id));
  return row;
}

export function factsOf(row: NonNullable<Awaited<ReturnType<typeof postWithAuthor>>>, at: Date): FeedPostFacts {
  return {
    authorId: row.post.authorId,
    authorVisibility: row.author.visibility,
    authorUnavailable: unavailable(row.author, at),
    deleted: row.post.deletedAt !== null,
  };
}

/**
 * La publication, si `v` peut la voir ; 404 sinon (on ne révèle ni son existence ni celle d'un compte privé). Une
 * personne suspendue (lecture seule) la voit comme avant ; un compte supprimé n'a pas de session.
 */
export async function requireVisiblePost(v: Viewer, id: string, ex: Executor = db) {
  const row = await postWithAuthor(id, ex);
  const at = now();
  if (!row) throw notFound("Publication introuvable");
  const rel = await relationOf(v.user.id, row.post.authorId, ex);
  if (!canSeeFeedPost({ userId: v.user.id }, factsOf(row, at), rel)) throw notFound("Publication introuvable");
  return row;
}
