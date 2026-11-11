// Rattacher une publication à un événement (vague R8, lot R8a1, ARCHITECTURE-R8 § 2.3). Le rôle (« pour le », « présent
// au », « sera au », « était au ») est **déduit des droits** au moment de publier (`rules/feedAttach.ts`, pur), jamais reçu
// du client. Ce fichier lit les faits en base (candidatures, billets, présence) et applique la règle ; il sert aussi à la
// lecture (phase, présence validée, visuel de repli) et à `GET /me/feed-posts/attachable-events`.
import {
  ATTACH_AFTER_DAYS,
  ATTACHABLE_EVENTS_MAX,
  type AttachableEventItem,
  type AttachFacts,
  attachPhase,
  deduceEventRole,
  displayRole,
  type FeedAttachView,
  type FeedEventRole,
  importantLeft,
  type StoryPersona,
} from "@orasso/shared";
import { and, eq, inArray, ne, sql } from "drizzle-orm";

import { events, structures } from "../../db/schema";
import { AppError } from "../../lib/errors";
import type { Executor } from "../../lib/tx";
import { eventPhotoUrl, eventPosterUrl } from "../events/card";
import { importantUsage } from "./important";

export type AttachEvent = typeof events.$inferSelect;

/** Ce qui est rendu d'un événement dans une publication (liste blanche) : jamais plus que ce que `FeedAttachView` porte. */
const visibleEventSql = sql`${events.status} in ('published', 'cancelled') and ${events.admission} <> 'invite_only'
  and ${structures.deletedAt} is null`;

/** Les événements rattachables en lecture : publiés ou annulés, ni sur invitation, d'une structure non supprimée. */
export async function attachEventsByIds(ex: Executor, ids: string[]): Promise<Map<string, AttachEvent>> {
  const unique = [...new Set(ids)];
  const out = new Map<string, AttachEvent>();
  if (!unique.length) return out;
  const rows = await ex
    .select({ e: events })
    .from(events)
    .innerJoin(structures, eq(structures.id, events.structureId))
    .where(and(inArray(events.id, unique), visibleEventSql));
  for (const r of rows) out.set(r.e.id, r.e);
  return out;
}

/** Les faits d'une personne sur un événement (la casquette précise lesquels comptent). */
type PersonFacts = Omit<AttachFacts, "ownsEvent" | "pageAccepted"> & {
  providerAccepted: boolean;
  mediaAccepted: boolean;
};

const idList = (ids: string[]) =>
  sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  );

/**
 * Les faits d'une personne sur une liste d'événements, en une requête : candidature véhicule active, candidature
 * prestataire / média retenue, billet valable, présence validée (pointage, billet contrôlé, présence GPS).
 */
export async function attachFactsFor(
  ex: Executor,
  userId: string,
  eventIds: string[],
): Promise<Map<string, PersonFacts>> {
  const out = new Map<string, PersonFacts>();
  if (!eventIds.length) return out;
  const rows = await ex.execute<{
    event_id: string;
    vehicle_active: boolean;
    provider_accepted: boolean;
    media_accepted: boolean;
    ticket_valid: boolean;
    presence: boolean;
  }>(sql`select e.id as event_id,
      exists (select 1 from applications a where a.event_id = e.id and a.user_id = ${userId}
        and a.kind = 'vehicle' and a.status in ('accepted', 'pending')) as vehicle_active,
      exists (select 1 from applications a where a.event_id = e.id and a.user_id = ${userId}
        and a.kind = 'provider' and a.status = 'accepted') as provider_accepted,
      exists (select 1 from applications a where a.event_id = e.id and a.user_id = ${userId}
        and a.kind = 'media' and a.status = 'accepted') as media_accepted,
      exists (select 1 from tickets t where t.event_id = e.id and t.user_id = ${userId} and t.status = 'valid') as ticket_valid,
      (exists (select 1 from checkins c join applications a on a.id = c.application_id
          where c.event_id = e.id and a.user_id = ${userId} and a.kind = 'vehicle')
        or exists (select 1 from tickets t where t.event_id = e.id and t.user_id = ${userId} and t.used_at is not null)
        or exists (select 1 from event_presences g where g.event_id = e.id and g.user_id = ${userId})) as presence
    from events e where e.id in (${idList(eventIds)})`);
  for (const r of rows.rows) {
    out.set(r.event_id, {
      vehicleActive: r.vehicle_active,
      providerAccepted: r.provider_accepted,
      mediaAccepted: r.media_accepted,
      ticketValid: r.ticket_valid,
      presenceValidated: r.presence,
    });
  }
  return out;
}

/** Présence validée de plusieurs (événement, personne) : pointage, billet contrôlé, présence GPS (comme `myProofs`). */
export async function presenceValidatedPairs(
  ex: Executor,
  pairs: { eventId: string; userId: string }[],
): Promise<Set<string>> {
  const out = new Set<string>();
  if (!pairs.length) return out;
  const values = sql.join(
    pairs.map((p) => sql`(${p.eventId}::uuid, ${p.userId}::text)`),
    sql`, `,
  );
  const rows = await ex.execute<{ event_id: string; user_id: string }>(sql`select p.event_id, p.user_id
    from (values ${values}) as p(event_id, user_id)
    where exists (select 1 from checkins c join applications a on a.id = c.application_id
          where c.event_id = p.event_id and a.user_id = p.user_id and a.kind = 'vehicle')
      or exists (select 1 from tickets t where t.event_id = p.event_id and t.user_id = p.user_id and t.used_at is not null)
      or exists (select 1 from event_presences g where g.event_id = p.event_id and g.user_id = p.user_id)`);
  for (const r of rows.rows) out.add(`${r.event_id}:${r.user_id}`);
  return out;
}

/**
 * Le rôle d'un rattachement à la création : déduit des droits de la personne et de la casquette. `null` : l'événement
 * n'est pas rattachable avec un verbe. L'appelant décide du refus (casquette : 422 ; passionné : accepté sans rôle).
 */
export async function deducePostRole(
  ex: Executor,
  input: { userId: string; persona: StoryPersona; pageId: string | null; event: AttachEvent },
  now: Date,
): Promise<FeedEventRole | null> {
  const facts = (await attachFactsFor(ex, input.userId, [input.event.id])).get(input.event.id);
  if (!facts) return null;
  return deduceEventRole(
    input.persona,
    input.event,
    {
      ownsEvent: input.persona === "organizer" && input.pageId === input.event.structureId,
      pageAccepted:
        input.persona === "provider" ? facts.providerAccepted : input.persona === "media" && facts.mediaAccepted,
      vehicleActive: facts.vehicleActive,
      ticketValid: facts.ticketValid,
      presenceValidated: facts.presenceValidated,
    },
    now,
  );
}

/** L'affiche d'un événement (sinon sa photo) : le visuel d'une publication rattachée sans photo. */
export const eventVisualUrl = (e: Parameters<typeof eventPosterUrl>[0] & Parameters<typeof eventPhotoUrl>[0]) =>
  eventPosterUrl(e) ?? eventPhotoUrl(e);

export const eventVisualKey = (e: AttachEvent): string | null => e.posterPostKey ?? e.posterKey ?? e.posterPhotoKey;

/** Dimensions par défaut du visuel de repli (4:5). */
export const EVENT_VISUAL_SIZE = { width: 1080, height: 1350 } as const;

/**
 * Les rattachements de plusieurs publications, calculés par lots : phase, présence validée, rôle affiché. Une publication
 * dont l'événement n'est plus visible n'a pas de rattachement (`null`).
 */
export async function loadAttachViews(
  ex: Executor,
  posts: {
    id: string;
    authorId: string;
    persona: StoryPersona;
    eventId: string | null;
    eventRole: FeedEventRole | null;
  }[],
  now: Date,
): Promise<Map<string, { attach: FeedAttachView; event: AttachEvent }>> {
  const out = new Map<string, { attach: FeedAttachView; event: AttachEvent }>();
  const withEvent = posts.filter((p) => p.eventId);
  if (!withEvent.length) return out;
  const byId = await attachEventsByIds(
    ex,
    withEvent.map((p) => p.eventId as string),
  );
  // Présence validée : seulement pour un passionné rattaché dont l'événement est fini (le tampon « Présent »).
  const needProof = withEvent.filter((p) => {
    const e = p.eventId ? byId.get(p.eventId) : undefined;
    return e && p.eventRole === "attendee" && attachPhase(e, now) === "after";
  });
  const proven = await presenceValidatedPairs(
    ex,
    needProof.map((p) => ({ eventId: p.eventId as string, userId: p.authorId })),
  );
  for (const p of withEvent) {
    const e = p.eventId ? byId.get(p.eventId) : undefined;
    if (!e) continue;
    const phase = attachPhase(e, now);
    const presenceValidated = p.eventRole === "attendee" && proven.has(`${e.id}:${p.authorId}`);
    out.set(p.id, {
      attach: {
        event: {
          id: e.id,
          slug: e.slug,
          title: e.title,
          startsAt: e.startsAt.toISOString(),
          endsAt: e.endsAt.toISOString(),
          city: e.city,
        },
        role: displayRole(p.eventRole, phase, presenceValidated),
        phase,
        presenceValidated,
      },
      event: e,
    });
  }
  return out;
}

export type AttachableQuery = { persona: StoryPersona; pageId: string | null };

/**
 * `GET /me/feed-posts/attachable-events` : les événements où cette casquette peut se rattacher, avec le rôle qui serait
 * déduit (même règle qu'à la création), les plus proches d'abord, 50 au plus. `important` : seulement pour un organisateur.
 */
export async function attachableEvents(
  ex: Executor,
  userId: string,
  q: AttachableQuery,
  now: Date,
): Promise<AttachableEventItem[]> {
  if (q.persona === "pro") return [];
  const windowStart = new Date(now.getTime() - ATTACH_AFTER_DAYS * 86_400_000);
  const nearest = sql`abs(extract(epoch from (${events.startsAt} - ${now.toISOString()}::timestamptz)))`;
  let rows: AttachEvent[];
  if (q.persona === "organizer") {
    if (!q.pageId) return [];
    rows = (
      await ex
        .select({ e: events })
        .from(events)
        .innerJoin(structures, eq(structures.id, events.structureId))
        .where(
          and(
            eq(events.structureId, q.pageId),
            visibleEventSql,
            sql`${events.endsAt} >= ${windowStart.toISOString()}::timestamptz`,
          ),
        )
        .orderBy(nearest)
        .limit(ATTACHABLE_EVENTS_MAX)
    ).map((r) => r.e);
  } else if (q.persona === "provider" || q.persona === "media") {
    rows = (
      await ex
        .select({ e: events })
        .from(events)
        .innerJoin(structures, eq(structures.id, events.structureId))
        .where(
          and(
            visibleEventSql,
            sql`${events.endsAt} >= ${windowStart.toISOString()}::timestamptz`,
            sql`exists (select 1 from applications a where a.event_id = ${events.id} and a.user_id = ${userId}
              and a.kind = ${q.persona} and a.status = 'accepted')`,
          ),
        )
        .orderBy(nearest)
        .limit(ATTACHABLE_EVENTS_MAX)
    ).map((r) => r.e);
  } else {
    rows = (
      await ex
        .select({ e: events })
        .from(events)
        .innerJoin(structures, eq(structures.id, events.structureId))
        .where(
          and(
            visibleEventSql,
            ne(events.status, "cancelled"),
            sql`${events.endsAt} >= ${windowStart.toISOString()}::timestamptz`,
            sql`(exists (select 1 from applications a where a.event_id = ${events.id} and a.user_id = ${userId}
                and a.kind = 'vehicle' and a.status in ('accepted', 'pending'))
              or exists (select 1 from tickets t where t.event_id = ${events.id} and t.user_id = ${userId} and t.status = 'valid')
              or exists (select 1 from checkins c join applications a on a.id = c.application_id
                where c.event_id = ${events.id} and a.user_id = ${userId} and a.kind = 'vehicle')
              or exists (select 1 from tickets t where t.event_id = ${events.id} and t.user_id = ${userId} and t.used_at is not null)
              or exists (select 1 from event_presences g where g.event_id = ${events.id} and g.user_id = ${userId}))`,
          ),
        )
        .orderBy(nearest)
        .limit(ATTACHABLE_EVENTS_MAX * 4)
    ).map((r) => r.e);
  }
  const facts = await attachFactsFor(
    ex,
    userId,
    rows.map((e) => e.id),
  );
  const usage =
    q.persona === "organizer"
      ? await importantUsage(
          ex,
          rows.map((e) => e.id),
          now,
        )
      : null;
  const items: AttachableEventItem[] = [];
  for (const e of rows) {
    const f = facts.get(e.id);
    if (!f) continue;
    const role = deduceEventRole(
      q.persona,
      e,
      {
        ownsEvent: q.persona === "organizer" && q.pageId === e.structureId,
        pageAccepted: q.persona === "provider" ? f.providerAccepted : q.persona === "media" && f.mediaAccepted,
        vehicleActive: f.vehicleActive,
        ticketValid: f.ticketValid,
        presenceValidated: f.presenceValidated,
      },
      now,
    );
    if (!role) continue;
    const poster = eventVisualUrl(e);
    const used = usage?.get(e.id) ?? { today: 0, week: 0 };
    items.push({
      id: e.id,
      slug: e.slug,
      title: e.title,
      startsAt: e.startsAt.toISOString(),
      endsAt: e.endsAt.toISOString(),
      city: e.city,
      posterUrl: poster,
      role,
      phase: attachPhase(e, now),
      hasVisual: Boolean(poster),
      important: usage ? importantLeft(used.today, used.week) : null,
    });
    if (items.length >= ATTACHABLE_EVENTS_MAX) break;
  }
  return items;
}

/** 422 : l'événement ne se rattache pas à cette publication. */
export const notAttachable = (message: string) => new AppError(422, "event_not_attachable", message);
