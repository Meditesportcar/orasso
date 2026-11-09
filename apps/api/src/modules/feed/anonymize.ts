// Le Fil (lot R7e1) : compte supprimé. Ses publications partent (avec leurs photos et leurs flammes), ses flammes sur les
// publications des autres aussi (leur compteur baisse). Appelé par `accountService.anonymize`, dans sa transaction ;
// rend les clés des photos à effacer après la validation.
import { eq, inArray, sql } from "drizzle-orm";

import { feedPostPhotos, feedPostReactions, feedPosts } from "../../db/schema";
import type { Tx } from "../../lib/tx";

export async function anonymizeFeedForDeletedAccount(tx: Tx, userId: string): Promise<string[]> {
  // Ses flammes ailleurs : le compteur des autres publications baisse d'un.
  await tx
    .update(feedPosts)
    .set({ reactionsCount: sql`greatest(0, ${feedPosts.reactionsCount} - 1)` })
    .where(
      inArray(
        feedPosts.id,
        tx.select({ id: feedPostReactions.postId }).from(feedPostReactions).where(eq(feedPostReactions.userId, userId)),
      ),
    );
  await tx.delete(feedPostReactions).where(eq(feedPostReactions.userId, userId));
  const posts = await tx.select({ id: feedPosts.id }).from(feedPosts).where(eq(feedPosts.authorId, userId));
  const ids = posts.map((p) => p.id);
  if (!ids.length) return [];
  const keys = (
    await tx.select({ key: feedPostPhotos.storageKey }).from(feedPostPhotos).where(inArray(feedPostPhotos.postId, ids))
  ).map((r) => r.key);
  // Photos et flammes partent avec la publication (clés étrangères en cascade).
  await tx.delete(feedPosts).where(inArray(feedPosts.id, ids));
  return keys;
}
