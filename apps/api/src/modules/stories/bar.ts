// Barre des stories et résumé d'un auteur (lot R7f1, ARCHITECTURE-R7 § 2.5). Une entrée par auteur (personne,
// structure ou pro), seulement ceux que je suis (abonnement accepté) et mes crews ; les mutes sont exclus ; les non vues
// d'abord. Un compte privé que je ne suis pas (ou dont la demande est en attente) n'apparaît pas, et rien ne dit qu'il a
// une story. Lot R7h : `live` (organisateur « En cours ») = la structure a un événement publié qui tourne (du début à la fin)
// et une story vivante ; une structure dont j'ai une place à un événement en cours est dans ma barre sans que je la suive.
import {
  STORY_LIVE_MAX,
  type StoriesSummary,
  type StoryBar,
  type StoryBarEntry,
  type StoryTagKind,
  storyAuthorKeyOf,
  storyBarOrder,
  storyDenial,
  storyRing,
} from "@orasso/shared";
import { type AnyColumn, and, eq, or, type SQL, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { stories, storyMutes, storyViews } from "../../db/schema";
import { now } from "../../lib/deps";
import type { Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";
import {
  audienceStoryOf,
  authorDisplay,
  authorKeyOf,
  liveStory,
  loadViewerSets,
  relationOf,
  type StoryRow,
  selectStories,
  setsFor,
  viewerOf,
} from "./common";

/** Stories gardées par auteur (après le filtre de visibilité) ; le plafond de publication est le même. */
const PER_AUTHOR_MAX = STORY_LIVE_MAX;

const ringStories = (rows: readonly StoryRow[]) =>
  rows.map((r) => ({ audience: r.story.audience, expiresAt: r.story.expiresAt, deletedAt: r.story.deletedAt }));

const newest = (rows: readonly StoryRow[]) => rows.reduce((a, b) => (a.story.createdAt >= b.story.createdAt ? a : b));

/**
 * Les stories vivantes que j'ai vues, lues par jointure avec `story_views` : aucun identifiant de story n'est envoyé
 * en paramètre (une longue liste de suivis ne fait pas dépasser la limite de paramètres de PostgreSQL).
 */
async function seenSet(userId: string, at: Date): Promise<Set<string>> {
  const seen = await db
    .select({ id: storyViews.storyId })
    .from(storyViews)
    .innerJoin(stories, eq(stories.id, storyViews.storyId))
    .where(and(eq(storyViews.viewerId, userId), liveStory(at)));
  return new Set(seen.map((r) => r.id));
}

/** Une liste d'identifiants en UN seul paramètre (tableau PostgreSQL), jamais un paramètre par identifiant. */
const anyOf = (column: SQL | AnyColumn, ids: Iterable<string>, type: "text" | "uuid") =>
  sql`${column} = any(${sql.param([...ids])}::${sql.raw(type)}[])`;

/** Clé d'auteur affiché d'une story, en SQL (même règle que `authorKeyOf`). */
const authorKeySql = sql`case ${stories.persona} when 'organizer' then 's:' || ${stories.structureId}::text when 'pro' then 'p:' || ${stories.proId}::text else 'u:' || ${stories.authorId} end`;

/** Au plus `PER_AUTHOR_MAX` stories par auteur, les plus récentes, choisies dans le SQL (`row_number`). */
const newestPerAuthor = (where: SQL) =>
  sql`${stories.id} in (select r.id from (select ${stories.id} as id, row_number() over (partition by ${authorKeySql} order by ${stories.createdAt} desc, ${stories.id} desc) as rn from stories where ${where}) r where r.rn <= ${PER_AUTHOR_MAX})`;

/** Stories signées d'une personne (ni casquette organisateur, ni casquette pro). */
const personal = sql`${stories.persona} not in ('organizer','pro')`;

/** Les structures qui ont un événement publié en cours (du début à la fin) : l'anneau « EN COURS ». */
async function liveStructureIds(at: Date): Promise<Set<string>> {
  const res = await db.execute<{ id: string }>(
    sql`select distinct e.structure_id::text as id from events e
      where e.status = 'published' and e.starts_at <= ${at} and e.ends_at > ${at}`,
  );
  return new Set(res.rows.map((r) => r.id));
}

/** Les structures dont j'ai une place (candidature retenue, billet, présence) à un événement en cours. */
async function structuresWithPlace(userId: string, at: Date): Promise<Set<string>> {
  const res = await db.execute<{ id: string }>(
    sql`select distinct e.structure_id::text as id from events e
      where e.status = 'published' and e.starts_at <= ${at} and e.ends_at > ${at}
        and (exists (select 1 from applications a where a.event_id = e.id and a.user_id = ${userId}
              and a.kind = 'vehicle' and a.status = 'accepted')
          or exists (select 1 from tickets k where k.event_id = e.id and k.user_id = ${userId} and k.status in ('valid', 'used'))
          or exists (select 1 from event_presences g where g.event_id = e.id and g.user_id = ${userId}))`,
  );
  return new Set(res.rows.map((r) => r.id));
}

/** Pour une page publique (structure, pro) : zéro sans session (aucune story n'est servie sans session). */
export async function storiesSummaryFor(v: Viewer | null, kind: StoryTagKind, id: string): Promise<StoriesSummary> {
  if (!v) return { count: 0, hasUnseen: false, ring: null };
  return storiesBar.summary(v, kind, id);
}

export const storiesBar = {
  async get(v: Viewer): Promise<StoryBar> {
    const at = now();
    const me = v.user.id;
    const sets = await loadViewerSets(me);
    // Lot R7h : l'organisateur d'un événement où j'ai ma place apparaît « EN COURS » même si je ne le suis pas.
    const [liveStructures, placeStructures] = await Promise.all([liveStructureIds(at), structuresWithPlace(me, at)]);
    const poolStructures = new Set([...sets.structures, ...placeStructures]);
    const mutedRows = await db.select().from(storyMutes).where(eq(storyMutes.userId, me));
    const muted = new Set(mutedRows.map((m) => storyAuthorKeyOf(m.authorKind, m.authorId)));

    const ors: (SQL | undefined)[] = [];
    if (sets.users.size) ors.push(and(personal, anyOf(stories.authorId, sets.users, "text")));
    if (sets.crews.size) ors.push(anyOf(stories.crewId, sets.crews.keys(), "uuid"));
    if (poolStructures.size)
      ors.push(and(eq(stories.persona, "organizer"), anyOf(stories.structureId, poolStructures, "uuid")));
    if (sets.pros.size) ors.push(and(eq(stories.persona, "pro"), anyOf(stories.proId, sets.pros, "uuid")));
    // Tour 3 : les 50 plus récentes de chaque auteur sont choisies dans le SQL (le plafond de publication est le même, rien
    // de visible n'est perdu) ; puis on filtre (auteurs masqués, audiences) : des stories masquées
    // ou refusées ne chassent plus des stories visibles hors de la barre.
    const pool = ors.length ? (and(liveStory(at), sql`${stories.authorId} <> ${me}`, or(...ors)) as SQL) : null;
    const candidates = pool
      ? (await selectStories(and(pool, newestPerAuthor(pool)))).sort(
          (a, b) => b.story.createdAt.getTime() - a.story.createdAt.getTime(),
        )
      : [];

    const viewer = viewerOf(v);
    const visible = candidates.filter((r) => {
      const key = authorKeyOf(r);
      if (!key || muted.has(key.key)) return false;
      return storyDenial(viewer, audienceStoryOf(r, at), relationOf(sets, r)) === null;
    });
    const seen = await seenSet(me, at);

    const byAuthor = new Map<string, StoryRow[]>();
    for (const r of visible) {
      const key = authorKeyOf(r);
      if (key) byAuthor.set(key.key, [...(byAuthor.get(key.key) ?? []), r]);
    }
    const entries: { entry: Omit<StoryBarEntry, "latestAt">; hasUnseen: boolean; latestAt: Date }[] = [];
    for (const [key, all] of byAuthor) {
      // `hasUnseen` se lit sur toutes les stories visibles de l'auteur ; l'anneau et l'affichage sur les plus récentes.
      const hasUnseen = all.some((r) => !seen.has(r.story.id));
      const rows = all.slice(0, PER_AUTHOR_MAX);
      const ring = storyRing({ live: key.startsWith("s:") && liveStructures.has(key.slice(2)) }, ringStories(rows), at);
      if (!ring) continue;
      const latest = newest(rows);
      const display = authorDisplay(latest, storage.url);
      const crewRows = rows.filter((r) => r.story.audience === "crew");
      entries.push({
        entry: {
          key,
          pseudoOrName: display.name,
          avatarUrl: display.avatarUrl,
          ring,
          hasUnseen,
          crewName: ring === "crew" && crewRows.length ? newest(crewRows).crewName : null,
        },
        hasUnseen,
        latestAt: latest.story.createdAt,
      });
    }
    const authors: StoryBarEntry[] = storyBarOrder(entries).map((e) => ({
      ...e.entry,
      latestAt: e.latestAt.toISOString(),
    }));

    // « Ta story » ne compte que mes stories personnelles : celles que `by-author u:<moi>` sert. Celles au nom d'une
    // structure ou d'un pro ont leur propre clé (`s:`, `p:`) ; les compter ici ouvrirait une visionneuse vide.
    const mineRows = await selectStories(and(liveStory(at), eq(stories.authorId, me), personal));
    const mine = mineRows.length
      ? {
          count: mineRows.length,
          hasUnseen: false as const,
          latestAt: newest(mineRows).story.createdAt.toISOString(),
          ring: storyRing({ live: false }, ringStories(mineRows), at) ?? ("followers" as const),
        }
      : null;
    return { mine, authors };
  },

  /** Résumé pour un profil, une structure ou un pro, selon le regard : zéro si rien n'est visible (sans rien révéler). */
  async summary(v: Viewer, kind: StoryTagKind, id: string): Promise<StoriesSummary> {
    const at = now();
    const where =
      kind === "user"
        ? and(personal, eq(stories.authorId, id))
        : kind === "structure"
          ? and(eq(stories.persona, "organizer"), eq(stories.structureId, id))
          : and(eq(stories.persona, "pro"), eq(stories.proId, id));
    // Invariant : une story de crew ne se montre « ni sur le profil » ; l'anneau de crew vit dans la barre du Fil.
    const rows = await selectStories(and(liveStory(at), where, sql`${stories.audience} <> 'crew'`));
    if (!rows.length) return { count: 0, hasUnseen: false, ring: null };
    const sets = await setsFor(v.user.id, rows);
    const viewer = viewerOf(v);
    const visible = rows.filter((r) => storyDenial(viewer, audienceStoryOf(r, at), relationOf(sets, r)) === null);
    if (!visible.length) return { count: 0, hasUnseen: false, ring: null };
    const seen = await seenSet(v.user.id, at);
    const self = kind === "user" && id === v.user.id;
    return {
      count: visible.length,
      hasUnseen: self ? false : visible.some((r) => !seen.has(r.story.id)),
      ring: storyRing({ live: kind === "structure" && (await liveStructureIds(at)).has(id) }, ringStories(visible), at),
    };
  },
};
