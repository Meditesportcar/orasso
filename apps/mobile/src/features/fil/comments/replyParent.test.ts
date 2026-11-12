import { emptySheet, type FeedCommentView } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import { replyParentOf } from "./replyParent";

const reply = (id: string) => ({ id }) as FeedCommentView;

describe("parent d'une réponse affichée", () => {
  const state = {
    ...emptySheet(),
    items: [reply("p1"), reply("p2")],
    replies: {
      p1: { items: [reply("r1"), reply("r2")], cursor: null, open: true, loaded: true, recent: [] },
      p2: { items: [reply("r3")], cursor: null, open: true, loaded: true, recent: [] },
    },
  };
  it("retrouve le parent d'une réponse lue", () => {
    expect(replyParentOf(state, "r2")).toBe("p1");
    expect(replyParentOf(state, "r3")).toBe("p2");
  });
  it("un commentaire de premier niveau ou inconnu n'a pas de parent", () => {
    expect(replyParentOf(state, "p1")).toBeNull();
    expect(replyParentOf(state, "zzz")).toBeNull();
  });
});
