import type { ApplicationStatus, EventCounters } from "@orasso/shared";
import { and, count, eq, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { applications, events } from "../../db/schema";
import { notFound } from "../../lib/errors";
import type { Executor, Tx } from "../../lib/tx";

export type EventRow = typeof events.$inferSelect;

export const eventsRepo = {
  async byId(id: string, ex: Executor = db): Promise<EventRow> {
    const e = await ex.query.events.findFirst({ where: eq(events.id, id) });
    if (!e) throw notFound("Événement introuvable");
    return e;
  },

  /** Verrouille la ligne de l'événement pour la transaction : sérialise capacité, liste d'attente et décisions. */
  async lockForUpdate(tx: Tx, id: string): Promise<EventRow> {
    const [e] = await tx.select().from(events).where(eq(events.id, id)).for("update");
    if (!e) throw notFound("Événement introuvable");
    return e;
  },

  async statusCounts(eventId: string, ex: Executor = db): Promise<Record<ApplicationStatus, number>> {
    const rows = await ex
      .select({ status: applications.status, n: count() })
      .from(applications)
      .where(and(eq(applications.eventId, eventId), eq(applications.kind, "vehicle")))
      .groupBy(applications.status);
    const counts = {
      pending: 0,
      accepted: 0,
      waitlisted: 0,
      offered: 0,
      refused: 0,
      withdrawn: 0,
      expired: 0,
      cancelled: 0,
    } satisfies Record<ApplicationStatus, number>;
    for (const r of rows) counts[r.status] = r.n;
    return counts;
  },

  /** Compteurs du tri (places restantes, retenus, à trier, liste d'attente, refusés). */
  async counters(event: Pick<EventRow, "id" | "capacity">, ex: Executor = db): Promise<EventCounters> {
    const c = await this.statusCounts(event.id, ex);
    return {
      remaining: event.capacity === null ? null : Math.max(0, event.capacity - c.accepted - c.offered),
      accepted: c.accepted,
      pending: c.pending,
      waitlisted: c.waitlisted + c.offered,
      refused: c.refused,
    };
  },

  async slugTaken(slug: string) {
    return Boolean(await db.query.events.findFirst({ where: eq(events.slug, slug), columns: { id: true } }));
  },

  /** Utilisateurs ayant une candidature active (pour prévenir de tout changement). */
  async activeApplicantIds(eventId: string, ex: Executor = db): Promise<string[]> {
    const rows = await ex
      .selectDistinct({ userId: applications.userId })
      .from(applications)
      .where(
        and(
          eq(applications.eventId, eventId),
          sql`${applications.status} in ('pending', 'accepted', 'waitlisted', 'offered')`,
        ),
      );
    return rows.map((r) => r.userId);
  },
};
