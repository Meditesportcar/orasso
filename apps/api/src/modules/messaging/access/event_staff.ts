// Discussion du staff d'un événement (`event_staff`, lot 20, ARCHITECTURE-SUITE § 5.2, S21). Réservée au staff de
// l'événement (lignes `event_staff` d'un membre staff actif, sauf celui qui a dit « pas là » : docs/01 « réservée au
// staff présent ») et aux organisateurs de la structure. Fermée à J+1 (`closed_at` : plus de nouveaux messages) : le
// staff perd alors la lecture ; les organisateurs lisent jusqu'à J+7 (`readable_until`, contrôlé par le service commun).
import { and, eq, isNull, ne, sql } from "drizzle-orm";

import { eventStaff, events, profiles, structureMembers, structures } from "../../../db/schema";
import { now } from "../../../lib/deps";
import type { Executor } from "../../../lib/tx";
import { isStructureSuspended } from "./organizer";
import { activeTeam, structureView } from "./structure_staff";
import type { KindRules, Reader } from "./types";

/** Staff de l'événement qui peut lire la discussion avant sa fermeture. */
export async function eventStaffMembers(ex: Executor, eventId: string, structureId: string) {
  return ex
    .select({ userId: eventStaff.userId, pseudo: profiles.pseudo })
    .from(eventStaff)
    .innerJoin(
      structureMembers,
      and(
        eq(structureMembers.userId, eventStaff.userId),
        eq(structureMembers.structureId, structureId),
        eq(structureMembers.status, "active"),
        eq(structureMembers.role, "staff"),
      ),
    )
    .innerJoin(structures, and(eq(structures.id, structureMembers.structureId), isNull(structures.deletedAt)))
    .innerJoin(profiles, eq(profiles.userId, eventStaff.userId))
    .where(and(eq(eventStaff.eventId, eventId), ne(eventStaff.presence, "absent"), sql`${profiles.deletedAt} is null`))
    .orderBy(profiles.pseudo);
}

const isClosed = (closedAt: Date | null) => Boolean(closedAt && closedAt <= now());

export const eventStaffRules: KindRules = {
  kind: "event_staff",

  async readers(ex, conversation) {
    if (!conversation.structureId || !conversation.eventId) return [];
    const organizers = await activeTeam(ex, conversation.structureId, ["owner", "co_organizer"]);
    const out: Reader[] = organizers.map((o) => ({ userId: o.userId, side: "member" }));
    // S21 : après la fermeture (J+1), le staff ne lit plus ; les organisateurs, jusqu'à J+7.
    if (isClosed(conversation.closedAt)) return out;
    const ids = new Set(out.map((r) => r.userId));
    for (const s of await eventStaffMembers(ex, conversation.eventId, conversation.structureId)) {
      if (!ids.has(s.userId)) out.push({ userId: s.userId, side: "member" });
    }
    return out;
  },

  async writeBlock(ex, conversation) {
    return (await isStructureSuspended(ex, conversation.structureId)) ? "structure_suspended" : null;
  },

  async describe(ex, conversation, viewer) {
    const structure = await structureView(ex, conversation.structureId);
    const [event] = conversation.eventId
      ? await ex.select({ title: events.title }).from(events).where(eq(events.id, conversation.eventId))
      : [];
    const readers = await this.readers(ex, conversation);
    const pseudos = readers.length
      ? await ex
          .select({ userId: profiles.userId, pseudo: profiles.pseudo })
          .from(profiles)
          .where(
            sql`${profiles.userId} in (${sql.join(
              readers.map((r) => sql`${r.userId}`),
              sql`, `,
            )})`,
          )
      : [];
    return {
      title: `Staff · ${event?.title ?? "Événement"}`,
      subtitle: isClosed(conversation.closedAt) ? "Discussion fermée (J+1)" : "Discussion du staff de l'événement",
      avatarUrl: structure?.logoUrl ?? null,
      participants: pseudos.filter((p) => p.userId !== viewer.userId).map((p) => p.pseudo),
      otherUser: null,
      structure,
    };
  },
};
