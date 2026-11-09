import type { FeedPostView } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import { forgetPublished, purgePublished, readPublished, rememberPublished } from "./mine";

const memory = () => {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
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
    rememberPublished("u1", post("a"), s);
    rememberPublished("u1", post("b"), s);
    const cards = readPublished("u1", s);
    expect(cards.map((c) => c.id)).toEqual(["feed_post:b", "feed_post:a"]);
    expect(cards[0]?.reason.label).toBe("Ta publication");
    expect(cards[0]?.kind === "feed_post" && cards[0].payload.post.mine).toBe(true);
  });
  it("filtre par l'identifiant du compte, jamais par le pseudo (même pseudo, autre compte : rien)", () => {
    const s = memory();
    rememberPublished("u2", post("a", "Damien_66"), s);
    expect(readPublished("u1", s)).toEqual([]);
  });
  it("un pseudo changé n'y change rien : c'est le compte qui compte", () => {
    const s = memory();
    rememberPublished("u1", post("a", "Ancien_pseudo"), s);
    expect(readPublished("u1", s)).toHaveLength(1);
  });
  it("écarte une entrée de l'ancien format (sans compte)", () => {
    const s = memory();
    s.setItem("orasso:fil:mes-publications", JSON.stringify([post("old")]));
    expect(readPublished("u1", s)).toEqual([]);
  });
  it("une publication supprimée ne reste pas, un doublon ne compte qu'une fois", () => {
    const s = memory();
    rememberPublished("u1", post("a"), s);
    rememberPublished("u1", post("a"), s);
    expect(readPublished("u1", s)).toHaveLength(1);
    forgetPublished("feed_post:a", s);
    expect(readPublished("u1", s)).toEqual([]);
  });
  it("garde cinq publications au plus, et résiste à un stockage absent ou abîmé", () => {
    const s = memory();
    for (let i = 0; i < 8; i++) rememberPublished("u1", post(`p${i}`), s);
    expect(readPublished("u1", s)).toHaveLength(5);
    s.setItem("orasso:fil:mes-publications", "{pas du json");
    expect(readPublished("u1", s)).toEqual([]);
    expect(readPublished("u1", null)).toEqual([]);
    expect(() => rememberPublished("u1", post("x"), null)).not.toThrow();
  });
  it("la déconnexion efface tout : le compte B qui reprend le pseudo de A ne voit rien de A", () => {
    const s = memory();
    rememberPublished("u1", post("a", "Pseudo_libere"), s);
    purgePublished(s);
    expect(readPublished("u2", s)).toEqual([]);
    expect(readPublished("u1", s)).toEqual([]);
    expect(s.getItem("orasso:fil:mes-publications")).toBeNull();
    expect(() => purgePublished(null)).not.toThrow();
  });
  it("sans purge (déconnexion sans script), l'autre compte ne voit rien et sa première publication jette celles de A", () => {
    const s = memory();
    rememberPublished("u1", post("a", "Pseudo_libere"), s);
    expect(readPublished("u2", s)).toEqual([]);
    rememberPublished("u2", post("b", "Pseudo_libere"), s);
    expect(readPublished("u1", s)).toEqual([]);
    expect(readPublished("u2", s).map((c) => c.id)).toEqual(["feed_post:b"]);
  });
});
