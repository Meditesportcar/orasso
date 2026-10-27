// Conversation à deux (`direct`, ARCHITECTURE-SUITE § 3.2). Lecture : les deux participants (comptes non supprimés).
// Écriture (lot R6b, D37 : « un message va directement à quelqu'un qui te suit ; sinon demande de contact ») : la
// personne à qui j'écris me suit (abonnement accepté), ou une demande de contact a été acceptée entre nous (S11), ou elle
// m'a déjà écrit dans cette conversation (je lui réponds). Un abonnement retiré, sans échange, rend la conversation
// lisible seulement.
import { messagingLabels } from "@orasso/shared";
import { and, eq, isNull, or, sql } from "drizzle-orm";

import { contactRequests, conversationParticipants, messages, profiles, userFollows } from "../../../db/schema";
import { storage } from "../../../lib/storage";
import type { Executor } from "../../../lib/tx";
import type { KindRules } from "./types";

/**
 * `from` peut écrire directement à `to` : `to` suit `from` (abonnement accepté), ou demande de contact acceptée dans un
 * sens ou dans l'autre, ou `to` a déjà écrit dans la conversation `conversationId`.
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
  const [wrote] = await ex
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.conversationId, conversationId), eq(messages.senderId, to)))
    .limit(1);
  return Boolean(wrote);
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
