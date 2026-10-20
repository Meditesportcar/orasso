// Équipe en bulles (lot 52) : l'historique de chaque membre avec la structure, d'après `event_staff`. Rien n'est stocké
// de plus : « événements tenus » = événements publiés de la structure, commencés (ou terminés), où le membre était
// ajouté sans avoir déclaré son absence. Réservé aux organisateurs de la structure.
import type { StaffRole, TeamMemberHistory } from "@orasso/shared";
import { and, desc, eq } from "drizzle-orm";

import { db } from "../../db/client";
import { eventStaff, events, structureMembers } from "../../db/schema";
import { requireOrganizer } from "../../lib/access";
import { now } from "../../lib/deps";
import type { Viewer } from "../../lib/session";

const RECENT = 8;

export const teamHistoryService = {
  async ofStructure(v: Viewer, structureId: string): Promise<TeamMemberHistory[]> {
    await requireOrganizer(v, structureId);
    const members = await db
      .select({ userId: structureMembers.userId, staffRoles: structureMembers.staffRoles })
      .from(structureMembers)
      .where(and(eq(structureMembers.structureId, structureId), eq(structureMembers.status, "active")));
    const rows = await db
      .select({
        userId: eventStaff.userId,
        roles: eventStaff.roles,
        presence: eventStaff.presence,
        eventId: events.id,
        title: events.title,
        startsAt: events.startsAt,
      })
      .from(eventStaff)
      .innerJoin(events, eq(events.id, eventStaff.eventId))
      .where(and(eq(events.structureId, structureId), eq(events.status, "published")))
      .orderBy(desc(events.startsAt));
    const at = now().getTime();
    return members.map((m) => {
      // L'historique ne compte que ce qui a commencé : un événement à venir n'est pas encore « tenu ».
      const mine = rows.filter((r) => r.userId === m.userId && r.startsAt.getTime() <= at);
      return {
        userId: m.userId,
        eventsHeld: mine.filter((r) => r.presence !== "absent").length,
        events: mine.slice(0, RECENT).map((r) => ({
          eventId: r.eventId,
          title: r.title,
          startsAt: r.startsAt.toISOString(),
          roles: (r.roles ?? m.staffRoles) as StaffRole[],
          presence: r.presence,
        })),
      };
    });
  },
};
