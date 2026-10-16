// Événement privé sur invitation (lot 25, ARCHITECTURE-SUITE § 9.1) : qui peut le voir. Ayants droit : membre actif
// de la structure (organisateurs et staff), staff de l'événement, personne qui y a une candidature, invité (invitation
// en attente ou acceptée, à son compte ou à l'adresse e-mail de son compte). Tous les autres : `403 invite_only`, sans
// rien de l'événement.
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { applications, eventInvitations, eventStaff, structureMembers, structures } from "../../db/schema";
import { AppError } from "../../lib/errors";
import type { Viewer } from "../../lib/session";
import type { Executor } from "../../lib/tx";

type PrivateEvent = { id: string; structureId: string; admission: string };

export const inviteOnlyError = () =>
  new AppError(403, "invite_only", "Événement privé sur invitation : seuls les invités le voient.");

/** Vrai si l'événement n'est pas privé, ou si la personne en est ayant droit. */
export async function canSeeEvent(e: PrivateEvent, viewer: Viewer | null, ex: Executor = db): Promise<boolean> {
  if (e.admission !== "invite_only") return true;
  if (!viewer) return false;
  const userId = viewer.user.id;
  const [member] = await ex
    .select({ id: structureMembers.id })
    .from(structureMembers)
    .innerJoin(structures, eq(structures.id, structureMembers.structureId))
    .where(
      and(
        eq(structureMembers.structureId, e.structureId),
        eq(structureMembers.userId, userId),
        eq(structureMembers.status, "active"),
        isNull(structures.deletedAt),
      ),
    )
    .limit(1);
  if (member) return true;
  const [staff] = await ex
    .select({ id: eventStaff.id })
    .from(eventStaff)
    .where(and(eq(eventStaff.eventId, e.id), eq(eventStaff.userId, userId)))
    .limit(1);
  if (staff) return true;
  const [mine] = await ex
    .select({ id: applications.id })
    .from(applications)
    .where(and(eq(applications.eventId, e.id), eq(applications.userId, userId)))
    .limit(1);
  if (mine) return true;
  const email = viewer.user.email?.toLowerCase() ?? "";
  const [invited] = await ex
    .select({ id: eventInvitations.id })
    .from(eventInvitations)
    .where(
      and(
        eq(eventInvitations.eventId, e.id),
        inArray(eventInvitations.status, ["pending", "accepted"]),
        sql`(${eventInvitations.userId} = ${userId} or (${eventInvitations.userId} is null and lower(${eventInvitations.email}) = ${email}))`,
      ),
    )
    .limit(1);
  return Boolean(invited);
}

/** `403 invite_only` si la personne ne peut pas voir l'événement privé. */
export async function assertCanSeeEvent(e: PrivateEvent, viewer: Viewer | null, ex: Executor = db): Promise<void> {
  if (!(await canSeeEvent(e, viewer, ex))) throw inviteOnlyError();
}
