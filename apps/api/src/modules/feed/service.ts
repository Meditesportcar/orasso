// Le Fil (lot R7e1, ARCHITECTURE-R7 § 2.4) : `GET /fil`. Les sources rendent des candidats ; ici on les note
// (`scoreCard`), on les mélange (`diversify`) et on pagine.
//
// Un parcours est stable du début à la fin : le curseur (`cursor.ts`) fige à la première page l'instant `ref`, les
// genres « Moins de ce genre », une empreinte du contexte de la personne et, pour chaque source qui dépasse `WINDOW_CAP`
// candidats, la borne de coupure (`x`). Si l'empreinte change (nouvel abonnement…), l'API repart de la première page et
// répond `reset: true`.
// - Phase 1 : les cartes des 48 h avant `ref` (au plus `WINDOW_CAP` par source), classées par (score décroissant,
//   identifiant). La page se choisit parmi `FEED_POOL` cartes (les « différées » des pages précédentes, 20 au plus, puis
//   les suivantes du classement après la frontière), mélangées par `diversify` : les 20 premières sont servies, les
//   autres sont différées au curseur. Une carte d'un genre qui domine n'est donc pas coupée avant le mélange.
// - Phase 2 : tout le reste, par (date décroissante, identifiant). Le curseur porte la dernière clé (`anchor`), posée
//   dans le SQL de chaque source avant son LIMIT. Une source qui a dépassé le plafond reprend là où la première page
//   l'a coupée (`x`) : ce qui est au-delà de la borne y passe, même si des cartes ont disparu entre-temps.
// Aucun doublon ni trou, même si une carte est retirée entre deux pages ; jamais de page vide avec une suite.

import { createHash } from "node:crypto";
import {
  compareByDate,
  compareByScore,
  diversify,
  FEED_PAGE,
  FEED_POOL,
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
import { rateLimit } from "../../lib/rateLimit";
import type { Viewer } from "../../lib/session";
import { type Cursor, decodeCursor, encodeCursor, MAX_OFFSET } from "./cursor";
import { rankedSources } from "./sources";
import { sponsoredPicker } from "./sources/sponsored";
import type { FeedSource, Key, LoadedCard, SourceInput } from "./sources/types";

/** Plafond de sécurité par source pour la fenêtre classée (phase 1) ; ce qui dépasse passe en phase 2. */
export const WINDOW_CAP = 300;

/**
 * Empreinte (6 octets, hexadécimal) de ce qui change le classement ou ce que les sources laissent entrer : abonnements,
 * crews, centres d'intérêt, départements. « Moins de ce genre » n'en fait pas partie : il est figé dans le curseur.
 */
export function contextFingerprint(ctx: FeedViewerContext): string {
  const list = (it: Iterable<string>) => [...it].sort();
  const json = JSON.stringify([
    list(ctx.departments),
    list(ctx.followedUsers),
    list(ctx.followedStructures),
    list(ctx.followedPros),
    list(ctx.crewmates),
    list(ctx.interests),
  ]);
  return createHash("sha1").update(json).digest().subarray(0, 6).toString("hex");
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
  input: Omit<SourceInput, "before" | "floor">,
  before: (kind: FeedCardKind) => Key[] = () => [],
  floor: (kind: FeedCardKind) => Key | null = () => null,
): Promise<Loaded[]> {
  return Promise.all(
    rankedSources.map(async (source) => ({
      source,
      ...(await source.load({ ...input, before: before(source.kind), floor: floor(source.kind) })),
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

/** Tours de lecture au plus pour remplir une page de la phase 2 (garde-fou : chaque tour avance strictement). */
const MAX_ROUNDS = 50;

/**
 * Une lecture de la phase 2 : jusqu'à `need` cartes plus anciennes que les clés données, par date. Une source qui a
 * rempli sa lecture (`more`) peut cacher des cartes plus anciennes que sa dernière ligne lue : on ne sert que ce qui est
 * au moins aussi récent que la plus récente de ces dernières lignes (`safe`), et on relit plus large tant que la page
 * n'est pas pleine. `next` : la clé après laquelle reprendre, ou `null` s'il ne reste rien.
 */
async function olderRound(
  base: Omit<SourceInput, "before" | "limit" | "since" | "floor">,
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
      return { page, next: last ? keyOf(last) : safe };
    }
    limit *= 4;
  }
}

/**
 * Phase 2 : `need` cartes plus anciennes que les clés données, par date. Elle continue à lire jusqu'à remplir la page ou
 * épuiser le Fil : jamais de page vide (ni incomplète sans fin) avec une suite.
 */
async function olderPage(
  base: Omit<SourceInput, "before" | "limit" | "since" | "floor">,
  before: (kind: FeedCardKind) => Key[],
  keep: (c: LoadedCard) => boolean,
  need: number,
): Promise<{ page: LoadedCard[]; next: Key | null }> {
  const page: LoadedCard[] = [];
  let from: Key | null = null;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const start = from;
    const r = await olderRound(base, (kind) => [...before(kind), ...(start ? [start] : [])], keep, need - page.length);
    page.push(...r.page);
    if (!r.next) return { page, next: null };
    if (page.length >= need) return { page, next: r.next };
    from = r.next;
  }
  // Garde-fou (des dizaines de milliers de lignes écartées d'affilée) : on s'arrête là, la suite reprend à `from`.
  return { page, next: page.length ? from : null };
}

const kindOfId = (id: string) => id.slice(0, id.indexOf(":"));

export const feedService = {
  async feed(v: Viewer, q: { filter: FeedFilter; cursor?: string | undefined }): Promise<FeedPage> {
    rateLimit("feedRead", v.user.id);
    const t = now();
    const viewerCtx = await viewerContext(v);
    const fp = contextFingerprint(viewerCtx);
    let cursor = decodeCursor(q.cursor);
    // Le contexte a changé en plein parcours (nouvel abonnement, nouveau département…) : le parcours repart de la
    // première page, et le client remplace sa liste (`reset`).
    const reset = cursor !== null && cursor.fp !== fp;
    if (reset) cursor = null;
    // « Moins de ce genre » : lu à la première page, figé dans le curseur pour tout le parcours.
    const less = cursor ? cursor.less : new Set(feedCardKinds.filter((k) => viewerCtx.lessKinds.has(k)));
    const ctx: FeedViewerContext = { ...viewerCtx, lessKinds: less };
    const refMs = cursor ? Math.min(cursor.ref.getTime(), t.getTime()) : t.getTime();
    const ref = new Date(refMs);
    const boundary = new Date(refMs - FEED_SCORE_WINDOW_MS);
    const nearby = nearbyDepartments(ctx.departments);
    const base = { viewer: v, userId: v.user.id, ref, filter: q.filter, ctx, nearby, until: ref } as const;
    const keep = (c: LoadedCard) => allowed(c, q.filter, ctx, nearby, v.user.id);
    const offset = cursor?.offset ?? 0;
    const phase1 = cursor?.phase === 1 ? cursor : null;

    const items: FeedCard[] = [];
    let next: Cursor | null = null;
    /** Dernières lignes lues des sources qui ont dépassé le plafond (première page) : la phase 2 reprend là. */
    let x: Key[] = cursor?.x ?? [];
    const anchor: Key | null = cursor?.phase === 2 ? cursor.anchor : null;
    let phase2 = false;
    const head = () => ({ ref, fp, less, offset: offset + items.length, x });

    if (!cursor || phase1) {
      // Phase 1 : la fenêtre de 48 h, classée par score. Les sources qui dépassaient le plafond à la première page
      // restent bornées à la même clé (`floor`) : une carte retirée n'en fait pas entrer une autre.
      const floors = new Map(x.map((k) => [kindOfId(k.id), k]));
      const lists = await loadAll(
        { ...base, since: boundary, limit: WINDOW_CAP },
        undefined,
        (k) => floors.get(k) ?? null,
      );
      if (!cursor) x = lists.flatMap((l) => (l.more && l.tail ? [l.tail] : []));
      const ranked = merge(lists)
        .filter(keep)
        .map((c) => ({ ...c, score: scoreCard(c as FeedCandidate, ctx, ref) }))
        .sort(compareByScore);
      // Les cartes après la frontière (la dernière consommée), puis celles qui ont été vues sans être servies.
      const rest = phase1
        ? ranked.filter((c) => c.score < phase1.score || (c.score === phase1.score && c.id < phase1.frontier))
        : ranked;
      const restIds = new Set(rest.map((c) => c.id));
      const deferredIds = new Set(phase1?.deferred ?? []);
      const carried = ranked.filter((c) => deferredIds.has(c.id) && !restIds.has(c.id));
      const fresh = rest.slice(0, FEED_POOL - carried.length);
      // Le mélange se fait pendant la sélection : la page prend les 20 premières du mélange, les autres sont différées.
      const ordered = diversify([...carried, ...fresh], phase1?.kinds ?? []);
      const shown = ordered.slice(0, FEED_PAGE);
      const deferred = ordered.slice(FEED_PAGE);
      for (const c of shown) items.push(toCard(c, ctx));
      const edge = fresh.at(-1) ?? (phase1 ? { score: phase1.score, id: phase1.frontier } : null);
      if (edge && (deferred.length > 0 || rest.length > fresh.length)) {
        next = {
          ...head(),
          phase: 1,
          score: edge.score,
          frontier: edge.id,
          kinds: [...(phase1?.kinds ?? []), ...shown.map((c) => c.kind)].slice(-2),
          deferred: deferred.map((c) => c.id),
        };
      } else phase2 = true;
    } else phase2 = true;

    // Phase 2 : tout ce que la phase 1 n'a pas servi, par date. Elle complète une première phase épuisée (même quand sa
    // dernière page est pleine : on regarde s'il reste quelque chose), ou continue son curseur.
    if (phase2) {
      const need = FEED_PAGE - items.length;
      const sinceBoundary: Key = { at: boundary, id: "" };
      const cutoffs = new Map(x.map((k) => [kindOfId(k.id), k]));
      const before = (kind: FeedCardKind): Key[] => [...(anchor ? [anchor] : []), cutoffs.get(kind) ?? sinceBoundary];
      const { page, next: from } = await olderPage(base, before, keep, Math.max(need, 1));
      if (need > 0) {
        for (const c of page) items.push(toCard(c, ctx));
      }
      // Page de la phase 1 pleine : la phase 2 commence sans clé, si elle a quelque chose à servir.
      const key = need > 0 ? from : null;
      if (need > 0 ? from !== null : page.length > 0) next = { ...head(), phase: 2, anchor: key };
    }

    // Sponsorisé (lot R7k1) : pas dans « Mes abonnements » (la liste ne contient que ce que la personne suit) ni si elle a
    // choisi « Moins de ce genre ». `offset` compte les cartes **servies** (Sponsorisé compris) : les positions restent
    // celles du Fil entier, d'une page à l'autre.
    const wantsSponsored = q.filter !== "following" && !less.has("sponsored");
    const out = insertSponsored(items, wantsSponsored ? await sponsoredPicker(v) : null, offset);
    // Au-delà de la borne, `decodeCursor` refuserait le curseur suivant : la liste se termine plutôt que de le fabriquer.
    if (next) next = offset + out.length > MAX_OFFSET ? null : { ...next, offset: offset + out.length };
    return {
      items: out,
      nextCursor: next ? encodeCursor(next) : null,
      filter: q.filter,
      ...(reset ? { reset: true as const } : {}),
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
