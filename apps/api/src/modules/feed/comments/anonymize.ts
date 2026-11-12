// Commentaires du Fil (lot R8k1) : compte supprimé. Ses commentaires et ses réponses partent (avec les réponses des autres
// sous ses commentaires, leurs flammes et leurs citations), ses flammes sur les commentaires des autres aussi, et il n'est
// plus cité. Les compteurs (`comments_count`, `replies_count`, `reactions_count`) sont recalculés sur ce qui reste, sous
// verrou : les publications d'abord (par identifiant), puis les commentaires touchés ; les notifications qui citent ce qui
// part sont retirées ensuite (publication, puis notification : même ordre que la création d'un commentaire). Appelé par
// `accountService.anonymize`, dans sa transaction, **avant** l'anonymisation des notifications regroupées.
//
// Exception (preuve d'un signalement, comme les publications du Fil) : un commentaire qui a un signalement en attente est
// seulement retiré (caché, flammes et citations effacées) ; sa ligne et son texte restent jusqu'à la décision, qui les efface
// (`moderation/targets/feedComment.ts`, `afterDecision`). Son commentaire de premier niveau reste aussi (la cascade d'un
// parent effacerait la réponse signalée).
import { and, eq, inArray, sql } from "drizzle-orm";

import {
  feedCommentMentions,
  feedPostCommentReactions,
  feedPostComments,
  feedPosts,
  reports,
} from "../../../db/schema";
import { now } from "../../../lib/deps";
import type { Tx } from "../../../lib/tx";
import { dropCommentNotifications } from "./notify";

/**
 * Verrou, **en une seule requête triée par identifiant et au tout début** de l'anonymisation, de toutes les publications que ce
 * compte touche (petit lot API, tour 2) : les siennes, celles où il a commenté, celles qu'il cosigne, celles où il a mis une
 * flamme. Deux comptes supprimés en même temps (co-auteurs mutuels, flammes croisées, commentaires croisés) prennent donc leurs
 * verrous dans le même ordre et ne s'interbloquent pas (40P01). Avant toute mutation, notamment celle de ses notifications : un
 * commentaire en cours prend la publication puis la ligne de notification regroupée, même ordre ici.
 */
export async function lockPostsOfDeletedAccount(tx: Tx, userId: string): Promise<void> {
  await tx.execute(
    sql`select id from feed_posts where author_id = ${userId}
      or id in (select post_id from feed_post_comments where author_id = ${userId})
      or id in (select post_id from feed_post_coauthors where coauthor_kind = 'user' and coauthor_id = ${userId})
      or id in (select post_id from feed_post_reactions where user_id = ${userId})
      order by id for update`,
  );
}

export async function anonymizeFeedCommentsForDeletedAccount(tx: Tx, userId: string): Promise<void> {
  const c = feedPostComments;
  const mine = await tx
    .select({ id: c.id, postId: c.postId, parentId: c.parentId })
    .from(c)
    .where(eq(c.authorId, userId));
  const reacted = await tx
    .select({ id: feedPostCommentReactions.commentId })
    .from(feedPostCommentReactions)
    .where(eq(feedPostCommentReactions.userId, userId));
  await tx.delete(feedCommentMentions).where(eq(feedCommentMentions.userId, userId));
  if (!mine.length && !reacted.length) return;

  // Verrous : les publications touchées, puis les commentaires touchés (ordre des identifiants).
  const postIds = [...new Set(mine.map((m) => m.postId))].sort();
  if (postIds.length) {
    await tx
      .select({ id: feedPosts.id })
      .from(feedPosts)
      .where(inArray(feedPosts.id, postIds))
      .orderBy(feedPosts.id)
      .for("update");
  }
  const parentIds = [...new Set(mine.flatMap((m) => (m.parentId ? [m.parentId] : [])))];
  const touched = [...new Set([...parentIds, ...reacted.map((r) => r.id)])].sort();
  if (touched.length) {
    await tx.select({ id: c.id }).from(c).where(inArray(c.id, touched)).orderBy(c.id).for("update");
  }

  // Ce qui part : ses commentaires et les réponses des autres dessous.
  const mineIds = mine.map((m) => m.id);
  const repliesUnder = mineIds.length
    ? await tx.select({ id: c.id, parentId: c.parentId }).from(c).where(inArray(c.parentId, mineIds))
    : [];
  const leaving = new Set([...mineIds, ...repliesUnder.map((r) => r.id)]);
  const heldRows = leaving.size
    ? await tx
        .select({ id: reports.targetId })
        .from(reports)
        .where(
          and(
            eq(reports.targetType, "feed_comment"),
            inArray(reports.targetId, [...leaving]),
            inArray(reports.status, ["pending", "reviewing"]),
          ),
        )
    : [];
  const held = new Set(heldRows.map((r) => r.id));
  // Le commentaire de premier niveau d'une réponse gardée reste aussi.
  for (const r of repliesUnder) if (held.has(r.id) && r.parentId) held.add(r.parentId);
  for (const m of mine) if (held.has(m.id) && m.parentId && leaving.has(m.parentId)) held.add(m.parentId);

  await tx.delete(feedPostCommentReactions).where(eq(feedPostCommentReactions.userId, userId));
  if (held.size) {
    const at = now();
    await tx
      .update(c)
      .set({
        deletedAt: sql`coalesce(${c.deletedAt}, ${at.toISOString()}::timestamptz)`,
        deletedBy: sql`coalesce(${c.deletedBy}, ${userId})`,
      })
      .where(inArray(c.id, [...held]));
    await tx.delete(feedPostCommentReactions).where(inArray(feedPostCommentReactions.commentId, [...held]));
    await tx.delete(feedCommentMentions).where(inArray(feedCommentMentions.commentId, [...held]));
  }
  const gone = [...leaving].filter((id) => !held.has(id));
  if (gone.length) await tx.delete(c).where(inArray(c.id, gone));
  await dropCommentNotifications(tx, [...leaving], postIds);

  // Compteurs recalculés sur ce qui reste.
  if (touched.length) {
    await tx
      .update(c)
      .set({
        repliesCount: sql`(select count(*)::int from feed_post_comments r where r.parent_id = ${c.id} and r.deleted_at is null)`,
        reactionsCount: sql`(select count(*)::int from feed_post_comment_reactions x where x.comment_id = ${c.id})`,
      })
      .where(inArray(c.id, touched));
  }
  if (postIds.length) {
    await tx
      .update(feedPosts)
      .set({
        commentsCount: sql`(select count(*)::int from feed_post_comments k where k.post_id = ${feedPosts.id} and k.deleted_at is null)`,
      })
      .where(inArray(feedPosts.id, postIds));
  }
}
