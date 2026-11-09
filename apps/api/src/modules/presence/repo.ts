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
 * Accès et billet (décision de Damien, 09/11 : « un billet payant doit être scanné ; le GPS est ok pour ceux où c'est
 * gratuit »). Le caractère payant ne dépend jamais de l'ouverture des ventes ni du tarif actuel d'un billet déjà émis :
 * un billet est payant si le montant ENREGISTRÉ à l'émission (commande) est non nul ; une réservation gratuite le reste
 * même si le tarif a augmenté depuis. Repli sur le tarif du type seulement pour une commande ancienne dont le montant
 * n'a pas été enregistré (montant nul mais session Stripe présente). `full` : le type de billet n'a plus de place.
 */
export async function entryOf(
  ex: Executor,
  event: { id: string; publicAccess: string },
  userId: string,
  at: Date,
): Promise<{
  access: { publicAccess: string; ticketPricesCents: number[] };
  ticket: "none" | "free" | "paid";
  full: boolean;
}> {
  const types = await ex.execute<{ price_cents: number; capacity: number | null }>(
    sql`select price_cents, capacity from ticket_types where event_id = ${event.id}`,
  );
  const rows = await ex.execute<{ paid: boolean }>(sql`select (
      o.amount_cents > 0
      or (o.amount_cents = 0 and o.stripe_session_id is not null and ty.price_cents > 0)
    ) as paid
    from tickets t
      join orders o on o.id = t.order_id
      join ticket_types ty on ty.id = t.ticket_type_id
    where t.event_id = ${event.id} and t.user_id = ${userId} and t.status <> 'cancelled'`);
  const ticket = !rows.rows.length ? "none" : rows.rows.some((r) => r.paid) ? "paid" : "free";
  let full = false;
  const capacity = types.rows[0]?.capacity ?? null;
  if (ticket === "none" && capacity !== null) {
    const taken = await ex.execute<{ n: number }>(sql`select (
        (select count(*) from tickets where event_id = ${event.id} and status in ('valid', 'used'))
        + (select coalesce(sum(quantity), 0) from orders
            where event_id = ${event.id} and status = 'pending' and expires_at > ${at})
      )::int as n`);
    full = Number(taken.rows[0]?.n ?? 0) >= capacity;
  }
  return {
    access: { publicAccess: event.publicAccess, ticketPricesCents: types.rows.map((r) => Number(r.price_cents)) },
    ticket,
    full,
  };
}

/**
 * « Sur place » : véhicules entrés par le pointage, billets contrôlés, présences GPS (une personne déjà comptée par son
 * billet contrôlé ou l'entrée de son véhicule n'est pas comptée une seconde fois). Comptes supprimés exclus des entrées,
 * comme le classement du prix du public. Des nombres seulement.
 */
export async function onSiteCount(
  ex: Executor,
  eventId: string,
  /**
   * Événement de plusieurs jours, direct d'un jour : un véhicule n'est « sur place » que ce jour-là s'il a une candidature
   * **de ce jour** (pas celle d'un autre jour) ; un accès « tout l'événement » (sans jour, `wholeEventAccess`) vaut dès son
   * entrée jusqu'à la fin, pas avant. Même règle que le direct de l'organisateur (`liveCounters`).
   */
  day: { id: string; dayDate: string; timezone: string } | null = null,
): Promise<number> {
  const vehicleDay = day
    ? sql`and (a.event_day_id = ${day.id}
        or (a.event_day_id is null and (c.checked_in_at at time zone ${day.timezone})::date <= ${day.dayDate}::date))`
    : sql``;
  const rows = await ex.execute<{ n: number }>(sql`select (
      (select count(*) from checkins c
        join applications a on a.id = c.application_id
        join profiles p on p.user_id = a.user_id
        where c.event_id = ${eventId} and a.kind = 'vehicle' and p.deleted_at is null ${vehicleDay})
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
