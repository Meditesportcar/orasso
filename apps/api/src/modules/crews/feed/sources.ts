// Fil d'un crew (lot R5c1) : les sources du fil, réunies par une seule requête `union all` triée par date, puis
// hydratées source par source. Une source = des lignes `(type, id, at)` et une fonction qui les transforme en entrées.
// Pour ajouter une source (les sorties du crew, lot R5c2, à la fusion) : écrire un objet `FeedSource` et l'ajouter à
// `feedSources` ; ni la pagination ni le tri ne changent.
import type { CrewFeedItem } from "@orasso/shared";
import { and, eq, inArray, type SQL, sql } from "drizzle-orm";

import { db } from "../../../db/client";
import { profiles, vehicles } from "../../../db/schema";
import type { Executor } from "../../../lib/tx";
import { vehicleLabel } from "../../vehicles/serializers";
import { type FeedAccess, visibleProfile } from "./access";
import { loadPostViews, personOf } from "./posts";

export type FeedRow = { type: CrewFeedItem["type"]; id: string; at: Date };

export type FeedSource = {
  type: CrewFeedItem["type"];
  /**
   * Les lignes de la source pour ce crew : `select '<type>'::text as type, <id>::text as id, <date> as at`. La date
   * doit être tronquée à la milliseconde (`date_trunc('milliseconds', …)`) : le curseur la transporte en ISO.
   */
  rows(access: FeedAccess, at: Date): SQL;
  /** Les entrées des lignes retenues (une ligne absente du résultat est simplement omise du fil). */
  hydrate(ex: Executor, rows: FeedRow[], access: FeedAccess, at: Date): Promise<Map<string, CrewFeedItem>>;
};

/** Les publications du crew (non retirées, auteur ni supprimé ni suspendu). */
const postsSource: FeedSource = {
  type: "post",
  rows: (access, at) => sql`
    select 'post'::text as type, p.id::text as id, date_trunc('milliseconds', p.created_at) as at
    from crew_posts p join profiles a on a.user_id = p.author_id
    where p.crew_id = ${access.crew.id} and p.deleted_at is null and ${visibleProfile("a", at)}`,
  async hydrate(ex, rows, access, at) {
    const views = await loadPostViews(
      ex,
      rows.map((r) => r.id),
      access,
      at,
    );
    const atOf = new Map(rows.map((r) => [r.id, r.at]));
    return new Map(
      views.map((post) => [
        `post:${post.id}`,
        {
          type: "post" as const,
          key: `post:${post.id}`,
          at: (atOf.get(post.id) ?? new Date(post.createdAt)).toISOString(),
          post,
        },
      ]),
    );
  },
};

/** Un membre qui arrive (membres actifs seulement, hors chef : sa date d'arrivée est la création du crew). */
const memberJoinedSource: FeedSource = {
  type: "member_joined",
  rows: (access, at) => sql`
    select 'member_joined'::text as type, m.user_id::text as id, date_trunc('milliseconds', m.joined_at) as at
    from crew_members m join profiles pr on pr.user_id = m.user_id
    where m.crew_id = ${access.crew.id} and m.status = 'active' and m.role <> 'leader' and m.joined_at is not null
      and ${visibleProfile("pr", at)}`,
  async hydrate(ex, rows) {
    const ids = rows.map((r) => r.id);
    const people = await ex.select().from(profiles).where(inArray(profiles.userId, ids));
    const mainIds = people.map((p) => p.mainVehicleId).filter((x): x is string => Boolean(x));
    const mains = mainIds.length
      ? await ex.query.vehicles.findMany({
          where: and(inArray(vehicles.id, mainIds), eq(vehicles.status, "active")),
          with: { make: true, model: true, generation: true },
        })
      : [];
    const labelOf = new Map(mains.map((v) => [v.id, vehicleLabel(v)]));
    const byId = new Map(people.map((p) => [p.userId, p]));
    const out = new Map<string, CrewFeedItem>();
    for (const r of rows) {
      const p = byId.get(r.id);
      if (!p) continue;
      const key = `member_joined:${r.id}`;
      out.set(key, {
        type: "member_joined",
        key,
        at: r.at.toISOString(),
        person: personOf(p),
        vehicleLabel: p.mainVehicleId ? (labelOf.get(p.mainVehicleId) ?? null) : null,
      });
    }
    return out;
  },
};

/** Le crew retenu à un événement : les inscriptions en crew retenues, une entrée par événement publié. */
const crewAcceptedSource: FeedSource = {
  type: "crew_accepted",
  rows: (access, at) => sql`
    select 'crew_accepted'::text as type, ap.event_id::text as id,
      date_trunc('milliseconds', min(coalesce(ap.decided_at, ap.updated_at))) as at
    from applications ap
      join events e on e.id = ap.event_id and e.status = 'published'
      join profiles pr on pr.user_id = ap.user_id
    where ap.crew_id = ${access.crew.id} and ap.status = 'accepted' and ${visibleProfile("pr", at)}
    group by ap.event_id`,
  async hydrate(ex, rows, access, at) {
    const ids = rows.map((r) => r.id);
    const result = await ex.execute(sql`
      select e.id, e.slug, e.title, e.starts_at, e.city,
        array_agg(pr.pseudo order by coalesce(ap.decided_at, ap.updated_at), pr.pseudo) as pseudos
      from applications ap
        join events e on e.id = ap.event_id
        join profiles pr on pr.user_id = ap.user_id
      where ap.crew_id = ${access.crew.id} and ap.status = 'accepted' and ${visibleProfile("pr", at)}
        and ap.event_id in (${sql.join(
          ids.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})
      group by e.id`);
    type Row = {
      id: string;
      slug: string;
      title: string;
      starts_at: Date | string;
      city: string | null;
      pseudos: string[];
    };
    const byId = new Map((result.rows as Row[]).map((r) => [r.id, r]));
    const out = new Map<string, CrewFeedItem>();
    for (const r of rows) {
      const e = byId.get(r.id);
      if (!e) continue;
      const key = `crew_accepted:${r.id}`;
      out.set(key, {
        type: "crew_accepted",
        key,
        at: r.at.toISOString(),
        event: {
          id: e.id,
          slug: e.slug,
          title: e.title,
          startsAt: new Date(e.starts_at).toISOString(),
          city: e.city,
        },
        members: [...new Set(e.pseudos)],
      });
    }
    return out;
  },
};

/** Les sources du fil, dans l'ordre de départage d'une même date (le `type` le plus grand d'abord). */
export const feedSources: FeedSource[] = [postsSource, memberJoinedSource, crewAcceptedSource];

export type FeedCursor = { at: Date; type: string; id: string };

export function encodeFeedCursor(row: FeedRow): string {
  return Buffer.from(JSON.stringify([row.at.toISOString(), row.type, row.id])).toString("base64url");
}

export function decodeFeedCursor(cursor: string | undefined): FeedCursor | null {
  if (!cursor) return null;
  try {
    const [iso, type, id] = JSON.parse(Buffer.from(cursor, "base64url").toString()) as unknown[];
    const at = new Date(String(iso));
    if (typeof type !== "string" || typeof id !== "string" || Number.isNaN(at.getTime())) return null;
    return { at, type, id };
  } catch {
    return null;
  }
}

/**
 * Une page du fil : les lignes de toutes les sources, triées par date décroissante (départage par type puis
 * identifiant, curseur stable), puis hydratées. `limit + 1` lignes lues pour savoir s'il y a une suite.
 */
export async function readFeedRows(
  access: FeedAccess,
  at: Date,
  cursor: FeedCursor | null,
  limit: number,
  sources: FeedSource[] = feedSources,
  ex: Executor = db,
): Promise<{ rows: FeedRow[]; more: boolean }> {
  const union = sql.join(
    sources.map((s) => sql`(${s.rows(access, at)})`),
    sql` union all `,
  );
  const after = cursor
    ? sql`where (f.at, f.type, f.id) < (${cursor.at.toISOString()}::timestamptz, ${cursor.type}, ${cursor.id})`
    : sql``;
  const result = await ex.execute(sql`
    select f.type, f.id, f.at from (${union}) f ${after}
    order by f.at desc, f.type desc, f.id desc
    limit ${limit + 1}`);
  const all = (result.rows as { type: FeedRow["type"]; id: string; at: Date | string }[]).map((r) => ({
    type: r.type,
    id: r.id,
    at: new Date(r.at),
  }));
  return { rows: all.slice(0, limit), more: all.length > limit };
}
