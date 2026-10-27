// Conversation à deux (`direct`, ARCHITECTURE-SUITE § 3.2). Lecture : les deux participants (comptes non supprimés).
// Écriture (lot R6b, D37 : « un message va directement à quelqu'un qui te suit ; sinon demande de contact ») : la
// personne à qui j'écris me suit (abonnement accepté), ou une demande de contact a été acceptée entre nous (S11), ou le
// dernier message de la conversation vient d'elle (je lui réponds). Tour 2 (relecture Opus 3) : répondre n'est pas un
// droit permanent ; une fois ma réponse partie, c'est à elle d'écrire. Un abonnement retiré rend donc la conversation
// lisible seulement, tant qu'elle ne m'écrit pas.
import { messagingLabels } from "@orasso/shared";
import { and, desc, eq, isNull, ne, or, sql } from "drizzle-orm";

import { contactRequests, conversationParticipants, messages, profiles, userFollows } from "../../../db/schema";
import { storage } from "../../../lib/storage";
import type { Executor } from "../../../lib/tx";
import type { KindRules } from "./types";

/**
 * `from` peut écrire directement à `to` : `to` suit `from` (abonnement accepté), ou demande de contact acceptée dans un
 * sens ou dans l'autre, ou le dernier message (ni système, ni supprimé) de la conversation `conversationId` vient de `to`.
 */
export async function canTalkDirect(ex: Executor, from: string, to: string, conversationId?: string): Promise<boolean> {
  const [follows] = await ex
    .select({ id: userFollows.followerId })
    .from(userFollows)
    .where(and(eq(userFollows.followerId, to), eq(userFollows.followedId, from), eq(userFollows.status, "accepted")))
    .limit(1);
  if (follows) return true;
  const a = from;
  const b = to;
  const [contact] = await ex
    .select({ id: contactRequests.id })
    .from(contactRequests)
    .where(
      and(
        eq(contactRequests.status, "accepted"),
        or(
          and(eq(contactRequests.fromUserId, a), eq(contactRequests.toUserId, b)),
          and(eq(contactRequests.fromUserId, b), eq(contactRequests.toUserId, a)),
        ),
      ),
    )
    .limit(1);
  if (contact) return true;
  if (!conversationId) return false;
  const [last] = await ex
    .select({ senderId: messages.senderId })
    .from(messages)
    .where(and(eq(messages.conversationId, conversationId), ne(messages.kind, "system"), isNull(messages.deletedAt)))
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(1);
  return last?.senderId === to;
}

async function activeParticipants(ex: Executor, conversationId: string) {
  return ex
    .select({ userId: profiles.userId, pseudo: profiles.pseudo, avatarKey: profiles.avatarKey })
    .from(conversationParticipants)
    .innerJoin(profiles, eq(profiles.userId, conversationParticipants.userId))
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        isNull(conversationParticipants.leftAt),
        sql`${profiles.deletedAt} is null`,
      ),
    );
}

export const directRules: KindRules = {
  kind: "direct",

  async readers(ex, conversation) {
    const rows = await activeParticipants(ex, conversation.id);
    return rows.map((r) => ({ userId: r.userId, side: "member" as const }));
  },

  async writeBlock(ex, conversation, viewer) {
    const other = (await activeParticipants(ex, conversation.id)).find((p) => p.userId !== viewer.userId);
    if (!other) return "account_deleted";
    return (await canTalkDirect(ex, viewer.userId, other.userId, conversation.id)) ? null : "not_friends";
  },

  async describe(ex, conversation, viewer) {
    const other = (await activeParticipants(ex, conversation.id)).find((p) => p.userId !== viewer.userId);
    if (!other) {
      return {
        title: messagingLabels.deletedAccount,
        subtitle: null,
        avatarUrl: null,
        participants: [],
        otherUser: null,
        structure: null,
      };
    }
    const avatarUrl = storage.url(other.avatarKey);
    return {
      title: other.pseudo,
      subtitle: null,
      avatarUrl,
      participants: [other.pseudo],
      otherUser: { userId: other.userId, pseudo: other.pseudo, avatarUrl },
      structure: null,
    };
  },
};
