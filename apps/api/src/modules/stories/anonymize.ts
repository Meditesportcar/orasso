// Stories : compte supprimé (anonymisé), lot R7f1 tour 2. Appelé une fois par `accountService.anonymize`, dans sa
// transaction. Ses stories (et leurs copies) sont marquées supprimées et leurs fichiers effacés après la validation
// (sauf signalement ouvert : retenues jusqu'à la décision) ; ses identifications sont retirées ; ses vues, flammes et
// mises en sourdine disparaissent.
import { and, eq, isNull } from "drizzle-orm";

import { storyMutes, storyReactions, storyTags, storyViews } from "../../db/schema";
import { now } from "../../lib/deps";
import type { Tx } from "../../lib/tx";
import { retireStories } from "./purge";

export async function anonymizeStoriesForDeletedAccount(
  tx: Tx,
  userId: string,
  after: (cb: () => unknown) => void,
): Promise<void> {
  await retireStories(tx, after, { authorId: userId });
  await tx
    .update(storyTags)
    .set({ removedAt: now() })
    .where(and(eq(storyTags.targetKind, "user"), eq(storyTags.targetId, userId), isNull(storyTags.removedAt)));
  await tx.delete(storyMutes).where(eq(storyMutes.userId, userId));
  await tx.delete(storyViews).where(eq(storyViews.viewerId, userId));
  await tx.delete(storyReactions).where(eq(storyReactions.userId, userId));
}
