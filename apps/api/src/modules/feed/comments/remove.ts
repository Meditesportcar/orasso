// Suppression douce d'un commentaire, avec ses compteurs (lot R8k1). Partagée par la suppression (l'auteur, ou qui gère la
// publication) et la décision de modération. Ordre des verrous, comme partout dans le Fil : la publication, puis les lignes
// de commentaire par identifiant. Supprimer un commentaire de premier niveau retire aussi ses réponses : les compteurs
// (`comments_count` de la publication, `replies_count` du parent) baissent d'autant.
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { feedPostComments, feedPosts } from "../../../db/schema";
import type { Tx } from "../../../lib/tx";
import { UUID_RE } from "../access";

/** Verrou de la publication d'un commentaire (à prendre avant toute écriture sur ses commentaires). */
export async function lockPostOfComment(tx: Tx, commentId: string): Promise<string | null> {
  if (!UUID_RE.test(commentId)) return null;
  const [c] = await tx
    .select({ postId: feedPostComments.postId })
    .from(feedPostComments)
    .where(eq(feedPostComments.id, commentId));
  if (!c) return null;
  await tx.select({ id: feedPosts.id }).from(feedPosts).where(eq(feedPosts.id, c.postId)).for("update");
  return c.postId;
}

/**
 * Retire le commentaire (et ses réponses). Rend `false` s'il n'existe pas ou était déjà retiré (rien n'est compté deux fois).
 */
export async function softDeleteComment(tx: Tx, commentId: string, deletedBy: string, at: Date): Promise<boolean> {
  const postId = await lockPostOfComment(tx, commentId);
  if (!postId) return false;
  const [head] = await tx
    .select({ parentId: feedPostComments.parentId })
    .from(feedPostComments)
    .where(eq(feedPostComments.id, commentId));
  if (!head) return false;
  const lockIds = [commentId, ...(head.parentId ? [head.parentId] : [])].sort();
  await tx
    .select({ id: feedPostComments.id })
    .from(feedPostComments)
    .where(inArray(feedPostComments.id, lockIds))
    .orderBy(feedPostComments.id)
    .for("update");
  const removed = await tx
    .update(feedPostComments)
    .set({ deletedAt: at, deletedBy })
    .where(and(eq(feedPostComments.id, commentId), isNull(feedPostComments.deletedAt)))
    .returning({ id: feedPostComments.id });
  if (!removed.length) return false;
  let gone = 1;
  if (head.parentId) {
    await tx
      .update(feedPostComments)
      .set({ repliesCount: sql`greatest(${feedPostComments.repliesCount} - 1, 0)` })
      .where(eq(feedPostComments.id, head.parentId));
  } else {
    const replies = await tx
      .update(feedPostComments)
      .set({ deletedAt: at, deletedBy })
      .where(and(eq(feedPostComments.parentId, commentId), isNull(feedPostComments.deletedAt)))
      .returning({ id: feedPostComments.id });
    gone += replies.length;
  }
  await tx
    .update(feedPosts)
    .set({ commentsCount: sql`greatest(${feedPosts.commentsCount} - ${gone}, 0)` })
    .where(eq(feedPosts.id, postId));
  return true;
}
