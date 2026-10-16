// Conversation à deux (`direct`, ARCHITECTURE-SUITE § 3.2). Lecture : les deux participants (comptes non supprimés).
// Écriture : amis, ou demande de contact acceptée entre eux (S11) ; une amitié retirée rend la conversation lisible
// seulement (docs/01 : « on ne peut pas écrire librement à quelqu'un qui n'est pas son ami »).
import { messagingLabels } from "@orasso/shared";
import { and, eq, isNull, or, sql } from "drizzle-orm";

import { contactRequests, conversationParticipants, friendships, profiles } from "../../../db/schema";
import { storage } from "../../../lib/storage";
import type { Executor } from "../../../lib/tx";
import type { KindRules } from "./types";

/** Amis acceptés, ou demande de contact acceptée dans un sens ou dans l'autre. */
export async function canTalkDirect(ex: Executor, a: string, b: string): Promise<boolean> {
  const [friend] = await ex
    .select({ id: friendships.id })
    .from(friendships)
    .where(
      and(
        eq(friendships.status, "accepted"),
        or(
          and(eq(friendships.requesterId, a), eq(friendships.addresseeId, b)),
          and(eq(friendships.requesterId, b), eq(friendships.addresseeId, a)),
        ),
      ),
    )
    .limit(1);
  if (friend) return true;
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
  return Boolean(contact);
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
    return (await canTalkDirect(ex, viewer.userId, other.userId)) ? null : "not_friends";
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
