// Commentaires du Fil (lot R8k1) : compte supprimé. Ses commentaires et ses réponses partent (avec les réponses des autres
// sous ses commentaires, leurs flammes et leurs citations), ses flammes sur les commentaires des autres aussi, et il n'est
// plus cité. Les compteurs (`comments_count`, `replies_count`, `reactions_count`) sont recalculés sur ce qui reste, sous
// verrou : les publications d'abord (par identifiant), puis les commentaires touchés. Appelé par `accountService.anonymize`,
// dans sa transaction, avant l'effacement de ses publications.
import { eq, inArray, sql } from "drizzle-orm";

import { feedCommentMentions, feedPostCommentReactions, feedPostComments, feedPosts } from "../../../db/schema";
import type { Tx } from "../../../lib/tx";

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

  // Ses flammes ailleurs, puis ses commentaires (les réponses des autres, leurs flammes et citations partent avec eux).
  await tx.delete(feedPostCommentReactions).where(eq(feedPostCommentReactions.userId, userId));
  if (mine.length) await tx.delete(c).where(eq(c.authorId, userId));

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
