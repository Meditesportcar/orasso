import type { FeedPostView } from "@orasso/shared";
import { beforeEach, describe, expect, it } from "vitest";

import { forgetMyPublished, markFeedDirty, myPublishedCards, takeFeedDirty } from "./feedSignal";

const post = (id: string): FeedPostView =>
  ({
    id,
    author: { pseudo: "Damien_66", avatarUrl: null, grade: "rookie", official: false },
    caption: "Prêtes pour dimanche",
    aspect: "portrait_4_5",
    photos: [],
    vehicle: null,
    event: null,
    createdAt: "2026-11-09T10:00:00.000Z",
    mine: false,
  }) as unknown as FeedPostView;

describe("ma publication juste après l'envoi", () => {
  beforeEach(() => {
    takeFeedDirty();
    forgetMyPublished();
  });

  it("le signal ne part qu'une fois, la carte reste en tête avec « Ta publication »", () => {
    markFeedDirty(post("a"));
    expect(takeFeedDirty()).toBe(true);
    expect(takeFeedDirty()).toBe(false);
    const [first] = myPublishedCards();
    expect(first?.id).toBe("feed_post:a");
    expect(first?.reason.label).toBe("Ta publication");
    expect(first?.kind === "feed_post" && first.payload.post.mine).toBe(true);
  });

  it("la plus récente d'abord, sans doublon", () => {
    markFeedDirty(post("a"));
    markFeedDirty(post("b"));
    markFeedDirty(post("a"));
    expect(myPublishedCards().map((c) => c.id)).toEqual(["feed_post:a", "feed_post:b"]);
  });

  it("une publication supprimée, ou un autre compte, ne reste pas en tête", () => {
    markFeedDirty(post("a"));
    markFeedDirty(post("b"));
    forgetMyPublished("feed_post:a");
    expect(myPublishedCards().map((c) => c.id)).toEqual(["feed_post:b"]);
    forgetMyPublished();
    expect(myPublishedCards()).toEqual([]);
  });

  it("R9n : un Fil ne reprend que les publications de son acteur (personnelle publiée depuis le Fil d'une structure)", () => {
    markFeedDirty(post("perso"), null);
    markFeedDirty(post("struct"), "s:abc");
    expect(myPublishedCards(null).map((c) => c.id)).toEqual(["feed_post:perso"]);
    expect(myPublishedCards("s:abc").map((c) => c.id)).toEqual(["feed_post:struct"]);
    expect(myPublishedCards("s:autre")).toEqual([]);
    forgetMyPublished("feed_post:struct");
    expect(myPublishedCards("s:abc")).toEqual([]);
  });

  it("sans publication, le signal relit seulement le Fil", () => {
    markFeedDirty();
    expect(takeFeedDirty()).toBe(true);
    expect(myPublishedCards()).toEqual([]);
  });
});
