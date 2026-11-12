import { describe, expect, it } from "vitest";

import { createRetryTracker } from "./retryTracker";

describe("« Réessayer » d'une liste (P26b)", () => {
  it("relecture en échec alors qu'un curseur existe : le retry relit", () => {
    const t = createRetryTracker();
    t.failed("reload");
    expect(t.target()).toBe("reload");
  });
  it("page suivante en échec : le retry relance la page suivante", () => {
    const t = createRetryTracker();
    t.failed("more");
    expect(t.target()).toBe("more");
  });
  it("le dernier échec décide, un succès remet le comportement d'une liste lue", () => {
    const t = createRetryTracker();
    t.failed("more");
    t.failed("reload");
    expect(t.target()).toBe("reload");
    t.succeeded();
    expect(t.target()).toBe("more");
  });
});
