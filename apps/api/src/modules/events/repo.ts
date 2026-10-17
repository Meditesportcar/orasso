import { type ApplicationStatus, type EventCounters, freePlaces, isMultiDay } from "@orasso/shared";
import { and, count, eq, isNull, or, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { applications, events } from "../../db/schema";
import { notFound } from "../../lib/errors";
import type { Executor, Tx } from "../../lib/tx";
import { daysRepo } from "./days";

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

  /** Candidatures de véhicules par statut ; `dayId` (lot 26) : celles de ce jour et de tout l'événement. */
  async statusCounts(eventId: string, ex: Executor = db, dayId?: string): Promise<Record<ApplicationStatus, number>> {
    const rows = await ex
      .select({ status: applications.status, n: count() })
      .from(applications)
      .where(
        and(
          eq(applications.eventId, eventId),
          eq(applications.kind, "vehicle"),
          dayId ? or(isNull(applications.eventDayId), eq(applications.eventDayId, dayId)) : undefined,
        ),
      )
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
      awaiting_member: 0,
    } satisfies Record<ApplicationStatus, number>;
    for (const r of rows) counts[r.status] = r.n;
    return counts;
  },

  /**
   * Compteurs du tri (places restantes, retenus, à trier, liste d'attente, refusés). Plusieurs jours (lot 26) : sans
   * `dayId`, places du meilleur jour ; avec `dayId`, les candidatures de ce jour et de tout l'événement, et les places
   * de ce jour.
   */
  async counters(
    event: Pick<EventRow, "id" | "capacity">,
    ex: Executor = db,
    dayId: string | null = null,
  ): Promise<EventCounters> {
    const days = await daysRepo.list(event.id, ex);
    const multi = isMultiDay(days);
    const c = multi && dayId ? await this.statusCounts(event.id, ex, dayId) : await this.statusCounts(event.id, ex);
    let remaining = event.capacity === null ? null : Math.max(0, event.capacity - c.accepted - c.offered);
    if (multi) {
      const taken = await daysRepo.taken(event.id, ex);
      const free = dayId ? freePlaces(event, days, taken, dayId) : daysRepo.remainingOf(event, days, taken);
      remaining = free === null || free === undefined ? null : Math.max(0, free);
    }
    return {
      remaining,
      accepted: c.accepted,
      pending: c.pending,
      waitlisted: c.waitlisted + c.offered,
      refused: c.refused,
    };
  },

  async slugTaken(slug: string) {
    return Boolean(await db.query.events.findFirst({ where: eq(events.slug, slug), columns: { id: true } }));
  },

  /**
   * Utilisateurs ayant une candidature active. `awaitingMembers` : membres de crew pas encore confirmés compris (lot 19)
   * — pour la modification ou l'annulation de l'événement, jamais pour la communication de l'organisateur (annonces,
   * consignes, messages groupés) : rien n'arrive de l'organisateur à quelqu'un qui n'a pas accepté de venir.
   */
  async activeApplicantIds(
    eventId: string,
    ex: Executor = db,
    opts: { awaitingMembers?: boolean } = {},
  ): Promise<string[]> {
    const rows = await ex
      .selectDistinct({ userId: applications.userId })
      .from(applications)
      .where(
        and(
          eq(applications.eventId, eventId),
          opts.awaitingMembers
            ? sql`${applications.status} in ('pending', 'accepted', 'waitlisted', 'offered', 'awaiting_member')`
            : sql`${applications.status} in ('pending', 'accepted', 'waitlisted', 'offered')`,
        ),
      );
    return rows.map((r) => r.userId);
  },
};
