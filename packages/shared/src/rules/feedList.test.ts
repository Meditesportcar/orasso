import { describe, expect, it } from "vitest";

import { feedScreenLabels as L } from "../labels/feedScreen.fr";
import type { FeedCard } from "../schemas/feed";
import { FEED_ASPECT_RATIOS, feedCardKinds } from "./feed";
import {
  appendCards,
  applyFeedPage,
  emptyFeedList,
  eventsWithPlace,
  FEED_KINDS_DRAWN,
  feedAgo,
  feedCropPlan,
  feedPostBody,
  feedRetryAction,
  firstUndecidedPhoto,
  framesPlaced,
  isFeedKindReserved,
  isNearViewport,
  isUntouchedFrame,
  MY_PUBLISHED_PIN_MS,
  mergeDetectedFrames,
  pinnedPublished,
  publishedCard,
  publishIssue,
  slidesToLoad,
  sponsoredNotBeforeFourth,
  withMyPublished,
  withoutPlacement,
} from "./feedList";
import { DEFAULT_PLATE_FRAME, movePlateFrame, nextPlateFrame } from "./plateFrame";

const card = (id: string): FeedCard =>
  ({
    id,
    kind: "announcement",
    reason: { code: "near_you", label: "Autour de toi" },
    at: "2026-11-09T10:00:00.000Z",
    payload: {},
  }) as unknown as FeedCard;
const RECT = { x: 0.3, y: 0.6, w: 0.3, h: 0.1 };

describe("liste du Fil (curseur, reset)", () => {
  it("première page : la liste est remplacée", () => {
    const state = { ...emptyFeedList("for_you"), items: [card("old")] };
    const r = applyFeedPage(state, { items: [card("a"), card("b")], nextCursor: "c1", filter: "for_you" }, null);
    expect(r?.state.items.map((c) => c.id)).toEqual(["a", "b"]);
    expect(r?.state.nextCursor).toBe("c1");
    expect(r?.scrollTop).toBe(false);
  });
  it("page suivante : ajoutée sans doublon, le curseur avance", () => {
    const state = { ...emptyFeedList("for_you"), items: [card("a"), card("b")], nextCursor: "c1" };
    const r = applyFeedPage(state, { items: [card("b"), card("c")], nextCursor: null, filter: "for_you" }, "c1");
    expect(r?.state.items.map((c) => c.id)).toEqual(["a", "b", "c"]);
    expect(r?.state.nextCursor).toBeNull();
  });
  it("reset : la liste est remplacée (jamais complétée), le nouveau curseur est gardé, on remonte", () => {
    const state = { ...emptyFeedList("following"), items: [card("a"), card("b")], nextCursor: "c1" };
    const r = applyFeedPage(
      state,
      { items: [card("x"), card("a")], nextCursor: "c9", filter: "following", reset: true },
      "c1",
    );
    expect(r?.state.items.map((c) => c.id)).toEqual(["x", "a"]);
    expect(r?.state.nextCursor).toBe("c9");
    expect(r?.scrollTop).toBe(true);
  });
  it("une page d'un autre filtre est ignorée, reset ou non", () => {
    const state = emptyFeedList("nearby");
    expect(applyFeedPage(state, { items: [card("a")], nextCursor: null, filter: "for_you" }, null)).toBeNull();
    expect(
      applyFeedPage(state, { items: [card("a")], nextCursor: null, filter: "for_you", reset: true }, "c"),
    ).toBeNull();
  });
  it("appendCards écarte les doublons", () => {
    expect(appendCards([card("a")], [card("a"), card("b")]).map((c) => c.id)).toEqual(["a", "b"]);
  });
});

describe("genres de carte", () => {
  it("chaque genre de l'API est dessiné ou réservé à un autre lot", () => {
    for (const kind of feedCardKinds) {
      expect(FEED_KINDS_DRAWN.includes(kind) || isFeedKindReserved(kind)).toBe(true);
    }
    expect(feedCardKinds.filter(isFeedKindReserved).sort()).toEqual([]);
  });
});

describe("publier au Fil", () => {
  it("aucune photo, ou une plaque sans décision : une ligne qui dit quoi", () => {
    expect(publishIssue({ photos: [], caption: "" })).toBe(L.missingPhoto);
    expect(publishIssue({ photos: [{ rects: [], noPlate: false }], caption: "" })).toBe(L.missingPlate(1));
    expect(
      publishIssue({
        photos: [
          { rects: [RECT], noPlate: false },
          { rects: [], noPlate: false },
        ],
        caption: "",
      }),
    ).toBe(L.missingPlate(2));
    expect(
      firstUndecidedPhoto([
        { rects: [], noPlate: true },
        { rects: [], noPlate: false },
      ]),
    ).toBe(1);
  });
  it("cadre posé ou « aucune plaque visible » : la décision est prise", () => {
    expect(
      publishIssue({
        photos: [
          { rects: [RECT], noPlate: false },
          { rects: [], noPlate: true },
        ],
        caption: "Lavée",
      }),
    ).toBeNull();
  });
  it("légende trop longue, préparation en cours", () => {
    const ok = [{ rects: [RECT], noPlate: false }];
    expect(publishIssue({ photos: ok, caption: "a".repeat(501) })).toBe(L.captionTooLong);
    expect(publishIssue({ photos: ok, caption: "a".repeat(500) })).toBeNull();
    expect(publishIssue({ photos: ok, caption: "", preparing: true })).toBe(L.preparing);
  });
  it("le corps envoie les cadres, ou la confirmation, jamais ni l'un ni l'autre", () => {
    const body = feedPostBody({
      photos: [
        { uploadKey: "private/feed-posts/a.webp", rects: [RECT], noPlate: false },
        { uploadKey: "private/feed-posts/b.webp", rects: [], noPlate: true },
      ],
      caption: "  Lavée  ",
      aspect: "portrait_4_5",
      vehicleId: null,
      eventId: null,
      clientId: "id",
    });
    expect(body.caption).toBe("Lavée");
    expect(body.photos[0]).toEqual({
      uploadKey: "private/feed-posts/a.webp",
      plateRects: [RECT],
      noPlateConfirmed: false,
    });
    expect(body.photos[1]).toEqual({
      uploadKey: "private/feed-posts/b.webp",
      plateRects: null,
      noPlateConfirmed: true,
    });
  });
  it("événements où j'ai une place : retenue, publié, sans doublon, triés", () => {
    const ev = (id: string, startsAt: string, status = "published") => ({ id, title: id, startsAt, status });
    const out = eventsWithPlace([
      { status: "accepted", event: ev("b", "2026-12-02T10:00:00Z") },
      { status: "pending", event: ev("p", "2026-11-20T10:00:00Z") },
      { status: "accepted", event: ev("a", "2026-11-12T10:00:00Z") },
      { status: "accepted", event: ev("a", "2026-11-12T10:00:00Z") },
      { status: "accepted", event: ev("d", "2026-11-11T10:00:00Z", "draft") },
    ]);
    expect(out.map((e) => e.id)).toEqual(["a", "b"]);
  });
});

describe("recadrage d'une publication", () => {
  it("4:5 dans un paysage 4000 × 3000 : le cadre est centré, sortie 1080 × 1350", () => {
    const p = feedCropPlan(4000, 3000, "portrait_4_5");
    expect(p.width / p.height).toBeCloseTo(0.8, 2);
    expect(p.originX).toBe(Math.round((4000 - p.width) / 2));
    expect(p.originY).toBe(0);
    expect([p.outWidth, p.outHeight]).toEqual([1080, 1350]);
  });
  it("carré et paysage : sortie 1080 × 1080 et 1350 × 1080", () => {
    expect(feedCropPlan(3000, 4000, "square")).toMatchObject({
      outWidth: 1080,
      outHeight: 1080,
      width: 3000,
      height: 3000,
    });
    expect(feedCropPlan(3000, 4000, "landscape")).toMatchObject({ outWidth: 1350, outHeight: 1080, width: 3000 });
  });
  it("le cadre reste dans la photo même avec un centre au bord", () => {
    const p = feedCropPlan(4000, 3000, "portrait_4_5", { x: 0, y: 0 });
    expect(p.originX).toBe(0);
    const q = feedCropPlan(4000, 3000, "portrait_4_5", { x: 1, y: 1 });
    expect(q.originX + q.width).toBeLessThanOrEqual(4000);
  });
  it("la sortie respecte le format à 2 % près (contrôle de l'API)", () => {
    for (const aspect of ["portrait_4_5", "square", "landscape"] as const) {
      const p = feedCropPlan(1234, 2345, aspect);
      expect(Math.abs(p.outWidth / p.outHeight / FEED_ASPECT_RATIOS[aspect] - 1)).toBeLessThan(0.02);
    }
  });
});

describe("ligne de temps d'une carte", () => {
  const now = new Date("2026-11-09T12:00:00Z");
  it("de l'instant à la semaine", () => {
    expect(feedAgo("2026-11-09T11:59:40Z", now)).toBe("à l'instant");
    expect(feedAgo("2026-11-09T11:35:00Z", now)).toBe("il y a 25 min");
    expect(feedAgo("2026-11-09T09:00:00Z", now)).toBe("il y a 3 h");
    expect(feedAgo("2026-11-08T10:00:00Z", now)).toBe("hier");
    expect(feedAgo("2026-11-05T10:00:00Z", now)).toBe("il y a 4 j");
    expect(feedAgo("2026-10-02T10:00:00Z", now)).toBe("2 oct.");
  });
});

describe("décision de plaque : le cadre posé à la main", () => {
  it("un cadre qui n'a pas bougé de là où il est né n'est pas une décision ; déplacé, il en est une", () => {
    const born = nextPlateFrame([]);
    expect(born).toEqual(DEFAULT_PLATE_FRAME);
    expect(isUntouchedFrame(born)).toBe(true);
    expect(isUntouchedFrame(nextPlateFrame([RECT, RECT]))).toBe(true);
    expect(isUntouchedFrame(movePlateFrame(born, 0.01, 0))).toBe(false);
    expect(isUntouchedFrame(RECT)).toBe(false);
    expect(framesPlaced([born])).toBe(false);
    expect(framesPlaced([movePlateFrame(born, 0.1, -0.2)])).toBe(true);
    expect(framesPlaced([])).toBe(false);
  });
  it("la ligne dit « place le cadre » (et non « floute la plaque ») pour une photo au cadre resté en place", () => {
    const photos = [{ rects: [nextPlateFrame([])], noPlate: false }];
    expect(publishIssue({ photos, caption: "" })).toBe(L.placeFrame(1));
    expect(L.placeFrame(1)).toContain("place le cadre sur la plaque");
    expect(firstUndecidedPhoto(photos)).toBe(0);
    expect(publishIssue({ photos: [{ rects: [nextPlateFrame([])], noPlate: true }], caption: "" })).toBeNull();
  });
  it("l'union des cadres repérés : aucun cadre existant n'est retiré, pas de doublon, quatre au plus", () => {
    const other = { x: 0.05, y: 0.1, w: 0.2, h: 0.06 };
    expect(mergeDetectedFrames([RECT], [other])).toEqual([RECT, other]);
    expect(mergeDetectedFrames([RECT], [{ ...RECT, x: RECT.x + 0.01 }])).toEqual([RECT]);
    expect(mergeDetectedFrames([], [RECT])).toEqual([RECT]);
    expect(mergeDetectedFrames([RECT], [])).toEqual([RECT]);
    const many = [0.0, 0.1, 0.2, 0.3, 0.4].map((y) => ({ x: 0.7, y, w: 0.1, h: 0.05 }));
    expect(mergeDetectedFrames([], many)).toHaveLength(4);
  });
  it("événements proposés : ceux que l'API accepte (publié, pas sur invitation)", () => {
    const ev = (id: string, admission?: string) => ({
      id,
      title: id,
      startsAt: "2026-12-01T10:00:00Z",
      status: "published",
      admission,
    });
    const out = eventsWithPlace([
      { status: "accepted", event: ev("open", "open") },
      { status: "accepted", event: ev("filtered", "filtered") },
      { status: "accepted", event: ev("invite", "invite_only") },
      { status: "accepted", event: ev("old") },
    ]);
    expect(out.map((e) => e.id).sort()).toEqual(["filtered", "old", "open"]);
  });
});

describe("ma publication après l'envoi", () => {
  const post = {
    id: "p1",
    author: { id: "u", pseudo: "Moi", avatarUrl: null, grade: "rodage" },
    caption: null,
    aspect: "portrait_4_5",
    photos: [],
    vehicle: null,
    event: null,
    reactionsCount: 0,
    reactedByMe: false,
    createdAt: "2026-11-09T10:00:00.000Z",
    mine: false,
  } as unknown as Parameters<typeof publishedCard>[0];
  it("la carte a l'identifiant de l'API : une relecture qui la rend ne la double pas", () => {
    const mine = publishedCard(post);
    expect(mine.id).toBe("feed_post:p1");
    expect(mine.payload.post.mine).toBe(true);
    expect(mine.reason.label).toBe(L.publishedReason);
    const fromApi = { ...mine, reason: { code: "following_author", label: "Tu suis Moi" } } as FeedCard;
    const list = withMyPublished([card("a"), fromApi], [mine]);
    expect(list.map((c) => c.id)).toEqual(["a", "feed_post:p1"]);
    expect(list[1]?.reason.label).toBe("Tu suis Moi");
  });
  it("sans doublon dans la liste, en tête, et la liste de l'API n'est pas modifiée", () => {
    const items = [card("a"), card("b")];
    const out = withMyPublished(items, [publishedCard(post)]);
    expect(out.map((c) => c.id)).toEqual(["feed_post:p1", "a", "b"]);
    expect(items).toHaveLength(2);
    expect(withMyPublished(items, []).map((c) => c.id)).toEqual(["a", "b"]);
  });
});

describe("ma publication épinglée 24 h", () => {
  const at = (iso: string) => ({ ...card("x"), at: iso }) as FeedCard;
  const now = Date.parse("2026-11-10T10:00:00.000Z");
  it("reste en tête moins de 24 h, tombe à 24 h pile", () => {
    const fresh = at("2026-11-09T10:00:01.000Z");
    const old = at("2026-11-09T10:00:00.000Z");
    expect(pinnedPublished([fresh, old], now)).toEqual([fresh]);
    expect(MY_PUBLISHED_PIN_MS).toBe(86_400_000);
  });
  it("une date illisible reste (on ne perd pas une publication sur un doute)", () => {
    const odd = at("pas une date");
    expect(pinnedPublished([odd], now)).toEqual([odd]);
  });
});

describe("« Réessayer »", () => {
  it("après un échec d'actualisation : on relit (première page) ; après un échec de « Voir plus » : page suivante", () => {
    expect(feedRetryAction("reload")).toBe("reload");
    expect(feedRetryAction(null)).toBe("reload");
    expect(feedRetryAction("more")).toBe("loadMore");
  });
});

describe("mémoire des photos : slidesToLoad, isNearViewport", () => {
  it("charge la diapositive visible et la suivante, pas plus", () => {
    expect(slidesToLoad(0, 5, true)).toEqual([0, 1]);
    expect(slidesToLoad(2, 5, true)).toEqual([2, 3]);
    expect(slidesToLoad(4, 5, true)).toEqual([4]);
    expect(slidesToLoad(0, 1, true)).toEqual([0]);
  });
  it("ne charge rien quand la carte est loin de l'écran, ni sans photo", () => {
    expect(slidesToLoad(0, 5, false)).toEqual([]);
    expect(slidesToLoad(0, 0, true)).toEqual([]);
  });
  it("borne l'index", () => {
    expect(slidesToLoad(9, 3, true)).toEqual([2]);
    expect(slidesToLoad(-1, 3, true)).toEqual([0, 1]);
  });
  it("une carte est proche à moins d'un écran de la fenêtre", () => {
    expect(isNearViewport(100, 400, 800)).toBe(true);
    expect(isNearViewport(1500, 400, 800)).toBe(true); // sous l'écran, à moins d'un écran
    expect(isNearViewport(1700, 400, 800)).toBe(false);
    expect(isNearViewport(-1300, 400, 800)).toBe(false); // passée loin au-dessus
    expect(isNearViewport(-900, 400, 800)).toBe(true);
  });
});

describe("la carte Sponsorisé jamais avant la 4e place (lot R7k2, tour 2)", () => {
  const post = (id: string) => ({ id, kind: "feed_post", payload: {} }) as unknown as FeedCard;
  const ad = (id: string, placement = "pl1") =>
    ({ id, kind: "sponsored", payload: { id: placement } }) as unknown as FeedCard;
  const ids = (l: readonly FeedCard[]) => l.map((c) => c.id);

  it("laisse la liste telle quelle quand la carte est à la 4e place ou plus bas", () => {
    const l = [post("a"), post("b"), post("c"), ad("s"), post("d")];
    expect(ids(sponsoredNotBeforeFourth(l))).toEqual(["a", "b", "c", "s", "d"]);
  });
  it("redescend la carte à la 4e place quand une des trois premières est sortie", () => {
    const l = [post("a"), post("b"), ad("s"), post("d"), post("e"), post("f")];
    expect(ids(sponsoredNotBeforeFourth(l))).toEqual(["a", "b", "d", "s", "e", "f"]);
  });
  it("deux cartes remontées ensemble ne passent jamais devant (relecture du tour 2)", () => {
    const l = [post("a"), ad("s1"), post("b"), ad("s2", "pl2"), post("c"), post("d")];
    expect(ids(sponsoredNotBeforeFourth(l))).toEqual(["a", "b", "c", "s1", "s2", "d"]);
  });
  it("la fait disparaître quand il reste moins de trois autres cartes", () => {
    expect(ids(sponsoredNotBeforeFourth([post("a"), ad("s"), post("b")]))).toEqual(["a", "b"]);
    expect(ids(sponsoredNotBeforeFourth([ad("s")]))).toEqual([]);
  });
  it("ne touche pas aux reprises plus bas (10e, 16e place)", () => {
    const l = [
      post("a"),
      post("b"),
      post("c"),
      ad("s1"),
      post("d"),
      post("e"),
      post("f"),
      post("g"),
      post("h"),
      post("i"),
      ad("s2"),
    ];
    expect(ids(sponsoredNotBeforeFourth(l))).toEqual(ids(l));
  });
  it("retire toutes les cartes d'un emplacement refusé, pas les autres", () => {
    const l = [post("a"), ad("s1", "pl1"), post("b"), ad("s2", "pl1"), ad("s3", "pl2")];
    expect(ids(withoutPlacement(l, "pl1"))).toEqual(["a", "b", "s3"]);
  });
});
