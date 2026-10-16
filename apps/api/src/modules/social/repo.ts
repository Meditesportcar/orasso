import { and, desc, eq, inArray, or, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { friendships, profiles } from "../../db/schema";
import type { Executor, Tx } from "../../lib/tx";

export type Friendship = typeof friendships.$inferSelect;

/** Condition SQL « ces deux personnes sont amies » (ami accepté de `viewerId` pour la ligne de profil `userIdSql`). */
export function areFriendsSql(viewerId: string, userIdSql: ReturnType<typeof sql>) {
  return sql`exists (select 1 from friendships f where f.status = 'accepted' and ((f.requester_id = ${viewerId} and f.addressee_id = ${userIdSql}) or (f.requester_id = ${userIdSql} and f.addressee_id = ${viewerId})))`;
}

export const socialRepo = {
  /** La ligne unique de la paire, quel que soit le sens de la demande. */
  pair(a: string, b: string, ex: Executor = db) {
    return ex.query.friendships.findFirst({
      where: or(
        and(eq(friendships.requesterId, a), eq(friendships.addresseeId, b)),
        and(eq(friendships.requesterId, b), eq(friendships.addresseeId, a)),
      ),
    });
  },

  byId(id: string, ex: Executor = db) {
    return ex.query.friendships.findFirst({ where: eq(friendships.id, id) });
  },

  /** Amis acceptés d'une personne (identifiants). */
  async friendIds(userId: string, ex: Executor = db): Promise<string[]> {
    const rows = await ex
      .select({ requester: friendships.requesterId, addressee: friendships.addresseeId })
      .from(friendships)
      .where(
        and(eq(friendships.status, "accepted"), or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId))),
      );
    return rows.map((r) => (r.requester === userId ? r.addressee : r.requester));
  },

  /** Recalcule le cache `profiles.friends_count` (amis acceptés) de ces personnes. */
  async recountFriends(userIds: string[], tx: Executor = db) {
    for (const id of new Set(userIds)) {
      await tx
        .update(profiles)
        .set({
          friendsCount: sql`(select count(*)::int from friendships f where f.status = 'accepted' and (f.requester_id = ${id} or f.addressee_id = ${id}))`,
        })
        .where(eq(profiles.userId, id));
    }
  },

  /** Compte supprimé (anonymisé) : toutes ses amitiés et demandes disparaissent, les compteurs des autres suivent. */
  async removeAllFor(userId: string, tx: Tx) {
    const rows = await tx
      .delete(friendships)
      .where(or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId)))
      .returning({ requester: friendships.requesterId, addressee: friendships.addresseeId });
    await this.recountFriends(
      rows.flatMap((r) => [r.requester, r.addressee]),
      tx,
    );
  },

  /** Demandes en attente reçues (pastille de la Boîte). */
  async pendingIncomingCount(userId: string, ex: Executor = db): Promise<number> {
    const rows = await ex
      .select({ n: sql<number>`count(*)::int` })
      .from(friendships)
      .where(and(eq(friendships.addresseeId, userId), eq(friendships.status, "pending")));
    return rows[0]?.n ?? 0;
  },

  /** Statut de la relation de `viewerId` avec chacune de ces personnes. */
  async relationsWith(viewerId: string, userIds: string[], ex: Executor = db): Promise<Map<string, Friendship>> {
    const out = new Map<string, Friendship>();
    if (!userIds.length) return out;
    const rows = await ex
      .select()
      .from(friendships)
      .where(
        or(
          and(eq(friendships.requesterId, viewerId), inArray(friendships.addresseeId, userIds)),
          and(eq(friendships.addresseeId, viewerId), inArray(friendships.requesterId, userIds)),
        ),
      )
      .orderBy(desc(friendships.updatedAt));
    for (const r of rows) out.set(r.requesterId === viewerId ? r.addresseeId : r.requesterId, r);
    return out;
  },
};
