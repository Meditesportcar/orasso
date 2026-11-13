import type { SheetState } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import { parentOfReply, parentToReread } from "./commentParent";

const sheet = {
  replies: {
    p1: { items: [{ id: "r1" }, { id: "r2" }] },
    p2: { items: [{ id: "r3" }] },
  },
} as unknown as Pick<SheetState, "replies">;

describe("suppression d'une réponse sans compteur du parent (P30b)", () => {
  it("retrouve le parent d'une réponse, rien pour un commentaire de premier niveau", () => {
    expect(parentOfReply(sheet, "r3")).toBe("p2");
    expect(parentOfReply(sheet, "top1")).toBeNull();
  });
  it("204 sans parent : la discussion du parent est relue", () => {
    expect(parentToReread("p1", null)).toBe("p1");
    expect(parentToReread("p1", {})).toBe("p1");
  });
  it("200 avec le compteur du parent, ou pas de parent : rien à relire", () => {
    expect(parentToReread("p1", { parent: { id: "p1" } })).toBeNull();
    expect(parentToReread(null, null)).toBeNull();
  });
});
