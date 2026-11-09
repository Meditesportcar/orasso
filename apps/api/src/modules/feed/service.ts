// Le Fil (lot R7e1, ARCHITECTURE-R7 § 2.4) : `GET /fil`. Les sources rendent des candidats ; ici on les note
// (`scoreCard`), on les mélange (`diversify`) et on pagine.
//
// Curseur stable : le premier appel fixe `ref` (l'instant du parcours) ; rien de plus récent n'entre ensuite. Phase 1 :
// les cartes des 48 h avant `ref`, classées par score, la page suivante reprend après la dernière carte vue (son
// identifiant, sinon sa position). Phase 2 : au-delà, par date décroissante, le curseur est la dernière (date, id).
// Aucun doublon ni trou tant que les données ne bougent pas ; une carte retirée entre deux pages ne décale rien.
import {
  compareByDate,
  diversify,
  FEED_PAGE,
  FEED_SCORE_WINDOW_MS,
  type FeedCandidate,
  type FeedCard,
  type FeedCardKind,
  type FeedFilter,
  type FeedPage,
  type FeedViewerContext,
  feedCardKinds,
  feedReasonLabel,
  insertSponsored,
  isFollowedCard,
  nearbyDepartments,
  reasonCode,
  scoreCard,
} from "@orasso/shared";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "../../db/client";
import {
  crewMembers,
  crews,
  proFollows,
  profileInterests,
  profiles,
  structureFollows,
  userFollows,
} from "../../db/schema";
import { now } from "../../lib/deps";
import { validation } from "../../lib/errors";
import { rateLimit } from "../../lib/rateLimit";
import type { Viewer } from "../../lib/session";
import { rankedSources } from "./sources";
import type { LoadedCard, SourceInput } from "./sources/types";

/** Candidats demandés à chaque source pour la fenêtre classée (phase 1). */
const WINDOW_LIMIT = 60;

const cursorSchema = z.union([
  z.object({
    r: z.iso.datetime(),
    p: z.literal(1),
    n: z.number().int().min(0).max(5000),
    l: z.string().max(100).nullable(),
  }),
  z.object({ r: z.iso.datetime(), p: z.literal(2), a: z.iso.datetime(), i: z.string().max(100) }),
]);
type Cursor = z.infer<typeof cursorSchema>;

const encode = (c: Cursor) => Buffer.from(JSON.stringify(c)).toString("base64url");
function decode(raw: string | undefined): Cursor | null {
  if (!raw) return null;
  try {
    return cursorSchema.parse(JSON.parse(Buffer.from(raw, "base64url").toString()));
  } catch {
    throw validation("Curseur invalide : recharge le Fil.");
  }
}

/** Ce que le classement sait de la personne (ses liens), calculé pour elle seule. */
export async function viewerContext(v: Viewer): Promise<FeedViewerContext> {
  const id = v.user.id;
  const [users, structs, pros, mates, interests] = await Promise.all([
    db
      .select({ id: userFollows.followedId })
      .from(userFollows)
      .where(and(eq(userFollows.followerId, id), eq(userFollows.status, "accepted"))),
    db.select({ id: structureFollows.structureId }).from(structureFollows).where(eq(structureFollows.userId, id)),
    db.select({ id: proFollows.proId }).from(proFollows).where(eq(proFollows.userId, id)),
    db
      .selectDistinct({ id: sql<string>`other.user_id` })
      .from(crewMembers)
      .innerJoin(crews, eq(crews.id, crewMembers.crewId))
      .innerJoin(sql`crew_members other`, sql`other.crew_id = ${crewMembers.crewId}`)
      .where(
        and(
          eq(crewMembers.userId, id),
          eq(crewMembers.status, "active"),
          sql`${crews.deletedAt} is null`,
          sql`other.status = 'active'`,
          sql`other.user_id <> ${id}`,
        ),
      ),
    db.select({ id: profileInterests.categoryId }).from(profileInterests).where(eq(profileInterests.userId, id)),
  ]);
  return {
    departments: v.profile.departments,
    followedUsers: new Set(users.map((r) => r.id)),
    followedStructures: new Set(structs.map((r) => r.id)),
    followedPros: new Set(pros.map((r) => r.id)),
    crewmates: new Set(mates.map((r) => r.id)),
    interests: new Set(interests.map((r) => r.id)),
    lessKinds: new Set(v.profile.feedLessKinds),
  };
}

/** Toutes les sources, en parallèle ; `truncated` : une source a rendu autant de lignes que demandé (il y en a peut-être plus). */
async function loadAll(input: SourceInput): Promise<{ cards: LoadedCard[]; truncated: boolean }> {
  const lists = await Promise.all(rankedSources.map((s) => s.load(input)));
  const byId = new Map<string, LoadedCard>();
  for (const list of lists) for (const c of list) byId.set(c.id, c);
  return { cards: [...byId.values()], truncated: lists.some((l) => l.length >= input.limit) };
}

/**
 * Dernière ligne de défense, après les sources : « Mes abonnements » ne garde que ce que la personne suit, « Autour de
 * moi » que les départements proches. Un genre inconnu du Fil est écarté.
 */
function allowed(c: LoadedCard, filter: FeedFilter, ctx: FeedViewerContext, nearby: readonly string[], self: string) {
  if (!feedCardKinds.includes(c.kind)) return false;
  if (filter === "following") return c.authorId !== self && isFollowedCard(c, ctx);
  if (filter === "nearby") return c.department !== null && nearby.includes(c.department);
  return true;
}

function toCard(c: LoadedCard, ctx: FeedViewerContext): FeedCard {
  const code = reasonCode(c as FeedCandidate, ctx, c.official === true);
  return {
    id: c.id,
    kind: c.kind,
    reason: { code, label: feedReasonLabel(code, c.authorPseudo) },
    at: c.at.toISOString(),
    payload: c.payload,
  } as FeedCard;
}

/** Point d'insertion du Sponsorisé (positions 4, 10, 16…) : le lot R7k1 branche ici son choix ; `null` = rien. */
const sponsoredPicker: ((position: number) => FeedCard | null) | null = null;

export const feedService = {
  async feed(v: Viewer, q: { filter: FeedFilter; cursor?: string | undefined }): Promise<FeedPage> {
    rateLimit("feedRead", v.user.id);
    const t = now();
    const cursor = decode(q.cursor);
    const refMs = cursor ? Math.min(Date.parse(cursor.r), t.getTime()) : t.getTime();
    const ref = new Date(refMs);
    const boundary = new Date(refMs - FEED_SCORE_WINDOW_MS);
    const ctx = await viewerContext(v);
    const nearby = nearbyDepartments(ctx.departments);
    const base = { viewer: v, userId: v.user.id, ref, filter: q.filter, ctx, nearby } as const;
    const keep = (c: LoadedCard) => allowed(c, q.filter, ctx, nearby, v.user.id);

    const items: FeedCard[] = [];
    let next: Cursor | null = null;
    let offset = 0;

    // Phase 1 : la fenêtre de 48 h, classée par score puis mélangée.
    if (!cursor || cursor.p === 1) {
      const { cards } = await loadAll({ ...base, since: boundary, until: ref, limit: WINDOW_LIMIT });
      const scored = cards.filter(keep).map((c) => ({ ...c, score: scoreCard(c as FeedCandidate, ctx, ref) }));
      const ordered = diversify(scored);
      let start = cursor?.n ?? 0;
      if (cursor?.l) {
        const at = ordered.findIndex((c) => c.id === cursor.l);
        if (at >= 0) start = at + 1;
      }
      offset = start;
      const page = ordered.slice(start, start + FEED_PAGE);
      for (const c of page) items.push(toCard(c, ctx));
      const last = page.at(-1);
      if (last && start + page.length < ordered.length) {
        next = { r: ref.toISOString(), p: 1, n: start + page.length, l: last.id };
      }
    }

    // Phase 2 : au-delà de 48 h, par date. Elle complète une première phase épuisée, ou continue son curseur.
    if (!next && items.length < FEED_PAGE) {
      const after = cursor?.p === 2 ? { at: new Date(cursor.a), id: cursor.i } : null;
      const until = after ? after.at : boundary;
      const { cards, truncated } = await loadAll({ ...base, since: null, until, limit: FEED_PAGE + 1 });
      const older = cards
        .filter(keep)
        .filter((c) => (after ? compareByDate(after, c) < 0 : c.at.getTime() < boundary.getTime()))
        .sort(compareByDate);
      const need = FEED_PAGE - items.length;
      const page = older.slice(0, need);
      for (const c of page) items.push(toCard(c, ctx));
      const last = page.at(-1);
      if (last && (older.length > need || truncated)) {
        next = { r: ref.toISOString(), p: 2, a: last.at.toISOString(), i: last.id };
      }
    }

    return {
      items: insertSponsored(items, sponsoredPicker, offset),
      nextCursor: next ? encode(next) : null,
      filter: q.filter,
    };
  },

  /** `GET /me/fil/less` */
  lessKinds(v: Viewer): { kinds: FeedCardKind[] } {
    return {
      kinds: v.profile.feedLessKinds.filter((k): k is FeedCardKind => feedCardKinds.includes(k as FeedCardKind)),
    };
  },

  /** `POST /me/feed/less` : « Moins de ce genre » (idempotent). */
  async addLess(v: Viewer, kind: FeedCardKind): Promise<{ kinds: FeedCardKind[] }> {
    rateLimit("feedWrite", v.user.id);
    const [row] = await db
      .update(profiles)
      .set({
        feedLessKinds: sql`case when ${kind} = any(${profiles.feedLessKinds}) then ${profiles.feedLessKinds}
          else array_append(${profiles.feedLessKinds}, ${kind}) end`,
      })
      .where(eq(profiles.userId, v.user.id))
      .returning({ kinds: profiles.feedLessKinds });
    return { kinds: (row?.kinds ?? []) as FeedCardKind[] };
  },

  /** `DELETE /me/feed/less/:kind` (idempotent). */
  async removeLess(v: Viewer, kind: FeedCardKind): Promise<{ kinds: FeedCardKind[] }> {
    rateLimit("feedWrite", v.user.id);
    const [row] = await db
      .update(profiles)
      .set({ feedLessKinds: sql`array_remove(${profiles.feedLessKinds}, ${kind})` })
      .where(eq(profiles.userId, v.user.id))
      .returning({ kinds: profiles.feedLessKinds });
    return { kinds: (row?.kinds ?? []) as FeedCardKind[] };
  },
};
