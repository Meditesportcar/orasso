// Le direct : lectures de la présence sur place (lot R7d1). Rien ici ne touche à une position : la table
// `event_presences` n'en a pas. Les compteurs sont des nombres ; aucune fonction ne rend une liste de personnes.
import { and, eq, sql } from "drizzle-orm";

import { eventPresences } from "../../db/schema";
import type { Executor } from "../../lib/tx";

/** Heure de validation de la présence GPS de la personne (droit de vote), `null` si elle n'en a pas. */
export async function gpsPresentAt(ex: Executor, eventId: string, userId: string): Promise<Date | null> {
  const row = await ex.query.eventPresences.findFirst({
    where: and(eq(eventPresences.eventId, eventId), eq(eventPresences.userId, userId)),
    columns: { validatedAt: true },
  });
  return row?.validatedAt ?? null;
}

/**
 * La personne a-t-elle une place avec un véhicule (candidature retenue, ou véhicule entré) ? Un exposant se fait scanner
 * à l'accueil : il ne valide pas sa présence par GPS (`use_qr`).
 */
export async function holdsVehicleSlot(ex: Executor, eventId: string, userId: string): Promise<boolean> {
  const rows = await ex.execute(sql`select 1 from applications a
    where a.event_id = ${eventId} and a.user_id = ${userId} and a.kind = 'vehicle'
      and (a.status = 'accepted' or exists (select 1 from checkins c where c.application_id = a.id))
    limit 1`);
  return rows.rows.length > 0;
}

/** Le billet de la personne pour cet événement (non annulé), le plus ancien d'abord ; `null` sans billet. */
export async function ticketOf(ex: Executor, eventId: string, userId: string): Promise<string | null> {
  const rows = await ex.execute<{ id: string }>(sql`select t.id from tickets t
    where t.event_id = ${eventId} and t.user_id = ${userId} and t.status <> 'cancelled'
    order by t.issued_at asc, t.id asc limit 1`);
  return rows.rows[0]?.id ?? null;
}

/**
 * Billet et prix (décision de Damien, 09/11 : « un billet payant doit être scanné ; la validation GPS est ok pour ceux
 * où c'est gratuit »). Le prix d'un billet est celui réellement payé (montant de la commande), sinon, sans paiement
 * enregistré, le prix du type de billet. Entrée payante : billetterie payante Orasso en vente (type de billet à prix
 * non nul, billetterie ouverte) ; un événement gratuit, sans billetterie ou à billets gratuits n'a pas d'entrée payante.
 */
export async function ticketPayment(
  ex: Executor,
  event: { id: string; publicAccess: string; ticketsEnabled: boolean },
  userId: string,
): Promise<{ holdsPaidTicket: boolean; entryPaidNoTicket: boolean }> {
  const rows = await ex.execute<{ paid: boolean }>(sql`select (
      o.amount_cents > 0
      or (o.amount_cents = 0 and o.stripe_session_id is null and ty.price_cents > 0)
    ) as paid
    from tickets t
      join orders o on o.id = t.order_id
      join ticket_types ty on ty.id = t.ticket_type_id
    where t.event_id = ${event.id} and t.user_id = ${userId} and t.status <> 'cancelled'`);
  if (rows.rows.length) return { holdsPaidTicket: rows.rows.some((r) => r.paid), entryPaidNoTicket: false };
  if (event.publicAccess !== "paid_orasso" || !event.ticketsEnabled)
    return { holdsPaidTicket: false, entryPaidNoTicket: false };
  const type = await ex.execute(
    sql`select 1 from ticket_types where event_id = ${event.id} and price_cents > 0 limit 1`,
  );
  return { holdsPaidTicket: false, entryPaidNoTicket: type.rows.length > 0 };
}

/**
 * « Sur place » : véhicules entrés par le pointage, billets contrôlés, présences GPS (une personne déjà comptée par son
 * billet contrôlé ou l'entrée de son véhicule n'est pas comptée une seconde fois). Comptes supprimés exclus des entrées,
 * comme le classement du prix du public. Des nombres seulement.
 */
export async function onSiteCount(ex: Executor, eventId: string): Promise<number> {
  const rows = await ex.execute<{ n: number }>(sql`select (
      (select count(*) from checkins c
        join applications a on a.id = c.application_id
        join profiles p on p.user_id = a.user_id
        where c.event_id = ${eventId} and a.kind = 'vehicle' and p.deleted_at is null)
      + (select count(*) from tickets t where t.event_id = ${eventId} and t.used_at is not null)
      + (select count(*) from event_presences g
        where g.event_id = ${eventId}
          and not exists (select 1 from tickets t where t.event_id = g.event_id and t.user_id = g.user_id
            and t.used_at is not null)
          and not exists (select 1 from checkins c join applications a on a.id = c.application_id
            where c.event_id = g.event_id and a.user_id = g.user_id and a.kind = 'vehicle'))
    )::int as n`);
  return Number(rows.rows[0]?.n ?? 0);
}

/** Comment la personne est sur place (les trois preuves, une requête). */
export async function myProofs(ex: Executor, eventId: string, userId: string) {
  const rows = await ex.execute<{ checked_in: boolean; ticket_scanned: boolean; gps: boolean }>(sql`select
      exists (select 1 from checkins c join applications a on a.id = c.application_id
        where c.event_id = ${eventId} and a.user_id = ${userId} and a.kind = 'vehicle') as checked_in,
      exists (select 1 from tickets t where t.event_id = ${eventId} and t.user_id = ${userId}
        and t.used_at is not null) as ticket_scanned,
      exists (select 1 from event_presences g where g.event_id = ${eventId} and g.user_id = ${userId}) as gps`);
  const r = rows.rows[0];
  return { checkedIn: Boolean(r?.checked_in), ticketScanned: Boolean(r?.ticket_scanned), gps: Boolean(r?.gps) };
}

/** Véhicules entrés (comptes supprimés exclus) et premier pointage : la fenêtre du prix du public. */
export async function vehiclesEntered(ex: Executor, eventId: string) {
  const rows = await ex.execute<{ n: number; first: Date | null }>(sql`select count(*)::int as n,
      min(c.checked_in_at) as first
    from checkins c
      join applications a on a.id = c.application_id
      join profiles p on p.user_id = a.user_id
    where c.event_id = ${eventId} and a.kind = 'vehicle' and p.deleted_at is null`);
  const r = rows.rows[0];
  return { vehiclesCheckedIn: Number(r?.n ?? 0), firstCheckinAt: r?.first ? new Date(r.first) : null };
}

/** Nombres de la statistique de l'organisateur (des nombres, jamais une liste). */
export async function summaryCounts(ex: Executor, eventId: string) {
  const rows = await ex.execute<{ exhibitors: number; with_ticket: number; no_ticket: number; total: number }>(sql`
    with ex as (
        select distinct a.user_id from checkins c join applications a on a.id = c.application_id
        join profiles p on p.user_id = a.user_id
        where c.event_id = ${eventId} and a.kind = 'vehicle' and p.deleted_at is null),
      tk as (select distinct t.user_id from tickets t join profiles p on p.user_id = t.user_id
        where t.event_id = ${eventId} and t.used_at is not null and p.deleted_at is null),
      gp as (select g.user_id, (g.ticket_id is not null) as has_ticket
        from event_presences g join profiles p on p.user_id = g.user_id
        where g.event_id = ${eventId} and p.deleted_at is null)
    select
      (select count(*) from ex)::int as exhibitors,
      (select count(*) from gp where has_ticket)::int as with_ticket,
      (select count(*) from gp where not has_ticket)::int as no_ticket,
      (select count(*) from (select user_id from ex union select user_id from tk union select user_id from gp) u)::int
        as total`);
  const r = rows.rows[0];
  return {
    exhibitorsCheckedIn: Number(r?.exhibitors ?? 0),
    visitorsWithTicketGps: Number(r?.with_ticket ?? 0),
    visitorsNoTicketGps: Number(r?.no_ticket ?? 0),
    total: Number(r?.total ?? 0),
  };
}
