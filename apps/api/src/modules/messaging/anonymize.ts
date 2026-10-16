// Compte supprimé (anonymisé) : ce que la messagerie garde de lui disparaît (lot 18). Appelé une fois par
// `accountService.anonymize`, dans sa transaction ; rend les clés des fichiers à effacer après la validation.
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";

import {
  contactRequests,
  conversationParticipants,
  conversations,
  messages,
  notifications,
  uploads,
} from "../../db/schema";
import { now } from "../../lib/deps";
import type { Tx } from "../../lib/tx";
import { refreshPreview } from "./core";

/**
 * - ses messages : contenu et image effacés, expéditeur retiré (« Message supprimé », jamais son pseudo) ;
 * - ses fichiers envoyés et pas encore rattachés ;
 * - ses demandes de contact, envoyées et reçues ;
 * - ses participations : retirées ; ses conversations à deux et avec une structure sont fermées (lisibles par l'autre) ;
 * - les notifications des autres qui le citent (message reçu, demande de contact : pseudo, photo, lien) ;
 * - l'aperçu des conversations touchées est recalculé (il pouvait reprendre son dernier message).
 */
export async function anonymizeMessagingForDeletedAccount(tx: Tx, userId: string): Promise<string[]> {
  const at = now();
  const keys: string[] = [];
  const own = await tx
    .select({ conversationId: messages.conversationId, imageKey: messages.imageKey })
    .from(messages)
    .where(eq(messages.senderId, userId));
  for (const m of own) if (m.imageKey) keys.push(m.imageKey);
  await tx
    .update(messages)
    .set({
      body: null,
      imageKey: null,
      imageWidth: null,
      imageHeight: null,
      senderId: null,
      deletedAt: sql`coalesce(${messages.deletedAt}, ${at})`,
    })
    .where(eq(messages.senderId, userId));
  const files = await tx.delete(uploads).where(eq(uploads.userId, userId)).returning({
    key: uploads.key,
    consumedAt: uploads.consumedAt,
  });
  // Fichiers rattachés à autre chose qu'un message (logo de crew…) : gérés par leur lot ; ici, ceux en attente.
  for (const f of files) if (!f.consumedAt) keys.push(f.key);
  await tx
    .delete(contactRequests)
    .where(or(eq(contactRequests.fromUserId, userId), eq(contactRequests.toUserId, userId)));
  const memberships = await tx
    .delete(conversationParticipants)
    .where(eq(conversationParticipants.userId, userId))
    .returning({ conversationId: conversationParticipants.conversationId, role: conversationParticipants.role });
  const closable = memberships.map((m) => m.conversationId);
  if (closable.length) {
    await tx
      .update(conversations)
      .set({ closedAt: at })
      .where(
        and(
          inArray(conversations.id, closable),
          isNull(conversations.closedAt),
          // Conversation à deux, ou avec une structure dont il était la personne (pas un organisateur).
          sql`(${conversations.kind} = 'direct' or (${conversations.kind} = 'organizer' and ${conversations.directKey} like ${`structure:%:${userId}`}))`,
        ),
      );
  }
  await tx
    .delete(notifications)
    .where(
      and(
        inArray(notifications.type, ["message_received", "contact_request"]),
        sql`${notifications.data} -> 'actor' ->> 'userId' = ${userId}`,
      ),
    );
  for (const id of new Set([...own.map((m) => m.conversationId), ...closable])) await refreshPreview(tx, id);
  return keys;
}
