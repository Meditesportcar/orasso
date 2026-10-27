// Destinataires d'un message groupé (lot 20, ARCHITECTURE-SUITE § 5.2). Calculés en base, jamais rendus à
// l'organisateur (il ne voit qu'un nombre). Toujours exclus : comptes supprimés ou suspendus, l'auteur, les
// organisateurs de la structure (ils sont de l'autre côté de la conversation), les bannis de la structure. Abonnés :
// sans ceux qui ont coupé « Annonce d'un organisateur suivi » ou la famille « Abonnements et messages » (anti-spam).
import type { MessageSegment } from "@orasso/shared";
import { type SQL, sql } from "drizzle-orm";

import { now } from "../../lib/deps";
import type { Executor } from "../../lib/tx";
import type { EventRow } from "../events/repo";
import { staffService } from "../staff/service";

function source(segment: MessageSegment, structureId: string, event: EventRow | null): SQL {
  const eventId = event?.id ?? null;
  switch (segment) {
    case "accepted":
      return sql`select a.user_id from applications a
        where a.event_id = ${eventId} and a.kind = 'vehicle' and a.status = 'accepted'`;
    case "waitlisted":
      return sql`select a.user_id from applications a
        where a.event_id = ${eventId} and a.kind = 'vehicle' and a.status in ('waitlisted', 'offered')`;
    case "pending":
      return sql`select a.user_id from applications a
        where a.event_id = ${eventId} and a.kind = 'vehicle' and a.status = 'pending'`;
    case "providers":
      return sql`select a.user_id from applications a
        where a.event_id = ${eventId} and a.kind = 'provider' and a.status = 'accepted'`;
    case "checked_in":
      return sql`select a.user_id from checkins c join applications a on a.id = c.application_id
        where c.event_id = ${eventId}`;
    case "staff":
      return event
        ? sql`select es.user_id from event_staff es
            join structure_members sm on sm.user_id = es.user_id and sm.structure_id = ${structureId}
              and sm.status = 'active' and sm.role = 'staff'
            where es.event_id = ${eventId}`
        : sql`select sm.user_id from structure_members sm
            where sm.structure_id = ${structureId} and sm.status = 'active' and sm.role = 'staff'`;
    case "followers":
      return sql`select f.user_id from structure_follows f
        join profiles fp on fp.user_id = f.user_id
        where f.structure_id = ${structureId}
          and not ('structure_announcement' = any(fp.muted_types))
          and coalesce((fp.notification_prefs ->> 'social')::boolean, true)`;
  }
}

/**
 * Identifiants des destinataires (au plus `limit`, pour détecter un dépassement sans tout charger). L'ordre est stable
 * (par identifiant) : la tâche d'envoi reprend là où elle s'est arrêtée.
 */
export async function segmentRecipients(
  ex: Executor,
  q: { segment: MessageSegment; structureId: string; event: EventRow | null; authorId: string; limit: number },
): Promise<string[]> {
  // Staff arrivé après la publication : ses lignes `event_staff` d'abord.
  if (q.segment === "staff" && q.event) await staffService.ensureRows(q.event, ex);
  const result = await ex.execute(sql`
    select distinct s.user_id from (${source(q.segment, q.structureId, q.event)}) s
    join profiles p on p.user_id = s.user_id
    where p.deleted_at is null
      and (p.suspended_until is null or p.suspended_until <= ${now()})
      and s.user_id <> ${q.authorId}
      and not exists (select 1 from structure_members o where o.structure_id = ${q.structureId}
        and o.user_id = s.user_id and o.status = 'active' and o.role in ('owner', 'co_organizer'))
      and not exists (select 1 from structure_bans b where b.structure_id = ${q.structureId} and b.user_id = s.user_id)
    order by s.user_id
    limit ${q.limit}`);
  return (result.rows as { user_id: string }[]).map((r) => r.user_id);
}
