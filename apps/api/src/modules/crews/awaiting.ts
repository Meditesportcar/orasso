// Venues en crew à confirmer (lot 19) : retrait d'une candidature `awaiting_member` (le membre, le chef, l'expiration,
// un départ du crew ou sa dissolution) et fermeture de la notification « venue à confirmer ». Partagé par
// `registration.ts` et `service.ts` (sans dépendance circulaire).
import { and, eq, isNull, sql } from "drizzle-orm";

import { applications, notifications } from "../../db/schema";
import { now } from "../../lib/deps";
import type { Tx } from "../../lib/tx";
import { type ApplicationRow, applicationsService } from "../applications/service";
import { type EventRow, eventsRepo } from "../events/repo";
import { inboxService } from "../messaging/inbox";

type After = (cb: () => unknown) => void;

/** La notification « venue à confirmer » n'a plus à rester non lue une fois la venue confirmée, refusée ou expirée. */
export async function closeConfirmNotification(tx: Tx, app: ApplicationRow) {
  await tx
    .update(notifications)
    .set({ readAt: now() })
    .where(
      and(
        eq(notifications.userId, app.userId),
        eq(notifications.type, "crew_registration_to_confirm"),
        sql`${notifications.data} ->> 'applicationId' = ${app.id}`,
        isNull(notifications.readAt),
      ),
    );
}

/** Passage `awaiting_member → withdrawn` (le membre, le chef ou la tâche d'expiration). */
export async function withdrawAwaiting(
  tx: Tx,
  after: After,
  event: EventRow,
  app: ApplicationRow,
  actor: { kind: "user" | "system"; userId: string | null },
  reason: string,
) {
  const row = await applicationsService.transition(
    tx,
    app,
    "withdrawn",
    actor,
    { withdrawnAt: now(), withdrawnAfterLock: false, waitlistRank: null },
    reason,
  );
  await closeConfirmNotification(tx, app);
  applicationsService.broadcast(after, event, [row]);
  after(() => inboxService.publish(app.userId));
  return row;
}

/**
 * Départ, retrait d'un membre ou dissolution du crew : ses venues encore à confirmer (de ce crew) sont retirées
 * (`system`, sans malus), dans la transaction de l'appelant. Pas de verrou de l'événement (ordre crew → événement
 * interdit, et `awaiting_member` ne prend pas de place) : verrou des candidatures, puis passage conditionnel.
 */
export async function withdrawAwaitingForCrew(tx: Tx, after: After, crewId: string, userId?: string) {
  const rows = await tx
    .select()
    .from(applications)
    .where(
      and(
        eq(applications.crewId, crewId),
        eq(applications.status, "awaiting_member"),
        userId ? eq(applications.userId, userId) : undefined,
      ),
    )
    .for("update");
  for (const app of rows) {
    const event = await eventsRepo.byId(app.eventId, tx);
    await withdrawAwaiting(tx, after, event, app, { kind: "system", userId: null }, "crew.left");
  }
  return rows.length;
}
