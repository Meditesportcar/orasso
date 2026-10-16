// Expiration des invitations nominatives au verrouillage des inscriptions (lot 25, S24). Appelée par
// `applicationsService.lockEvent` (tâche `event.lock`) dans sa transaction ; sans dépendance vers les candidatures.
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { eventInvitations, notifications } from "../../db/schema";
import { now } from "../../lib/deps";
import type { Tx } from "../../lib/tx";

export async function expirePendingInvitations(tx: Tx, eventId: string): Promise<number> {
  const expired = await tx
    .update(eventInvitations)
    .set({ status: "expired" })
    .where(and(eq(eventInvitations.eventId, eventId), eq(eventInvitations.status, "pending")))
    .returning({ id: eventInvitations.id });
  if (expired.length) {
    // La notification « invitation reçue » n'a plus à attendre une réponse.
    await tx
      .update(notifications)
      .set({ readAt: now() })
      .where(
        and(
          eq(notifications.type, "event_invitation_received"),
          inArray(
            sql`${notifications.data} ->> 'invitationId'`,
            expired.map((e) => e.id),
          ),
          isNull(notifications.readAt),
        ),
      );
  }
  return expired.length;
}
