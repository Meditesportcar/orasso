import { createPostLiveStore, pendingFail, pendingStart } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import { commentsScope } from "./scope";

describe("commentsScope : compte et acteur", () => {
  it("un acteur différent = une portée différente ; personne = personne", () => {
    expect(commentsScope("u1", "s:a")).not.toBe(commentsScope("u1", "s:b"));
    expect(commentsScope("u1", null)).not.toBe(commentsScope("u1", "s:a"));
    expect(commentsScope("u1", "s:a")).toBe(commentsScope("u1", "s:a"));
    expect(commentsScope(null, "s:a")).toBeNull();
  });
});
