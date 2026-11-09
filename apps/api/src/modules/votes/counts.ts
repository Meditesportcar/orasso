// Voix d'un vote (lecture simple, sans classement ni identité).
import { eq } from "drizzle-orm";

import { audienceVotes } from "../../db/schema";
import type { Executor } from "../../lib/tx";

export async function audienceVotesOf(ex: Executor, voteId: string) {
  return ex
    .select({ applicationId: audienceVotes.applicationId })
    .from(audienceVotes)
    .where(eq(audienceVotes.voteId, voteId));
}
