// Avoir une place à un événement (vague R8, lot R8a1) : une candidature `pending | accepted | waitlisted | offered |
// awaiting_member` (toute sorte : véhicule, prestataire, média…) ou un billet `valid` ou `used` (scanné : le visiteur entré garde sa place). C'est ce qui ouvre l'Essentiel d'un
// événement (R8n1) et les destinataires d'une « Info importante » : jamais un désisté, un refusé, un expiré ni un billet
// annulé. Les comptes supprimés sont exclus.
import { sql } from "drizzle-orm";

import type { Executor } from "../../lib/tx";

const PLACE_STATUSES = sql`('pending', 'accepted', 'waitlisted', 'offered', 'awaiting_member')`;

/** Les comptes qui ont une place à l'événement (sans doublon). */
export async function eventPlaceHolderIds(ex: Executor, eventId: string): Promise<string[]> {
  const rows = await ex.execute<{ user_id: string }>(sql`select distinct u.user_id from (
      select a.user_id from applications a where a.event_id = ${eventId} and a.status in ${PLACE_STATUSES}
      union
      select t.user_id from tickets t where t.event_id = ${eventId} and t.status in ('valid', 'used')
    ) u join profiles p on p.user_id = u.user_id where p.deleted_at is null`);
  return rows.rows.map((r) => r.user_id);
}

/** Ce compte a-t-il une place à l'événement ? */
export async function hasPlace(ex: Executor, eventId: string, userId: string): Promise<boolean> {
  const rows = await ex.execute<{ ok: boolean }>(sql`select (
      exists (select 1 from applications a where a.event_id = ${eventId} and a.user_id = ${userId}
        and a.status in ${PLACE_STATUSES})
      or exists (select 1 from tickets t where t.event_id = ${eventId} and t.user_id = ${userId} and t.status in ('valid', 'used'))
    ) and exists (select 1 from profiles p where p.user_id = ${userId} and p.deleted_at is null) as ok`);
  return Boolean(rows.rows[0]?.ok);
}
