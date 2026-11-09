// Le Fil (lot R7e1, ARCHITECTURE-R7 § 2.4) : `GET /fil`. Les sources rendent des candidats ; ici on les note
// (`scoreCard`), on les mélange (`diversify`) et on pagine.
//
// Curseur par clé, jamais par position. Le premier appel fixe `ref` (l'instant du parcours) ; rien de plus récent
// n'entre ensuite.
// - Phase 1 : toutes les cartes des 48 h avant `ref` (plafond de sécurité `CAP` par source), classées par
//   (score décroissant, identifiant). Le curseur porte la clé de la dernière carte de la tranche (`s`, `i`) : la page
//   suivante reprend strictement après elle. La diversité s'applique dans la page, à la suite des deux genres de la
//   page précédente (`k`).
// - Phase 2 : tout le reste, par (date décroissante, identifiant). Le curseur porte la dernière clé (`a`, `i`), posée
//   dans le SQL de chaque source avant son LIMIT. Une source qui a dépassé le plafond en phase 1 y reprend là où elle
//   s'est arrêtée (`x`) : ce qui dépasse passe en phase 2, rien n'est perdu.
// Aucun doublon ni trou, même si une carte est retirée entre deux pages.
import {
  compareByDate,
  compareByScore,
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
import type { FeedSource, Key, LoadedCard, SourceInput } from "./sources/types";

/** Plafond de sécurité par source pour la fenêtre classée (phase 1) ; ce qui dépasse passe en phase 2. */
export const WINDOW_CAP = 300;

const isoSchema = z.iso.datetime();
const cursorSchema = z.union([
  z.object({
    r: isoSchema,
    p: z.literal(1),
    /** Score et identifiant de la dernière carte de la tranche servie. */
    s: z.number().finite(),
    i: z.string().max(100),
    /** Genres des deux dernières cartes affichées (diversité d'une page à l'autre). */
    k: z.array(z.string().max(40)).max(2),
    /** Cartes déjà servies avant cette page (positions du Sponsorisé). */
    o: z.number().int().min(0).max(100_000),
  }),
  z.object({
    r: isoSchema,
    p: z.literal(2),
    /** Dernière clé servie ; absente tant que la phase 2 n'a rien servi. */
    a: isoSchema.optional(),
    i: z.string().max(100).optional(),
    /** Sources qui ont dépassé le plafond en phase 1 : [date, identifiant de carte] de leur dernière ligne lue. */
    x: z.array(z.tuple([isoSchema, z.string().max(100)])).max(16),
    o: z.number().int().min(0).max(100_000),
  }),
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

type Loaded = { source: FeedSource; cards: LoadedCard[]; more: boolean; tail: Key | null };

/** Toutes les sources, en parallèle (`before` : les clés exclusives de chacune, phase 2). */
async function loadAll(
  input: Omit<SourceInput, "before">,
  before: (kind: FeedCardKind) => Key[] = () => [],
): Promise<Loaded[]> {
  return Promise.all(
    rankedSources.map(async (source) => ({
      source,
      ...(await source.load({ ...input, before: before(source.kind) })),
    })),
  );
}

/** Les cartes de toutes les sources, une seule fois chacune. */
function merge(lists: Loaded[]): LoadedCard[] {
  const byId = new Map<string, LoadedCard>();
  for (const l of lists) for (const c of l.cards) byId.set(c.id, c);
  return [...byId.values()];
}

const keyOf = (c: { at: Date; id: string }): Key => ({ at: c.at, id: c.id });
/** `a` vient après `b` dans l'ordre du parcours par date (date décroissante, identifiant décroissant). */
const olderThan = (a: Key, b: Key) => compareByDate(a, b) > 0;

/**
 * Dernière ligne de défense, après les sources : « Mes abonnements » ne garde que ce que la personne suit, « Autour de
 * moi » que les départements proches. Un genre inconnu du Fil est écarté.
 */
function allowed(c: LoadedCard, filter: FeedFilter, ctx: FeedViewerContext, nearby: readonly string[], self: string) {
  if (!feedCardKinds.includes(c.kind)) return false;
  if (filter === "following") return c.authorId !== self && isFollowedCard(c, ctx);
  if (filter === "nearby") {
    // Un pro mobile couvre plusieurs départements (atelier et zone d'intervention) : un seul suffit.
    const area = c.areaDepartments ?? (c.department ? [c.department] : []);
    return area.some((d) => nearby.includes(d));
  }
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

/**
 * Phase 2 : jusqu'à `need` cartes plus anciennes que les clés données, par date. Une source qui a rempli sa lecture
 * (`more`) peut cacher des cartes plus anciennes que sa dernière ligne lue : on ne sert que ce qui est au moins aussi
 * récent que la plus récente de ces dernières lignes (`safe`), et on relit plus large tant que la page n'est pas pleine.
 * `next` : la clé après laquelle reprendre, ou `null` s'il ne reste rien.
 */
async function olderPage(
  base: Omit<SourceInput, "before" | "limit" | "since">,
  before: (kind: FeedCardKind) => Key[],
  keep: (c: LoadedCard) => boolean,
  need: number,
): Promise<{ page: LoadedCard[]; next: Key | null }> {
  let limit = need + 1;
  for (let attempt = 0; ; attempt++) {
    const lists = await loadAll({ ...base, since: null, limit }, before);
    const cards = merge(lists).filter(keep).sort(compareByDate);
    const open = lists.flatMap((l) => (l.more && l.tail ? [l.tail] : []));
    const safe = open.length ? ([...open].sort(compareByDate)[0] as Key) : null;
    const eligible = safe ? cards.filter((c) => !olderThan(c, safe)) : cards;
    if (eligible.length > need || !safe || attempt >= 3) {
      const page = eligible.slice(0, need);
      const last = page.at(-1);
      if (eligible.length > need && last) return { page, next: keyOf(last) };
      if (!safe) return { page, next: null };
      // Il reste des lignes non lues sous `safe` : tout ce qui est au-dessus est servi, on reprend à la dernière clé.
      return { page, next: last && !olderThan(keyOf(last), safe) ? keyOf(last) : safe };
    }
    limit *= 4;
  }
}

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
    const base = { viewer: v, userId: v.user.id, ref, filter: q.filter, ctx, nearby, until: ref } as const;
    const keep = (c: LoadedCard) => allowed(c, q.filter, ctx, nearby, v.user.id);
    const offset = cursor?.o ?? 0;

    const items: FeedCard[] = [];
    let next: Cursor | null = null;
    /** Dernières lignes lues des sources qui ont dépassé le plafond : la phase 2 reprend là. */
    let overflow: Key[] = [];
    let anchor: Key | null = null;
    let phase2 = false;

    if (!cursor || cursor.p === 1) {
      // Phase 1 : la fenêtre de 48 h, classée par score. Page = la tranche qui suit la clé du curseur, mélangée.
      const lists = await loadAll({ ...base, since: boundary, limit: WINDOW_CAP });
      overflow = lists.flatMap((l) => (l.more && l.tail ? [l.tail] : []));
      const ranked = merge(lists)
        .filter(keep)
        .map((c) => ({ ...c, score: scoreCard(c as FeedCandidate, ctx, ref) }))
        .sort(compareByScore);
      const after = cursor
        ? ranked.filter((c) => c.score < cursor.s || (c.score === cursor.s && c.id < cursor.i))
        : ranked;
      const slice = after.slice(0, FEED_PAGE);
      const shown = diversify(slice, cursor?.k ?? []);
      for (const c of shown) items.push(toCard(c, ctx));
      const last = slice.at(-1);
      if (after.length > FEED_PAGE && last) {
        next = {
          r: ref.toISOString(),
          p: 1,
          s: last.score,
          i: last.id,
          k: shown.slice(-2).map((c) => c.kind),
          o: offset + items.length,
        };
      } else phase2 = true;
    } else {
      phase2 = true;
      anchor = cursor.a && cursor.i ? { at: new Date(cursor.a), id: cursor.i } : null;
      overflow = cursor.x.map(([at, id]) => ({ at: new Date(at), id }));
    }

    // Phase 2 : tout ce que la phase 1 n'a pas servi, par date. Elle complète une première phase épuisée (même quand sa
    // dernière page est pleine : on regarde s'il reste quelque chose), ou continue son curseur.
    if (phase2) {
      const need = FEED_PAGE - items.length;
      const sinceBoundary: Key = { at: boundary, id: "" };
      const cutoffs = new Map(overflow.map((k) => [k.id.slice(0, k.id.indexOf(":")), k]));
      const before = (kind: FeedCardKind): Key[] => [...(anchor ? [anchor] : []), cutoffs.get(kind) ?? sinceBoundary];
      const { page, next: from } = await olderPage(base, before, keep, Math.max(need, 1));
      if (need > 0) {
        for (const c of page) items.push(toCard(c, ctx));
      }
      // Page de la phase 1 pleine : la phase 2 commence sans clé, si elle a quelque chose à servir.
      const key = need > 0 ? from : null;
      if (need > 0 ? from !== null : page.length > 0) {
        next = {
          r: ref.toISOString(),
          p: 2,
          ...(key ? { a: key.at.toISOString(), i: key.id } : {}),
          x: overflow.map((k) => [k.at.toISOString(), k.id] as [string, string]),
          o: offset + items.length,
        };
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
