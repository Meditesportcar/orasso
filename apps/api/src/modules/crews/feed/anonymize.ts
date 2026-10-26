// Fil d'un crew (lot R5c1) : compte supprimé. Ses publications partent (avec leurs photos, leurs commentaires, leurs
// flammes, leur sondage), ses commentaires, ses flammes et ses voix aussi ; les notifications des autres qui le citent
// (nouveau sondage, commentaires regroupés) sont supprimées. Appelé par `accountService.anonymize`, dans sa transaction ;
// rend les clés des photos à effacer après la validation.
import { and, eq, inArray, sql } from "drizzle-orm";

import {
  crewPollVotes,
  crewPostComments,
  crewPostPhotos,
  crewPostReactions,
  crewPosts,
  notifications,
  uploads,
} from "../../../db/schema";
import type { Tx } from "../../../lib/tx";

export async function anonymizeCrewFeedForDeletedAccount(tx: Tx, userId: string): Promise<string[]> {
  const posts = await tx.select({ id: crewPosts.id }).from(crewPosts).where(eq(crewPosts.authorId, userId));
  const postIds = posts.map((p) => p.id);
  let keys: string[] = [];
  if (postIds.length) {
    keys = (
      await tx
        .select({ key: crewPostPhotos.storageKey })
        .from(crewPostPhotos)
        .where(inArray(crewPostPhotos.postId, postIds))
    ).map((r) => r.key);
    if (keys.length) await tx.delete(uploads).where(inArray(uploads.key, keys));
    await tx
      .delete(notifications)
      .where(
        and(
          inArray(notifications.type, ["crew_post_comment", "crew_poll_new"]),
          inArray(sql`${notifications.data} ->> 'postId'`, postIds),
        ),
      );
    // Photos, flammes, commentaires et sondage partent avec la publication (clés étrangères en cascade).
    await tx.delete(crewPosts).where(inArray(crewPosts.id, postIds));
  }
  await tx.delete(crewPostComments).where(eq(crewPostComments.authorId, userId));
  await tx.delete(crewPostReactions).where(eq(crewPostReactions.userId, userId));
  await tx.delete(crewPollVotes).where(eq(crewPollVotes.userId, userId));
  await tx
    .delete(notifications)
    .where(and(eq(notifications.type, "crew_post_comment"), sql`${notifications.data} -> 'actorIds' ? ${userId}`));
  return keys;
}
