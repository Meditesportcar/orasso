import { describe, expect, it } from "vitest";

import { feedLabels, feedReasonLabel } from "../labels/feed.fr";
import { feedMineQuery, feedPostCreateSchema, feedQuery, feedReportSchema } from "../schemas/feed";
import { canSeeFeedPost } from "./audience";
import {
  aspectMatches,
  compareByScore,
  DEFAULT_FEED_ASPECT,
  diversify,
  emptyFeedViewerContext,
  FEED_PAGE,
  FEED_POST_PHOTOS_MAX,
  type FeedCandidate,
  type FeedCardKind,
  type FeedViewerContext,
  freshness,
  insertSponsored,
  isFollowedCard,
  isReservedPseudo,
  nearbyDepartments,
  proximityFactor,
  reasonCode,
  scoreCard,
} from "./feed";

const NOW = new Date("2026-11-09T12:00:00Z");
const HOUR = 3_600_000;
const ago = (h: number) => new Date(NOW.getTime() - h * HOUR);

const card = (over: Partial<FeedCandidate> = {}): FeedCandidate => ({
  id: "c1",
  kind: "feed_post",
  at: NOW,
  department: "66",
  authorId: null,
  structureId: null,
  proId: null,
  categoryIds: [],
  ...over,
});
const ctx = (over: Partial<FeedViewerContext> = {}): FeedViewerContext => ({
  ...emptyFeedViewerContext(),
  departments: ["66"],
  ...over,
});

describe("fraîcheur (demi-vie 36 h)", () => {
  it("1 à la publication, 0,5 après 36 h, 0,25 après 72 h ; le futur compte comme neuf", () => {
    expect(freshness(NOW, NOW)).toBe(1);
    expect(freshness(ago(36), NOW)).toBeCloseTo(0.5, 10);
    expect(freshness(ago(72), NOW)).toBeCloseTo(0.25, 10);
    expect(freshness(new Date(NOW.getTime() + HOUR), NOW)).toBe(1);
  });
});

describe("proximité", () => {
  it("même département 1, même région 0,7, ailleurs 0,3", () => {
    expect(proximityFactor("66", ["66"])).toBe(1);
    expect(proximityFactor("34", ["66"])).toBe(0.7); // Occitanie
    expect(proximityFactor("75", ["66"])).toBe(0.3);
  });
  it("neutre (0,7) quand on ne sait pas d'où vient la carte ou la personne", () => {
    expect(proximityFactor(null, ["66"])).toBe(0.7);
    expect(proximityFactor("66", [])).toBe(0.7);
  });
  it("les départements voisins : le sien et ceux à 80 km ou moins, pas Paris", () => {
    const near = nearbyDepartments(["66"]);
    expect(near).toContain("66");
    expect(near).toContain("11");
    expect(near).not.toContain("75");
    expect(nearbyDepartments([])).toEqual([]);
  });
});

describe("score = fraîcheur × proximité × affinité × « moins de ce genre »", () => {
  it("auteur suivi 1,5 ; crew commun 1,3 ; intérêt commun 1,2 ; sinon 1", () => {
    const base = scoreCard(card({ authorId: "a" }), ctx(), NOW);
    expect(base).toBe(1);
    expect(scoreCard(card({ authorId: "a" }), ctx({ followedUsers: new Set(["a"]) }), NOW)).toBeCloseTo(1.5, 10);
    expect(scoreCard(card({ authorId: "a" }), ctx({ crewmates: new Set(["a"]) }), NOW)).toBeCloseTo(1.3, 10);
    expect(scoreCard(card({ categoryIds: ["x"] }), ctx({ interests: new Set(["x"]) }), NOW)).toBeCloseTo(1.2, 10);
  });
  it("la plus forte affinité s'applique, elles ne se multiplient pas", () => {
    const c = card({ authorId: "a", categoryIds: ["x"] });
    const x = ctx({ followedUsers: new Set(["a"]), crewmates: new Set(["a"]), interests: new Set(["x"]) });
    expect(scoreCard(c, x, NOW)).toBeCloseTo(1.5, 10);
  });
  it("structure ou pro suivi comptent comme un auteur suivi", () => {
    expect(isFollowedCard(card({ structureId: "s" }), ctx({ followedStructures: new Set(["s"]) }))).toBe(true);
    expect(isFollowedCard(card({ proId: "p" }), ctx({ followedPros: new Set(["p"]) }))).toBe(true);
    expect(isFollowedCard(card({ authorId: "z" }), ctx())).toBe(false);
  });
  it("produit des quatre coefficients", () => {
    const c = card({ at: ago(36), department: "34", authorId: "a", kind: "pro" });
    const x = ctx({ followedUsers: new Set(["a"]), lessKinds: new Set(["pro"]) });
    expect(scoreCard(c, x, NOW)).toBeCloseTo(0.5 * 0.7 * 1.5 * 0.3, 10);
  });
});

describe("raison affichée", () => {
  it("lien direct avant les goûts, les goûts avant la proximité, puis le genre", () => {
    const x = ctx({ followedUsers: new Set(["a"]), interests: new Set(["x"]) });
    expect(reasonCode(card({ authorId: "a", categoryIds: ["x"] }), x)).toBe("following_author");
    expect(reasonCode(card({ categoryIds: ["x"] }), x)).toBe("your_styles");
    expect(reasonCode(card({ department: "66" }), ctx())).toBe("near_you");
    expect(reasonCode(card({ department: "75", kind: "event_recommended" }), ctx())).toBe("recommended_event");
    expect(reasonCode(card({ department: "75", kind: "lineup" }), ctx())).toBe("lineup_today");
    expect(reasonCode(card({ authorId: "a" }), ctx(), true)).toBe("from_orasso");
  });
  it("libellés de la maquette", () => {
    expect(feedReasonLabel("near_you")).toBe("Autour de toi");
    expect(feedReasonLabel("following_author", "Kenji_66")).toBe("Tu suis Kenji_66");
    expect(feedReasonLabel("your_styles")).toBe("Dans tes styles");
    expect(feedReasonLabel("recommended_event")).toBe("Événement recommandé");
    expect(feedReasonLabel("following_structure")).toBe("Nouveauté d'un abonnement");
  });
});

describe("diversité", () => {
  const mk = (id: string, kind: FeedCardKind, score: number, h = 0) => ({ id, kind, score, at: ago(h) });
  it("deux cartes de suite du même genre valent 0,6 : un genre moins bon passe devant s'il est à plus de 0,6", () => {
    // a1 (1,0) puis a2 (0,9 × 0,6 = 0,54) contre b1 (0,6) : b1 passe devant a2.
    const out = diversify([mk("a1", "pro", 1), mk("a2", "pro", 0.9), mk("b1", "lineup", 0.6)]);
    expect(out.map((c) => c.id)).toEqual(["a1", "b1", "a2"]);
  });
  it("un genre largement meilleur reste devant (0,6 ne l'enterre pas)", () => {
    const out = diversify([mk("a1", "pro", 1), mk("a2", "pro", 0.95), mk("b1", "lineup", 0.3)]);
    expect(out.map((c) => c.id)).toEqual(["a1", "a2", "b1"]);
  });
  it("jamais trois cartes de suite du même genre tant qu'il reste autre chose", () => {
    const list = [
      ...Array.from({ length: 8 }, (_, i) => mk(`p${i}`, "feed_post", 1 - i * 0.01)),
      ...Array.from({ length: 3 }, (_, i) => mk(`e${i}`, "event_recommended", 0.1 - i * 0.01)),
    ];
    const out = diversify(list);
    expect(out).toHaveLength(11);
    for (let i = 2; i < out.length; i++) {
      const [a, b, c] = [out[i - 2], out[i - 1], out[i]];
      const rest = out.slice(i + 1).some((x) => x.kind !== c?.kind);
      // Trois de suite seulement s'il ne restait que ce genre-là à placer.
      if (a?.kind === b?.kind && b?.kind === c?.kind) expect(rest).toBe(false);
    }
    expect(out.slice(0, 3).map((c) => c.kind)).not.toEqual(["feed_post", "feed_post", "feed_post"]);
  });
  it("ordre stable à égalité (score, puis date récente, puis identifiant)", () => {
    const a = diversify([mk("b", "pro", 1, 2), mk("a", "lineup", 1, 1), mk("c", "feed_post", 1, 1)]);
    expect(a.map((c) => c.id)).toEqual(["c", "a", "b"]);
    expect(diversify([])).toEqual([]);
  });
  it("les deux genres de la page précédente comptent : jamais trois de suite d'une page à l'autre", () => {
    const list = [mk("p1", "feed_post", 1), mk("p2", "feed_post", 0.9), mk("e1", "event_recommended", 0.2)];
    // la page d'avant finissait par deux publications : l'événement passe en premier malgré son score
    expect(diversify(list, ["feed_post", "feed_post"]).map((c) => c.id)).toEqual(["e1", "p1", "p2"]);
    // sans genre précédent identique, l'ordre ne change pas
    expect(diversify(list, ["pro", "lineup"]).map((c) => c.id)).toEqual(["p1", "p2", "e1"]);
    expect(diversify(list, []).map((c) => c.id)).toEqual(["p1", "p2", "e1"]);
  });
  it("clé du parcours classé : score décroissant, puis identifiant décroissant (total et stable)", () => {
    const rows = [
      { id: "a", score: 1 },
      { id: "c", score: 1 },
      { id: "b", score: 2 },
    ];
    expect([...rows].sort(compareByScore).map((r) => r.id)).toEqual(["b", "c", "a"]);
    expect(compareByScore({ id: "a", score: 1 }, { id: "a", score: 1 })).toBe(0);
  });
  it("garde toutes les cartes, sans doublon", () => {
    const list = Array.from({ length: 40 }, (_, i) => mk(`k${i}`, i % 3 === 0 ? "pro" : "feed_post", Math.random()));
    const out = diversify(list);
    expect(new Set(out.map((c) => c.id)).size).toBe(40);
  });
});

describe("pseudos réservés", () => {
  it("contenir « orasso » (ou « 0rasso »), sans tenir compte de la casse, des accents ni des séparateurs", () => {
    for (const bad of [
      "Orasso",
      "ORASSO",
      "orasso_66",
      "Le.Orasso",
      "0rasso",
      "Mon_0RASSO",
      "o.r.a.s.s.o",
      "Équipe_Orasso",
      "orassó",
    ]) {
      expect(isReservedPseudo(bad), bad).toBe(true);
    }
  });
  it("un pseudo ordinaire passe", () => {
    for (const ok of ["Kenji_66", "Damien_66", "Rasso_Fan", "Orage", "Oras", "Passion.Auto"]) {
      expect(isReservedPseudo(ok), ok).toBe(false);
    }
  });
});

describe("Sponsorisé (point d'insertion)", () => {
  const items = Array.from({ length: 20 }, (_, i) => `c${i + 1}`);
  it("sans picker, rien ne change", () => {
    expect(insertSponsored(items, null)).toEqual(items);
  });
  it("positions 4, 10, 16 (jamais dans les 3 premières)", () => {
    const out = insertSponsored(items, (p) => `S${p}`);
    expect(out.indexOf("S4")).toBe(3);
    expect(out.indexOf("S10")).toBe(9);
    expect(out.indexOf("S16")).toBe(15);
    expect(out.slice(0, 3)).toEqual(["c1", "c2", "c3"]);
  });
  it("un picker qui ne rend rien laisse la place vide ; une liste trop courte n'en reçoit pas", () => {
    expect(insertSponsored(items, () => null)).toEqual(items);
    expect(insertSponsored(["a", "b"], (p) => `S${p}`)).toEqual(["a", "b"]);
  });
  it("les positions sont celles du Fil entier : page 2 décalée de 20", () => {
    const page2 = Array.from({ length: 20 }, (_, i) => `d${i + 1}`);
    const out = insertSponsored(page2, (p) => `S${p}`, 20);
    // Positions absolues 22, 28, 34 → index 1, 7, 13 de la page.
    expect(out.indexOf("S22")).toBe(1);
    expect(out.indexOf("S28")).toBe(7);
  });
  it("un décalage énorme (curseur forgé) ne boucle pas et rend le même résultat que la boucle simple", () => {
    const t0 = Date.now();
    const calls: number[] = [];
    insertSponsored(
      ["x", "y"],
      (p) => {
        calls.push(p);
        return `S${p}`;
      },
      4_294_967_295,
    );
    expect(Date.now() - t0).toBeLessThan(50);
    expect(calls.every((p) => p > 4_294_967_295)).toBe(true);
    // Équivalence avec le calcul « position par position » pour des décalages ordinaires.
    for (const offset of [0, 1, 2, 3, 4, 5, 9, 10, 11, 21, 22, 23]) {
      const page = Array.from({ length: 20 }, (_, i) => `d${i + 1}`);
      const expected = [...page];
      for (let position = 4; position <= offset + expected.length + 1; position += 6) {
        const index = position - 1 - offset;
        if (index < 0 || index > expected.length) continue;
        expected.splice(index, 0, `S${position}`);
      }
      expect(insertSponsored(page, (p) => `S${p}`, offset)).toEqual(expected);
    }
  });
});

describe("visibilité d'une publication", () => {
  const post = (over = {}) => ({
    authorId: "a",
    authorVisibility: "public" as const,
    authorUnavailable: false,
    deleted: false,
    ...over,
  });
  it("jamais sans session", () => {
    expect(canSeeFeedPost(null, post(), { followAccepted: true })).toBe(false);
  });
  it("compte public : tout membre ; compte privé : abonnés acceptés et soi", () => {
    expect(canSeeFeedPost({ userId: "u" }, post(), { followAccepted: false })).toBe(true);
    const priv = post({ authorVisibility: "private" });
    expect(canSeeFeedPost({ userId: "u" }, priv, { followAccepted: false })).toBe(false);
    expect(canSeeFeedPost({ userId: "u" }, priv, { followAccepted: true })).toBe(true);
    expect(canSeeFeedPost({ userId: "a" }, priv, { followAccepted: false })).toBe(true);
  });
  it("auteur suspendu, banni ou supprimé, ou publication retirée : invisible (sauf à soi pour l'auteur)", () => {
    expect(canSeeFeedPost({ userId: "u" }, post({ authorUnavailable: true }), { followAccepted: true })).toBe(false);
    expect(canSeeFeedPost({ userId: "u" }, post({ deleted: true }), { followAccepted: true })).toBe(false);
    expect(canSeeFeedPost({ userId: "a" }, post({ deleted: true }), { followAccepted: true })).toBe(false);
  });
});

describe("formats des publications", () => {
  it("4:5 par défaut, 0,8 ± 2 %", () => {
    expect(DEFAULT_FEED_ASPECT).toBe("portrait_4_5");
    expect(aspectMatches("portrait_4_5", 1080, 1350)).toBe(true);
    expect(aspectMatches("portrait_4_5", 1080 * 1.019, 1350)).toBe(true);
    expect(aspectMatches("portrait_4_5", 1080 * 1.03, 1350)).toBe(false);
    expect(aspectMatches("portrait_4_5", 1080, 1080)).toBe(false);
  });
  it("1:1 et paysage 1,25", () => {
    expect(aspectMatches("square", 1080, 1080)).toBe(true);
    expect(aspectMatches("square", 1080, 1350)).toBe(false);
    expect(aspectMatches("landscape", 1350, 1080)).toBe(true);
    expect(aspectMatches("landscape", 1080, 1080)).toBe(false);
  });
  it("dimensions nulles ou négatives : refusées", () => {
    expect(aspectMatches("square", 0, 0)).toBe(false);
    expect(aspectMatches("square", -1, -1)).toBe(false);
  });
});

describe("schémas", () => {
  const key = "private/feed-posts/0b0c3a5e-6a47-4f0c-9c1e-2a1d1c0b0a01.webp";
  it("une publication : 1 à 6 photos, 500 caractères, 4:5 par défaut", () => {
    const ok = feedPostCreateSchema.parse({ photos: [{ uploadKey: key, noPlateConfirmed: true }] });
    expect(ok.aspect).toBe("portrait_4_5");
    expect(ok.caption).toBeNull();
    // Vague R8 (T1) : « au moins une photo, sinon rattachée à un événement qui a une affiche » est une règle de l'API
    // (400 `photo_required`, elle connaît l'événement) ; le schéma laisse passer la liste vide.
    expect(feedPostCreateSchema.safeParse({ photos: [] }).success).toBe(true);
    const six = Array.from({ length: FEED_POST_PHOTOS_MAX + 1 }, (_, i) => ({
      uploadKey: `private/feed-posts/0b0c3a5e-6a47-4f0c-9c1e-2a1d1c0b0a0${i}.webp`,
    }));
    expect(feedPostCreateSchema.safeParse({ photos: six }).success).toBe(false);
    // 500 pour un passionné (refusé par l'API), 2 000 pour une casquette : le schéma borne à 2 000.
    expect(feedPostCreateSchema.safeParse({ photos: [{ uploadKey: key }], caption: "x".repeat(2001) }).success).toBe(
      false,
    );
    expect(feedPostCreateSchema.safeParse({ photos: [{ uploadKey: key }, { uploadKey: key }] }).success).toBe(false);
  });
  it("une clé qui n'est pas un envoi du Fil est refusée", () => {
    expect(feedPostCreateSchema.safeParse({ photos: [{ uploadKey: "vehicles/x/y.webp" }] }).success).toBe(false);
    expect(feedPostCreateSchema.safeParse({ photos: [{ uploadKey: "private/crew-posts/a.webp" }] }).success).toBe(
      false,
    );
  });
  it("le fil : filtre « pour toi » par défaut", () => {
    expect(feedQuery.parse({}).filter).toBe("for_you");
    expect(feedQuery.safeParse({ filter: "friends" }).success).toBe(false);
    expect(feedMineQuery.parse({}).cursor).toBeUndefined();
  });
  it("signalement : motif de la liste, « Autre » exige quelques mots", () => {
    expect(feedReportSchema.safeParse({ reason: "plate_or_face" }).success).toBe(true);
    expect(feedReportSchema.safeParse({ reason: "other" }).success).toBe(false);
    expect(feedReportSchema.safeParse({ reason: "other", details: "Précision" }).success).toBe(true);
    expect(feedReportSchema.safeParse({ reason: "cancelled_unannounced" }).success).toBe(false);
  });
  it("constantes", () => {
    expect(FEED_PAGE).toBe(20);
    expect(feedLabels.title).toBe("Le Fil");
  });
});
