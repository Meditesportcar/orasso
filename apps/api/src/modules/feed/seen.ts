// Cartes vues du Fil (lot R8c1, ARCHITECTURE-R8 § 1.4 et § 2.5) : `POST /me/fil/seen`, lecture de « vu sans interaction »,
// purge. **Donnée de lecture privée** : une ligne n'est lue que pour la personne qui l'a écrite, sur ses propres cartes ; elle
// n'est jamais servie à un tiers, jamais comptée pour un auteur, et part avec le compte (anonymisation) ou après 30 jours.
// Une carte est « vue sans interaction » à l'instant `ref` d'un parcours quand elle a une ligne vue avant `ref`, sans
// ouverture ni partage avant `ref`, et — pour une publication — sans flamme de la personne avant `ref` (la flamme se lit
// dans `feed_post_reactions` : ni ce module ni `publish.ts` n'écrivent deux fois). Ce qui arrive après `ref` ne change pas
// la zone d'une carte pendant le parcours.
import { FEED_SEEN_TTL_MS, type FeedSeenAction, type FeedSeenBody } from "@orasso/shared";
import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { feedPostReactions, feedSeen, feedSeenFloor } from "../../db/schema";
import { now } from "../../lib/deps";
import { rateLimit } from "../../lib/rateLimit";
import type { Viewer } from "../../lib/session";

/** Durée de vie d'une ligne. */
export const SEEN_TTL_MS = FEED_SEEN_TTL_MS;
/** Lignes effacées par requête de la purge (jamais toute la table d'un coup). */
export const PURGE_BATCH = 5000;
/** Lignes gardées au plus par compte : les plus anciennes partent. */
export const SEEN_MAX_PER_USER = 5000;
/** Au-delà du plafond, le rognage redescend à ce nombre (par paliers : la borne ne bouge qu'une fois tous les ~1 000 envois). */
export const SEEN_TRIM_TO = 4000;

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

/**
 * Au-delà de `SEEN_MAX_PER_USER` lignes, redescend à `SEEN_TRIM_TO` (les plus anciennement vues partent) et retient la borne de rognage
 * (`feed_seen_floor`) : les cartes évincées restent « déjà vues » sans leur ligne.
 */
async function trimUser(userId: string): Promise<number> {
  const [{ n: total } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(feedSeen)
    .where(eq(feedSeen.userId, userId));
  if (total <= SEEN_MAX_PER_USER) return 0;
  const res = await db.execute(sql`
    with gone as (
      delete from feed_seen where user_id = ${userId} and card_id in (
        select card_id from feed_seen where user_id = ${userId}
        order by seen_at desc, card_id desc offset ${SEEN_TRIM_TO})
      returning seen_at
    ), floor as (
      insert into feed_seen_floor (user_id, floor_at)
      select ${userId}, max(seen_at) from gone having count(*) > 0
      on conflict (user_id) do update set floor_at = greatest(feed_seen_floor.floor_at, excluded.floor_at)
      returning 1
    )
    select (select count(*) from gone)::int as n`);
  return (res.rows[0] as { n: number } | undefined)?.n ?? 0;
}

/** La borne de rognage du compte (`null` : jamais rogné). */
export async function seenFloorOf(userId: string): Promise<Date | null> {
  const [row] = await db
    .select({ at: feedSeenFloor.floorAt })
    .from(feedSeenFloor)
    .where(eq(feedSeenFloor.userId, userId));
  return row?.at ?? null;
}

export const feedSeenService = {
  /**
   * `POST /me/fil/seen` : retient des cartes vues (`view`) ou ouvertes, partagées (`open`, `share`). Idempotent : la première
   * vue et la première interaction gagnent (un renvoi ne déplace rien). Jamais « Sponsorisé » (refusé par le schéma).
   * **Les heures sont celles de la réception**, pas l'heure de l'appareil : l'état d'un parcours est figé à son `ref`, et une
   * synchronisation tardive (carte vue ou ouverte hors ligne, `at` d'avant `ref`) ne doit changer la zone d'aucune carte du
   * parcours en cours (elle ferait passer une carte de B en A après la fin de A : carte jamais servie). `at` est validée par le
   * schéma (et bornée à 24 h) mais ne sert pas à dater : elle reste dans le contrat pour l'écran.
   */
  async record(v: Viewer, input: FeedSeenBody): Promise<void> {
    rateLimit("feedSeen", v.user.id);
    const t = now();
    const byId = new Map<string, { interacted: boolean }>();
    for (const c of input.cards) {
      const interacted = (c.action as FeedSeenAction) !== "view" || byId.get(c.id)?.interacted === true;
      byId.set(c.id, { interacted });
    }
    await db
      .insert(feedSeen)
      .values(
        [...byId].map(([cardId, r]) => ({
          userId: v.user.id,
          cardId,
          seenAt: t,
          interactedAt: r.interacted ? t : null,
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
    let trimmed = 0;
    const over = await db.execute(
      sql`select user_id from feed_seen group by user_id having count(*) > ${SEEN_MAX_PER_USER}`,
    );
    for (const r of over.rows as { user_id: string }[]) trimmed += await trimUser(r.user_id);
    return { expired, trimmed };
  },
};
