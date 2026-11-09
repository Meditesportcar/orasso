import type { StoryView } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import { linkedHref } from "./LinkedCard";

const story = (linked: Partial<NonNullable<StoryView["linked"]>>, viewsCount: number | null = null) =>
  ({
    viewsCount,
    linked: { label: "Voir le classement", slug: null, eventId: null, title: null, ...linked },
  }) as StoryView;

describe("lien de la carte liée d'une story", () => {
  it("deux votes du même événement mènent chacun à leur classement (?vote=)", () => {
    const a = linkedHref(story({ type: "vote_result", id: "vote-a", slug: "nocturne" }));
    const b = linkedHref(story({ type: "vote_result", id: "vote-b", slug: "nocturne" }));
    expect(a).toBe("/app/vote/nocturne?vote=vote-a");
    expect(b).toBe("/app/vote/nocturne?vote=vote-b");
    expect(a).not.toBe(b);
  });

  it("les autres contenus gardent leur page", () => {
    expect(linkedHref(story({ type: "event", id: "e", slug: "mon-event" }))).toBe("/e/mon-event");
    expect(linkedHref(story({ type: "vehicle", id: "v" }))).toBe("/v/v");
    expect(linkedHref(story({ type: "vehicle", id: "v" }, 3))).toBe("/app/garage/v");
    expect(linkedHref(story({ type: "memory", id: "m", eventId: "e1" }))).toBe("/app/souvenir/e1");
    expect(linkedHref(story({ type: "vote_result", id: "x", slug: null }))).toBeNull();
  });
});
