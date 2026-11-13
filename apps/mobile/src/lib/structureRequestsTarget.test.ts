import { describe, expect, it } from "vitest";

import { structureRequestsTarget } from "./links";

const ID = "3f2b8a52-1c7e-4b0a-9d5e-6a1f0c2d4e11";

describe("structureRequestsTarget : le toucher du push d'une invitation de structure", () => {
  it("invitation à publier avec la structure : son identifiant", () => {
    expect(structureRequestsTarget({ notificationType: "coauthor_invited", structureId: ID })).toBe(ID);
    expect(structureRequestsTarget({ type: "coauthor_invited", structureId: ID })).toBe(ID);
  });
  it("invitation personnelle, autre type ou identifiant invalide : rien", () => {
    expect(structureRequestsTarget({ notificationType: "coauthor_invited" })).toBeNull();
    expect(structureRequestsTarget({ notificationType: "coauthor_invited", structureId: "x" })).toBeNull();
    expect(structureRequestsTarget({ notificationType: "feed_comment", structureId: ID })).toBeNull();
    expect(structureRequestsTarget(null)).toBeNull();
  });
});
