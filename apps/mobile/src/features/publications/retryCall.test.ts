import { describe, expect, it } from "vitest";

import { retryCall } from "./retryCall";

describe("« Réessayer » d'une liste par curseur", () => {
  it("après l'échec d'une relecture (curseur ancien conservé), relit la première page", () => {
    expect(retryCall("reload")).toBe("reload");
  });
  it("après l'échec d'une page suivante, redemande la page suivante", () => {
    expect(retryCall("more")).toBe("more");
  });
  it("sans échec connu, relit", () => {
    expect(retryCall(null)).toBe("reload");
  });
});
