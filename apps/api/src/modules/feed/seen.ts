// Cartes vues du Fil (lot R8c1, ARCHITECTURE-R8 § 1.4 et § 2.5) : `POST /me/fil/seen`, lecture de « vu sans interaction »,
// purge. **Donnée de lecture privée** : une ligne n'est lue que pour la personne qui l'a écrite, sur ses propres cartes ; elle
// n'est jamais servie à un tiers, jamais comptée pour un auteur, et part avec le compte (anonymisation) ou après 30 jours.
// Une carte est « vue sans interaction » à l'instant `ref` d'un parcours quand elle a une ligne vue avant `ref`, sans
// ouverture ni partage avant `ref`, et — pour une publication — sans flamme de la personne avant `ref` (la flamme se lit
// dans `feed_post_reactions` : ni ce module ni `publish.ts` n'écrivent deux fois). Ce qui arrive après `ref` ne change pas
// la zone d'une carte pendant le parcours.
import { FEED_SEEN_AT_MAX_AGE_MS, FEED_SEEN_TTL_MS, type FeedSeenAction, type FeedSeenBody } from "@orasso/shared";
import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { feedPostReactions, feedSeen } from "../../db/schema";
import { now } from "../../lib/deps";
import { rateLimit } from "../../lib/rateLimit";
import type { Viewer } from "../../lib/session";

/** Durée de vie d'une ligne. */
export const SEEN_TTL_MS = FEED_SEEN_TTL_MS;
/** Lignes effacées par requête de la purge (jamais toute la table d'un coup). */
export const PURGE_BATCH = 5000;
/** Lignes gardées au plus par compte : les plus anciennes partent. */
export const SEEN_MAX_PER_USER = 5000;

/**
 * Parmi `cardIds` (identifiants du Fil `genre:uuid`), celles que `userId` a vues sans interaction à l'instant `ref`.
 * Deux requêtes au plus pour tout le lot, jamais une par carte.
 */
export async function seenWithoutInteraction(
  userId: string,
  cardIds: readonly string[],
  ref: Date,
): Promise<Set<string>> {
  if (!cardIds.length) return new Set();
  const rows = await db
    .select({ id: feedSeen.cardId })
    .from(feedSeen)
    .where(
      and(
        eq(feedSeen.userId, userId),
        inArray(feedSeen.cardId, [...cardIds]),
        sql`${feedSeen.seenAt} <= ${ref.toISOString()}::timestamptz`,
        sql`(${feedSeen.interactedAt} is null or ${feedSeen.interactedAt} > ${ref.toISOString()}::timestamptz)`,
      ),
    );
  const seen = new Set(rows.map((r) => r.id));
  const postIds = [...seen].filter((id) => id.startsWith("feed_post:")).map((id) => id.slice("feed_post:".length));
  if (postIds.length) {
    const flamed = await db
      .select({ id: feedPostReactions.postId })
      .from(feedPostReactions)
      .where(
        and(
          eq(feedPostReactions.userId, userId),
          inArray(feedPostReactions.postId, postIds),
          sql`${feedPostReactions.createdAt} <= ${ref.toISOString()}::timestamptz`,
        ),
      );
    for (const r of flamed) seen.delete(`feed_post:${r.id}`);
  }
  return seen;
}

/** Garde au plus `SEEN_MAX_PER_USER` lignes pour ce compte (les plus anciennement vues partent). */
async function trimUser(userId: string): Promise<number> {
  const res = await db.execute(sql`
    delete from feed_seen where user_id = ${userId} and card_id in (
      select card_id from feed_seen where user_id = ${userId}
      order by seen_at desc, card_id desc offset ${SEEN_MAX_PER_USER})`);
  return res.rowCount ?? 0;
}

export const feedSeenService = {
  /**
   * `POST /me/fil/seen` : retient des cartes vues (`view`) ou ouvertes, partagées (`open`, `share`). Idempotent : la première
   * heure vue et la première interaction gagnent (un renvoi ne déplace rien, le parcours en cours reste stable). `at` est
   * ramenée entre maintenant − 24 h et maintenant. Jamais « Sponsorisé » (refusé par le schéma).
   */
  async record(v: Viewer, input: FeedSeenBody): Promise<void> {
    rateLimit("feedSeen", v.user.id);
    const t = now();
    const earliest = t.getTime() - FEED_SEEN_AT_MAX_AGE_MS;
    const byId = new Map<string, { seenAt: number; interactedAt: number | null }>();
    for (const c of input.cards) {
      const raw = c.at ? Date.parse(c.at) : t.getTime();
      const at = Math.min(t.getTime(), Math.max(earliest, Number.isNaN(raw) ? t.getTime() : raw));
      const interacted = (c.action as FeedSeenAction) !== "view";
      const old = byId.get(c.id);
      byId.set(c.id, {
        seenAt: Math.min(old?.seenAt ?? at, at),
        interactedAt: interacted ? Math.min(old?.interactedAt ?? at, at) : (old?.interactedAt ?? null),
      });
    }
    await db
      .insert(feedSeen)
      .values(
        [...byId].map(([cardId, r]) => ({
          userId: v.user.id,
          cardId,
          seenAt: new Date(r.seenAt),
          interactedAt: r.interactedAt === null ? null : new Date(r.interactedAt),
        })),
      )
      .onConflictDoUpdate({
        target: [feedSeen.userId, feedSeen.cardId],
        set: {
          seenAt: sql`least(${feedSeen.seenAt}, excluded.seen_at)`,
          interactedAt: sql`case when ${feedSeen.interactedAt} is null then excluded.interacted_at
            when excluded.interacted_at is null then ${feedSeen.interactedAt}
            else least(${feedSeen.interactedAt}, excluded.interacted_at) end`,
        },
      });
    await trimUser(v.user.id);
  },

  /**
   * Tâche quotidienne `feed.seen-purge` : les lignes de plus de 30 jours, puis, pour les comptes au-delà de 5 000 lignes,
   * les plus anciennes. `at` : l'instant (tests).
   */
  async purge(at: Date = now()): Promise<{ expired: number; trimmed: number }> {
    const limit = new Date(at.getTime() - SEEN_TTL_MS).toISOString();
    let expired = 0;
    // Par paquets (index sur `seen_at`) : rien n'est remonté en mémoire, une longue transaction n'est jamais ouverte.
    for (;;) {
      const done = await db.execute(sql`
        delete from feed_seen where ctid in (
          select ctid from feed_seen where seen_at < ${limit}::timestamptz limit ${PURGE_BATCH})`);
      const n = done.rowCount ?? 0;
      expired += n;
      if (n < PURGE_BATCH) break;
    }
    const res = await db.execute(sql`
      delete from feed_seen f using (
        select user_id, card_id, row_number() over (partition by user_id order by seen_at desc, card_id desc) as rn
        from feed_seen where user_id in (select user_id from feed_seen group by user_id having count(*) > ${SEEN_MAX_PER_USER})
      ) x where f.user_id = x.user_id and f.card_id = x.card_id and x.rn > ${SEEN_MAX_PER_USER}`);
    return { expired, trimmed: res.rowCount ?? 0 };
  },
};
