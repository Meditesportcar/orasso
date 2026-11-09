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
  firstUndecidedPhoto,
  isFeedKindReserved,
  publishIssue,
} from "./feedList";

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
    expect(feedCardKinds.filter(isFeedKindReserved).sort()).toEqual(["memory", "sponsored", "spot_meetup"]);
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
