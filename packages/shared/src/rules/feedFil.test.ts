// Lot R8c1 : popularité, « ma sortie », raison, schémas des cartes vues, « Tu es à jour », rail et file des cartes vues.
import { describe, expect, it } from "vitest";

import { feedMyOutingLabel, feedReasonLabel } from "../labels/feed.fr";
import type { FeedCard } from "../schemas/feed";
import { feedFreshQuery, feedSeenSchema } from "../schemas/feedSeen";
import {
  emptyFeedViewerContext,
  FEED_MY_OUTING_BOOST,
  FEED_POPULARITY_FULL,
  type FeedCandidate,
  type FeedViewerContext,
  isMyOutingCard,
  popularityFactor,
  reasonCode,
  scoreCard,
} from "./feed";
import { applyFeedPage, caughtUpIndex, emptyFeedList, publishedCard, seenBatch } from "./feedList";

const NOW = new Date("2026-11-09T12:00:00Z");
const HOUR = 3_600_000;
const ago = (h: number) => new Date(NOW.getTime() - h * HOUR);

describe("popularité et ma sortie (R8c1)", () => {
  it("popularityFactor : 1 sans flamme, 1,5 à 20 flammes et plus, progressif, aux bornes", () => {
    expect(popularityFactor(0)).toBe(1);
    expect(popularityFactor(-4)).toBe(1);
    expect(popularityFactor(Number.NaN)).toBe(1);
    expect(popularityFactor(10)).toBeCloseTo(1.25, 10);
    expect(popularityFactor(FEED_POPULARITY_FULL)).toBe(1.5);
    expect(popularityFactor(21)).toBe(1.5);
    expect(popularityFactor(10_000)).toBe(1.5);
    expect(popularityFactor(3)).toBeCloseTo(1.075, 10);
  });

  const base: FeedCandidate = {
    id: "feed_post:a",
    kind: "feed_post",
    at: NOW,
    department: "66",
    authorId: null,
    structureId: null,
    proId: null,
    categoryIds: [],
  };
  const withOuting = (id: string, startsAt: Date): FeedViewerContext => ({
    ...emptyFeedViewerContext(),
    departments: ["66"],
    myOutings: new Map([[id, startsAt]]),
  });

  it("scoreCard : × popularité × 2 pour une carte de ma sortie (jamais l'événement recommandé)", () => {
    const ctx = withOuting("e1", ago(-48));
    const plain = scoreCard(base, ctx, NOW);
    expect(scoreCard({ ...base, flames7d: 20 }, ctx, NOW)).toBeCloseTo(plain * 1.5, 10);
    expect(scoreCard({ ...base, eventId: "e1" }, ctx, NOW)).toBeCloseTo(plain * FEED_MY_OUTING_BOOST, 10);
    expect(scoreCard({ ...base, eventId: "e1", flames7d: 20 }, ctx, NOW)).toBeCloseTo(plain * 3, 10);
    expect(scoreCard({ ...base, eventId: "autre" }, ctx, NOW)).toBeCloseTo(plain, 10);
    const rec = { ...base, id: "event_recommended:a", kind: "event_recommended" as const, eventId: "e1" };
    expect(isMyOutingCard(rec, ctx)).toBe(false);
    expect(scoreCard(rec, ctx, NOW)).toBeCloseTo(plain, 10);
  });

  it("reasonCode : my_outing après from_orasso et your_memory, avant les liens", () => {
    const ctx = { ...withOuting("e1", ago(-48)), followedUsers: new Set(["u1"]) };
    const card = { ...base, eventId: "e1", authorId: "u1" };
    expect(reasonCode(card, ctx)).toBe("my_outing");
    expect(reasonCode(card, ctx, true)).toBe("from_orasso");
    expect(reasonCode({ ...card, kind: "memory", id: "memory:e1" }, ctx)).toBe("your_memory");
    expect(reasonCode({ ...card, eventId: null }, ctx)).toBe("following_author");
  });

  it("« Pour ta sortie de samedi » : le jour du début, à Paris ; au-delà d'une semaine, la date", () => {
    // Le samedi 14 novembre 2026 ; 23 h 30 UTC le vendredi = samedi 0 h 30 à Paris (UTC+1).
    const sat = new Date("2026-11-13T23:30:00Z");
    expect(feedMyOutingLabel(sat, NOW)).toBe("Pour ta sortie de samedi");
    expect(feedMyOutingLabel(new Date("2026-11-14T10:00:00Z"), NOW)).toBe("Pour ta sortie de samedi");
    expect(feedMyOutingLabel(new Date("2026-11-21T10:00:00Z"), NOW)).toBe("Pour ta sortie du 21 novembre");
    // Une sortie déjà commencée dit le jour où elle a commencé.
    expect(feedMyOutingLabel(new Date("2026-11-09T08:00:00Z"), NOW)).toBe("Pour ta sortie de lundi");
    expect(feedReasonLabel("my_outing", null, { startsAt: sat, now: NOW })).toBe("Pour ta sortie de samedi");
    expect(feedReasonLabel("my_outing")).toBe("Pour ta sortie");
  });
});

describe("schémas des cartes vues (R8c1)", () => {
  const id = "feed_post:3f2b8c1e-5a47-4d0e-9b6a-1c2d3e4f5a6b";
  const many = (n: number) => Array.from({ length: n }, () => ({ id, action: "share" }));

  it("POST /me/fil/seen : 1 à 50 cartes, jamais « sponsored » ; l'identifiant passe en minuscules", () => {
    expect(feedSeenSchema.safeParse({ cards: [{ id, action: "view" }] }).success).toBe(true);
    const upper = `feed_post:${id.slice("feed_post:".length).toUpperCase()}`;
    expect(feedSeenSchema.parse({ cards: [{ id: upper, action: "open" }] }).cards[0]?.id).toBe(id);
    expect(feedSeenSchema.safeParse({ cards: [] }).success).toBe(false);
    expect(feedSeenSchema.safeParse({ cards: many(50) }).success).toBe(true);
    expect(feedSeenSchema.safeParse({ cards: many(51) }).success).toBe(false);
    expect(
      feedSeenSchema.safeParse({ cards: [{ id: id.replace("feed_post", "sponsored"), action: "view" }] }).success,
    ).toBe(false);
    expect(feedSeenSchema.safeParse({ cards: [{ id, action: "like" }] }).success).toBe(false);
    expect(feedSeenSchema.safeParse({ cards: [{ id, action: "view", at: "2026-11-11T10:00:00Z" }] }).success).toBe(
      true,
    );
    expect(feedSeenSchema.safeParse({ cards: [{ id, action: "view", at: "hier" }] }).success).toBe(false);
  });

  it("GET /fil/fresh : `since` est une date ISO", () => {
    expect(feedFreshQuery.safeParse({ since: "2026-11-11T10:00:00.000Z" }).data?.filter).toBe("for_you");
    expect(feedFreshQuery.safeParse({ filter: "following", since: "demain" }).success).toBe(false);
    expect(feedFreshQuery.safeParse({ filter: "following" }).success).toBe(false);
  });
});

const card = (id: string, seen = false) =>
  ({
    id,
    kind: "feed_post",
    reason: { code: "new_here", label: "" },
    at: "2026-11-11T10:00:00Z",
    payload: {},
    seen,
  }) as unknown as FeedCard;

describe("« Tu es à jour », rail et file des cartes vues (R8c1)", () => {
  it("caughtUpIndex : la première carte vue ; 0 si tout est vu ; -1 si rien", () => {
    expect(caughtUpIndex([])).toBe(-1);
    expect(caughtUpIndex([card("a"), card("b")])).toBe(-1);
    expect(caughtUpIndex([card("a"), card("b", true), card("c", true)])).toBe(1);
    expect(caughtUpIndex([card("a", true), card("b", true)])).toBe(0);
  });

  it("applyFeedPage garde le rail et l'instant du parcours : remplacés à la première page ou au reset, conservés ensuite", () => {
    const hot = [card("h1")] as unknown as FeedCard<"feed_post">[];
    const first = applyFeedPage(
      emptyFeedList("following"),
      { items: [card("a")], nextCursor: "c1", filter: "following", hot, ref: "2026-11-11T10:00:00Z" },
      null,
    );
    expect(first?.state.hot).toEqual(hot);
    expect(first?.state.ref).toBe("2026-11-11T10:00:00Z");
    const second = applyFeedPage(
      first?.state as NonNullable<typeof first>["state"],
      { items: [card("b")], nextCursor: null, filter: "following", ref: "2026-11-11T10:00:00Z" },
      "c1",
    );
    expect(second?.state.hot).toEqual(hot);
    expect(second?.state.ref).toBe("2026-11-11T10:00:00Z");
    expect(second?.state.items.map((c) => c.id)).toEqual(["a", "b"]);
    // Un reset remplace tout (rail compris), et un onglet sans rail le vide.
    const reset = applyFeedPage(
      second?.state as NonNullable<typeof second>["state"],
      { items: [card("z")], nextCursor: null, filter: "following", reset: true, ref: "2026-11-11T11:00:00Z" },
      "c2",
    );
    expect(reset?.state.hot).toEqual([]);
    expect(reset?.state.ref).toBe("2026-11-11T11:00:00Z");
    expect(reset?.scrollTop).toBe(true);
    // Un filtre qui n'est pas celui de la liste est ignoré.
    expect(
      applyFeedPage(emptyFeedList("nearby"), { items: [], nextCursor: null, filter: "following" }, null),
    ).toBeNull();
  });

  it("seenBatch : sans doublon (action la plus forte, heure la plus ancienne), sans « sponsored », 200 au plus, 50 par envoi", () => {
    const u = (n: number) => `feed_post:00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    const out = seenBatch([
      { id: u(1), action: "view", at: "2026-11-11T10:05:00Z" },
      { id: u(1), action: "open", at: "2026-11-11T10:09:00Z" },
      { id: u(1), action: "view", at: "2026-11-11T10:01:00Z" },
      { id: "sponsored:abc:4", action: "view" },
      { id: u(2), action: "view" },
    ]);
    expect(out.send).toEqual([
      { id: u(1), action: "open", at: "2026-11-11T10:01:00Z" },
      { id: u(2), action: "view" },
    ]);
    expect(out.rest).toEqual([]);
    const big = seenBatch(Array.from({ length: 260 }, (_, i) => ({ id: u(i), action: "view" as const })));
    expect(big.send.length).toBe(50);
    expect(big.send.length + big.rest.length).toBe(200);
    // Les 200 plus récentes sont gardées.
    expect(big.send[0]?.id).toBe(u(60));
    expect(big.rest.at(-1)?.id).toBe(u(259));
    expect(seenBatch([])).toEqual({ send: [], rest: [] });
  });

  it("publishedCard porte seen: false (ma carte neuve n'est pas « déjà vue »)", () => {
    const c = publishedCard({ id: "p1", createdAt: "2026-11-11T10:00:00Z" } as never);
    expect(c.seen).toBe(false);
  });
});
