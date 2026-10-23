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
} from "@orasso/shared";
import { and, asc, desc, eq, gte, inArray, lt, ne, or, type SQL, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { applications, events, structures } from "../../db/schema";
import { now } from "../../lib/deps";
import { distanceKmSql, roundKm, withinRadiusSql } from "../../lib/geo-sql";
import type { Viewer } from "../../lib/session";
import { containsPattern, searchTokens } from "../../lib/text-search";
import { decorateForMedia, mediaExploreFilters } from "../media/explore";
import { card } from "./card";
import { daysRepo } from "./days";
import type { EventRow } from "./repo";

const safeOffset = (n: number): number => (Number.isSafeInteger(n) && n >= 0 ? n : 0);
const decodeOffset = (cursor: string | undefined): number =>
  cursor ? safeOffset(Number(Buffer.from(cursor, "base64url").toString())) : 0;
const encodeOffset = (offset: number): string => Buffer.from(String(offset)).toString("base64url");

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
  const located = resolvePosition({ lat: q.lat, lng: q.lng }, viewer?.profile.departments ?? null);
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
  const wantsRadius = located !== null && (q.radiusKm !== undefined || (explicit && q.sort === "date"));
  const needsDistance = located !== null && (sort !== "date" || wantsRadius || explicit);
  const dist = needsDistance && located ? distanceKmSql(events.lat, events.lng, located.position) : null;

  const filters: (SQL | undefined)[] = [
    eq(events.status, "published"),
    ne(events.admission, "invite_only"),
    eq(structures.verification, "verified"),
    sql`${structures.deletedAt} is null`,
    upcoming ? gte(events.endsAt, q.from ?? t) : lt(events.endsAt, t),
  ];
  if (q.to) filters.push(sql`${events.startsAt} <= ${q.to.toISOString()}::timestamptz`);
  if (q.format) filters.push(eq(events.format, q.format));
  if (q.department) filters.push(eq(events.department, q.department));
  if (q.structureId) filters.push(eq(events.structureId, q.structureId));
  if (q.categoryId) filters.push(sql`${events.criteria} -> 'categoryIds' ? ${q.categoryId}`);
  // Lot 44 : « Structures suivies » (Explorer, Selon mes goûts) ; sans compte, le filtre est ignoré.
  if (q.followed && viewer) {
    filters.push(
      sql`exists (select 1 from structure_follows sf where sf.structure_id = ${events.structureId} and sf.user_id = ${viewer.user.id})`,
    );
  }
  for (const token of searchTokens(q.q)) {
    const like = containsPattern(token);
    filters.push(or(sql`${events.title} ilike ${like}`, sql`${events.city} ilike ${like}`));
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
  const seatsSql = sql`(case when ${events.capacity} is null then 2147483647 else ${events.capacity} - (select count(*)::int
    from applications a where a.event_id = ${events.id} and a.kind = 'vehicle' and a.status in ('accepted', 'offered')) end)`;
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

  const offset = decodeOffset(q.cursor);
  const rows = await db
    .select({
      e: events,
      s: structures,
      dist: dist ?? sql<number | null>`null`,
      followed: sort === "affinity" ? followedSql : sql<boolean>`false`,
      common: sort === "affinity" ? commonSql : sql<number>`0`,
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
  return { items, nextCursor: rows.length > q.limit ? encodeOffset(offset + q.limit) : null };
}
