// Présence réelle (relecture du lot 49) : ce qui compte pour voter, pour les tampons et pour les rares.
// - Staff présent « vérifiable » : pas marqué absent, et une trace du jour J, de 3 h avant le début à la fin
//   (`staffPresenceWindow`) : « Je suis là » posé dans la fenêtre, ou une action enregistrée sur l'événement
//   (pointage, lecture de QR, billet contrôlé en ligne ou hors ligne, incident, alerte).
// - Participation : entrée d'une candidature de véhicule, billet contrôlé, ou staff présent vérifiable.
import { type SQL, sql } from "drizzle-orm";

import type { Executor } from "../../lib/tx";

/** Condition SQL « staff vérifiable » pour une ligne `event_staff` aliasée `s` d'un événement aliasé `e`. */
const verifiedStaffCondition = sql.raw(`s.presence <> 'absent' and (
    (s.presence = 'present' and s.presence_updated_at between e.starts_at - interval '3 hours' and e.ends_at)
    or exists (select 1 from checkins c where c.event_id = e.id and c.staff_user_id = s.user_id
      and c.checked_in_at between e.starts_at - interval '3 hours' and e.ends_at)
    or exists (select 1 from scan_events x where x.event_id = e.id and x.staff_user_id = s.user_id
      and x.scanned_at between e.starts_at - interval '3 hours' and e.ends_at)
    or exists (select 1 from ticket_scans x where x.event_id = e.id and x.staff_user_id = s.user_id
      and x.scanned_at between e.starts_at - interval '3 hours' and e.ends_at)
    or exists (select 1 from tickets x where x.event_id = e.id and x.used_by = s.user_id
      and x.used_at between e.starts_at - interval '3 hours' and e.ends_at)
    or exists (select 1 from incidents x where x.event_id = e.id and x.reporter_user_id = s.user_id
      and x.occurred_at between e.starts_at - interval '3 hours' and e.ends_at)
    or exists (select 1 from staff_alerts x where x.event_id = e.id and x.user_id = s.user_id
      and x.created_at between e.starts_at - interval '3 hours' and e.ends_at)
  )`);

/** Staff présent vérifiable d'un événement. */
export async function verifiedStaffIds(ex: Executor, eventId: string): Promise<Set<string>> {
  const rows = await ex.execute<{ user_id: string }>(sql`select s.user_id from event_staff s
    join events e on e.id = s.event_id where s.event_id = ${eventId} and ${verifiedStaffCondition}`);
  return new Set(rows.rows.map((r) => r.user_id));
}

export async function isVerifiedStaff(ex: Executor, eventId: string, userId: string): Promise<boolean> {
  const rows = await ex.execute(sql`select 1 from event_staff s join events e on e.id = s.event_id
    where s.event_id = ${eventId} and s.user_id = ${userId} and ${verifiedStaffCondition} limit 1`);
  return rows.rows.length > 0;
}

/** Condition « la personne a participé à l'événement `e` » (entrée, billet, staff vérifiable). */
function participated(userId: string): SQL {
  return sql`(
    exists (select 1 from checkins c join applications a on a.id = c.application_id
      where c.event_id = e.id and a.user_id = ${userId} and a.kind = 'vehicle')
    or exists (select 1 from tickets t where t.event_id = e.id and t.user_id = ${userId} and t.used_at is not null)
    or exists (select 1 from event_staff s where s.event_id = e.id and s.user_id = ${userId} and ${verifiedStaffCondition})
  )`;
}

/**
 * Événements (publiés) auxquels la personne a réellement participé, commencés avant `before` : l'historique complet,
 * pas seulement les tampons posés depuis la mise en ligne du passeport (« première sortie », « 10e événement »).
 */
export async function participationsBefore(ex: Executor, userId: string, before: Date): Promise<number> {
  const rows = await ex.execute<{ n: number }>(sql`select count(*)::int as n from events e
    where e.status = 'published' and e.starts_at < ${before} and ${participated(userId)}`);
  return Number(rows.rows[0]?.n ?? 0);
}
