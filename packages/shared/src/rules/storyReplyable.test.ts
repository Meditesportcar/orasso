import { describe, expect, it } from "vitest";

import { storyPersonas, storyReplyable } from "./audience";

describe("storyReplyable", () => {
  it("passionné et organisateur : oui ; fiche pro, prestataire, média : non", () => {
    const answers = Object.fromEntries(storyPersonas.map((p) => [p, storyReplyable(p)]));
    expect(answers).toEqual({ fan: true, organizer: true, pro: false, provider: false, media: false });
  });
});
