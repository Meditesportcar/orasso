// Liste des événements de l'Explorer (lot 29) : filtres, texte, rayon, et trois ordres : la date, les affinités
// (S34 : organisateur suivi +3, centre d'intérêt commun +2 par catégorie, ≤ 50 km +1, puis la date) et la distance.
//
// Confidentialité : un événement publié est public par nature (sauf sur invitation, jamais listé). Le score d'affinités
// ne lit que les données de la personne qui demande (ses abonnements, ses centres d'intérêt, sa position) ; la position
// envoyée par l'appareil sert à cette requête et n'est jamais enregistrée.
import {
  AFFINITY_NEAR_KM,
  affinityOf,
  type EventCard,
  type EventListQuery,
  type Page,
  resolvePosition,
  upcomingEndBound,
} from "@orasso/shared";
import { and, asc, desc, eq, gte, inArray, lt, ne, type SQL, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { applications, events, structures } from "../../db/schema";
import { now } from "../../lib/deps";
import { distanceKmSql, roundKm, withinRadiusSql } from "../../lib/geo-sql";
import type { Viewer } from "../../lib/session";
import { anyColumnContains, searchTokens } from "../../lib/text-search";
import { decorateForMedia, mediaExploreFilters } from "../media/explore";
import { card } from "./card";
import { daysRepo } from "./days";
import type { EventRow } from "./repo";

const safeOffset = (n: number): number => (Number.isSafeInteger(n) && n >= 0 ? n : 0);
const decodeOffset = (cursor: string | undefined): number =>
  cursor ? safeOffset(Number(Buffer.from(cursor, "base64url").toString())) : 0;
const encodeOffset = (offset: number): string => Buffer.from(String(offset)).toString("base64url");

/** « Sans limite » dans le tri par places (en tête). */
const UNLIMITED = 2_147_483_647;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lot M4, tour 2 : curseur du tri « Places restantes » (le dernier événement vu : ses places, son début, son id). */
type SeatsCursor = { seats: number; startsAt: string; id: string };
const encodeSeatsCursor = (c: SeatsCursor): string => Buffer.from(JSON.stringify(c)).toString("base64url");
function decodeSeatsCursor(cursor: string | undefined): SeatsCursor | null {
  if (!cursor) return null;
  try {
    const c = JSON.parse(Buffer.from(cursor, "base64url").toString()) as Partial<SeatsCursor>;
    if (!Number.isSafeInteger(c.seats) || typeof c.id !== "string" || !UUID.test(c.id)) return null;
    if (typeof c.startsAt !== "string" || Number.isNaN(Date.parse(c.startsAt))) return null;
    return { seats: c.seats as number, startsAt: c.startsAt, id: c.id };
  } catch {
    return null;
  }
}

/** Places restantes de plusieurs événements en une requête (capacité moins retenus et offres en cours). */
async function remainingMany(rows: EventRow[]): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  const capped = rows.filter((e) => e.capacity !== null);
  for (const e of rows) if (e.capacity === null) out.set(e.id, null);
  if (!capped.length) return out;
  const taken = await db
    .select({ eventId: applications.eventId, n: sql<number>`count(*)::int` })
    .from(applications)
    .where(
      and(
        inArray(
          applications.eventId,
          capped.map((e) => e.id),
        ),
        eq(applications.kind, "vehicle"),
        inArray(applications.status, ["accepted", "offered"]),
      ),
    )
    .groupBy(applications.eventId);
  const byEvent = new Map(taken.map((t) => [t.eventId, t.n]));
  for (const e of capped) out.set(e.id, Math.max(0, (e.capacity as number) - (byEvent.get(e.id) ?? 0)));
  return out;
}

/** Plusieurs jours (lot 26) : places du meilleur jour, à la place du calcul d'un événement d'un jour. */
async function remainingWithDays(rows: EventRow[]): Promise<Map<string, number | null>> {
  const out = await remainingMany(rows);
  const multi = await daysRepo.manyMultiDay(rows.map((e) => e.id));
  for (const e of rows) {
    const m = multi.get(e.id);
    if (!m) continue;
    const remaining = daysRepo.remainingOf(e, m.days, m.taken);
    if (remaining !== undefined) out.set(e.id, remaining === null ? null : Math.max(0, remaining));
  }
  return out;
}

export async function exploreEvents(q: EventListQuery, viewer: Viewer | null): Promise<Page<EventCard>> {
  const t = now();
  const upcoming = q.scope !== "past";
  const explicit = q.lat !== undefined && q.lng !== undefined;
  // Lot M4 : « Ailleurs… » part du centre d'un département choisi (temporaire, le profil ne change pas).
  const located = resolvePosition(
    { lat: q.lat, lng: q.lng },
    q.around ? [q.around] : (viewer?.profile.departments ?? null),
  );
  // L'ordre par affinités suppose un compte ; sans compte, il se replie sur la distance (si on en a une) puis la date.
  const sort = !upcoming
    ? "date"
    : q.sort === "affinity" && !viewer
      ? located
        ? "distance"
        : "date"
      : q.sort === "distance" && !located
        ? "date"
        : q.sort;
  // Rayon : demandé explicitement, ou position envoyée sans ordre particulier (comportement d'origine : 50 km).
  // Lot M4, tour 2 : « Partout en France » (`everywhere`) n'a jamais de rayon.
  const wantsRadius =
    located !== null && !q.everywhere && (q.radiusKm !== undefined || (explicit && q.sort === "date"));
  const needsDistance = located !== null && (sort !== "date" || wantsRadius || explicit);
  const dist = needsDistance && located ? distanceKmSql(events.lat, events.lng, located.position) : null;

  const filters: (SQL | undefined)[] = [
    eq(events.status, "published"),
    ne(events.admission, "invite_only"),
    eq(structures.verification, "verified"),
    sql`${structures.deletedAt} is null`,
    // Lot R1 : un événement terminé ne remonte jamais dans les « à venir », même avec une période commencée plus tôt.
    upcoming ? gte(events.endsAt, upcomingEndBound(q.from, t)) : lt(events.endsAt, t),
  ];
  if (q.to) filters.push(sql`${events.startsAt} <= ${q.to.toISOString()}::timestamptz`);
  if (q.format) filters.push(eq(events.format, q.format));
  else if (q.formats?.length) filters.push(inArray(events.format, q.formats));
  if (q.department) filters.push(eq(events.department, q.department));
  if (q.structureId) filters.push(eq(events.structureId, q.structureId));
  if (q.categoryId) filters.push(sql`${events.criteria} -> 'categoryIds' ? ${q.categoryId}`);
  // Lot 44 : « Structures suivies » (Explorer, Selon mes goûts) ; sans compte, le filtre est ignoré.
  if (q.followed && viewer) {
    filters.push(
      sql`exists (select 1 from structure_follows sf where sf.structure_id = ${events.structureId} and sf.user_id = ${viewer.user.id})`,
    );
  }
  // Lot R1 : chaque mot se retrouve dans le titre, la ville, le lieu (adresse) ou le nom de l'organisateur, sans tenir
  // compte des accents ni de la casse ; un début de mot suffit (« Médite » trouve MéditeSportCar).
  for (const token of searchTokens(q.q)) {
    filters.push(anyColumnContains(token, [events.title, events.city, events.addressLine, structures.name]));
  }
  if (wantsRadius && located) {
    filters.push(withinRadiusSql(events.lat, events.lng, located.position, q.radiusKm ?? 50));
  }
  // Lot 45 : Explorer national du média (accréditation ouverte, région).
  filters.push(...mediaExploreFilters(q));

  // Affinités (S34), calculées pour la personne qui demande.
  const userId = viewer?.user.id ?? null;
  const followedSql = userId
    ? sql<boolean>`exists (select 1 from structure_follows sf where sf.structure_id = ${events.structureId} and sf.user_id = ${userId})`
    : sql<boolean>`false`;
  const commonSql = userId
    ? sql<number>`(select count(*)::int from jsonb_array_elements_text(coalesce(${events.criteria} -> 'categoryIds', '[]'::jsonb)) c(id)
        join profile_interests pi on pi.category_id::text = c.id where pi.user_id = ${userId})`
    : sql<number>`0`;
  const nearSql = dist ? sql<number>`(case when ${dist} <= ${AFFINITY_NEAR_KM} then 1 else 0 end)` : sql<number>`0`;
  const scoreSql = sql`(case when ${followedSql} then 3 else 0 end + 2 * ${commonSql} + ${nearSql})`;

  // Lot M4 (maquette 3.2) : places exposants restantes (sans limite en tête), retenues et places offertes déduites.
  // Tour 2 (relecture Codex) : le même calcul que le compteur affiché (`remainingWithDays`), avant la pagination. Plusieurs
  // jours : les places du meilleur jour (sa capacité, ou celle de l'événement, moins ses candidatures et celles de tout
  // l'événement) ; un jour sans limite rend l'événement sans limite. Jamais sous zéro.
  const seatsSql = sql<number>`(case
    when (select count(*) from event_days ed where ed.event_id = ${events.id}) >= 2 then (
      select case when bool_or(coalesce(ed.capacity, ${events.capacity}) is null) then ${sql.raw(String(UNLIMITED))}
        else greatest(0, max(coalesce(ed.capacity, ${events.capacity}) - (select count(*)::int from applications a
          where a.event_id = ${events.id} and a.kind = 'vehicle' and a.status in ('accepted', 'offered')
          and (a.event_day_id is null or a.event_day_id = ed.id)))) end
      from event_days ed where ed.event_id = ${events.id})
    when ${events.capacity} is null then ${sql.raw(String(UNLIMITED))}
    else greatest(0, ${events.capacity} - (select count(*)::int from applications a where a.event_id = ${events.id}
      and a.kind = 'vehicle' and a.status in ('accepted', 'offered')))
  end)`;
  // Tour 2 : pagination par curseur sur (places, début, id) pour ce tri, dont la valeur bouge au fil des inscriptions
  // (un décalage d'offset sautait ou répétait des événements). L'appli écarte un doublon par son id.
  const after = sort === "seats" ? decodeSeatsCursor(q.cursor) : null;
  if (after) {
    filters.push(
      sql`(${seatsSql} < ${after.seats} or (${seatsSql} = ${after.seats} and (${events.startsAt} > ${after.startsAt}::timestamptz
        or (${events.startsAt} = ${after.startsAt}::timestamptz and ${events.id} > ${after.id}::uuid))))`,
    );
  }
  const order: SQL[] =
    sort === "recent"
      ? [sql`${events.publishedAt} desc nulls last`, asc(events.startsAt), asc(events.id)]
      : sort === "seats"
        ? [sql`${seatsSql} desc`, asc(events.startsAt), asc(events.id)]
        : sort === "affinity"
          ? [desc(scoreSql), asc(events.startsAt), asc(events.id)]
          : sort === "distance" && dist
            ? [sql`${dist} asc nulls last`, asc(events.startsAt), asc(events.id)]
            : upcoming
              ? [asc(events.startsAt), asc(events.id)]
              : [desc(events.startsAt), asc(events.id)];

  const offset = sort === "seats" ? 0 : decodeOffset(q.cursor);
  const rows = await db
    .select({
      e: events,
      s: structures,
      dist: dist ?? sql<number | null>`null`,
      followed: sort === "affinity" ? followedSql : sql<boolean>`false`,
      common: sort === "affinity" ? commonSql : sql<number>`0`,
      seats: sort === "seats" ? seatsSql : sql<number | null>`null`,
    })
    .from(events)
    .innerJoin(structures, eq(structures.id, events.structureId))
    .where(and(...filters))
    .orderBy(...order)
    .limit(q.limit + 1)
    .offset(offset);

  const page = rows.slice(0, q.limit);
  const remaining = await remainingWithDays(page.map((r) => r.e));
  const items = page.map((r) => {
    const out = card(r.e, r.s, remaining.get(r.e.id) ?? null);
    const km = roundKm(r.dist);
    if (needsDistance) out.distanceKm = km;
    if (sort === "affinity") {
      out.affinity = affinityOf({
        followed: Boolean(r.followed),
        commonCategories: Number(r.common),
        distanceKm: r.dist,
      });
    }
    return out;
  });
  await decorateForMedia(items, q, viewer);
  const last = page.at(-1);
  const nextCursor =
    rows.length <= q.limit || !last
      ? null
      : sort === "seats"
        ? encodeSeatsCursor({ seats: Number(last.seats), startsAt: last.e.startsAt.toISOString(), id: last.e.id })
        : encodeOffset(offset + q.limit);
  return { items, nextCursor };
}
