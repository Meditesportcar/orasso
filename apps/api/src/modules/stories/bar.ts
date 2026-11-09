// Barre des stories et résumé d'un auteur (lot R7f1, ARCHITECTURE-R7 § 2.5). Une entrée par auteur (personne,
// structure ou pro), seulement ceux que je suis (abonnement accepté) et mes crews ; les mutes sont exclus ; les non vues
// d'abord. Un compte privé que je ne suis pas (ou dont la demande est en attente) n'apparaît pas, et rien ne dit qu'il a
// une story. `live` (organisateur « En cours ») est faux partout : lot R7h.
import {
  type StoriesSummary,
  type StoryBar,
  type StoryBarEntry,
  type StoryTagKind,
  storyAuthorKeyOf,
  storyBarOrder,
  storyDenial,
  storyRing,
} from "@orasso/shared";
import { and, eq, inArray, or, type SQL, sql } from "drizzle-orm";

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

const CANDIDATES_MAX = 1000;

const ringStories = (rows: readonly StoryRow[]) =>
  rows.map((r) => ({ audience: r.story.audience, expiresAt: r.story.expiresAt, deletedAt: r.story.deletedAt }));

const newest = (rows: readonly StoryRow[]) => rows.reduce((a, b) => (a.story.createdAt >= b.story.createdAt ? a : b));

async function seenSet(userId: string, rows: readonly StoryRow[]): Promise<Set<string>> {
  if (!rows.length) return new Set();
  const seen = await db
    .select({ id: storyViews.storyId })
    .from(storyViews)
    .where(
      and(
        eq(storyViews.viewerId, userId),
        inArray(
          storyViews.storyId,
          rows.map((r) => r.story.id),
        ),
      ),
    );
  return new Set(seen.map((r) => r.id));
}

/** Stories signées d'une personne (ni casquette organisateur, ni casquette pro). */
const personal = sql`${stories.persona} not in ('organizer','pro')`;

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
    const mutedRows = await db.select().from(storyMutes).where(eq(storyMutes.userId, me));
    const muted = new Set(mutedRows.map((m) => storyAuthorKeyOf(m.authorKind, m.authorId)));

    const ors: (SQL | undefined)[] = [];
    if (sets.users.size) ors.push(and(personal, inArray(stories.authorId, [...sets.users])));
    if (sets.crews.size) ors.push(inArray(stories.crewId, [...sets.crews.keys()]));
    if (sets.structures.size)
      ors.push(and(eq(stories.persona, "organizer"), inArray(stories.structureId, [...sets.structures])));
    if (sets.pros.size) ors.push(and(eq(stories.persona, "pro"), inArray(stories.proId, [...sets.pros])));
    const candidates = ors.length
      ? (await selectStories(and(liveStory(at), sql`${stories.authorId} <> ${me}`, or(...ors))))
          .sort((a, b) => b.story.createdAt.getTime() - a.story.createdAt.getTime())
          .slice(0, CANDIDATES_MAX)
      : [];

    const viewer = viewerOf(v);
    const visible = candidates.filter((r) => {
      const key = authorKeyOf(r);
      if (!key || muted.has(key.key)) return false;
      return storyDenial(viewer, audienceStoryOf(r, at), relationOf(sets, r)) === null;
    });
    const seen = await seenSet(me, visible);

    const byAuthor = new Map<string, StoryRow[]>();
    for (const r of visible) {
      const key = authorKeyOf(r);
      if (key) byAuthor.set(key.key, [...(byAuthor.get(key.key) ?? []), r]);
    }
    const entries: { entry: Omit<StoryBarEntry, "latestAt">; hasUnseen: boolean; latestAt: Date }[] = [];
    for (const [key, rows] of byAuthor) {
      const ring = storyRing({ live: false }, ringStories(rows), at);
      if (!ring) continue;
      const latest = newest(rows);
      const display = authorDisplay(latest, storage.url);
      const crewRows = rows.filter((r) => r.story.audience === "crew");
      const hasUnseen = rows.some((r) => !seen.has(r.story.id));
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

    const mineRows = await selectStories(and(liveStory(at), eq(stories.authorId, me)));
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
    const rows = await selectStories(and(liveStory(at), where));
    if (!rows.length) return { count: 0, hasUnseen: false, ring: null };
    const sets = await setsFor(v.user.id, rows);
    const viewer = viewerOf(v);
    const visible = rows.filter((r) => storyDenial(viewer, audienceStoryOf(r, at), relationOf(sets, r)) === null);
    if (!visible.length) return { count: 0, hasUnseen: false, ring: null };
    const seen = await seenSet(v.user.id, visible);
    const self = kind === "user" && id === v.user.id;
    return {
      count: visible.length,
      hasUnseen: self ? false : visible.some((r) => !seen.has(r.story.id)),
      ring: storyRing({ live: false }, ringStories(visible), at),
    };
  },
};
