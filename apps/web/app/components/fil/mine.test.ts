import type { FeedPostView } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import { forgetPublished, readPublished, rememberPublished } from "./mine";

const memory = () => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
};
const post = (id: string, pseudo = "Damien_66"): FeedPostView =>
  ({
    id,
    author: { pseudo, avatarUrl: null, grade: "rookie", official: false },
    caption: null,
    aspect: "portrait_4_5",
    photos: [],
    vehicle: null,
    event: null,
    createdAt: "2026-11-09T10:00:00.000Z",
    mine: false,
  }) as unknown as FeedPostView;

describe("ma publication gardée dans l'onglet", () => {
  it("la rend en carte « Ta publication », la plus récente d'abord", () => {
    const s = memory();
    rememberPublished(post("a"), s);
    rememberPublished(post("b"), s);
    const cards = readPublished("Damien_66", s);
    expect(cards.map((c) => c.id)).toEqual(["feed_post:b", "feed_post:a"]);
    expect(cards[0]?.reason.label).toBe("Ta publication");
    expect(cards[0]?.kind === "feed_post" && cards[0].payload.post.mine).toBe(true);
  });
  it("ne montre jamais la publication d'un autre pseudo (autre compte dans le même onglet)", () => {
    const s = memory();
    rememberPublished(post("a", "Kenji_66"), s);
    expect(readPublished("Damien_66", s)).toEqual([]);
  });
  it("une publication supprimée ne reste pas, un doublon ne compte qu'une fois", () => {
    const s = memory();
    rememberPublished(post("a"), s);
    rememberPublished(post("a"), s);
    expect(readPublished("Damien_66", s)).toHaveLength(1);
    forgetPublished("feed_post:a", s);
    expect(readPublished("Damien_66", s)).toEqual([]);
  });
  it("garde cinq publications au plus, et résiste à un stockage absent ou abîmé", () => {
    const s = memory();
    for (let i = 0; i < 8; i++) rememberPublished(post(`p${i}`), s);
    expect(readPublished("Damien_66", s)).toHaveLength(5);
    s.setItem("orasso:fil:mes-publications", "{pas du json");
    expect(readPublished("Damien_66", s)).toEqual([]);
    expect(readPublished("Damien_66", null)).toEqual([]);
    expect(() => rememberPublished(post("x"), null)).not.toThrow();
  });
});
