import { describe, expect, it } from "vitest";

import { underTabLabel } from "./underTabLabel";

describe("underTabLabel", () => {
  it("colle le nombre connu au libellé", () => {
    expect(underTabLabel("Événements", 7)).toBe("Événements · 7");
  });
  it("garde le zéro quand il est connu", () => {
    expect(underTabLabel("Événements", 0)).toBe("Événements · 0");
  });
  it("n'écrit rien tant que le nombre n'est pas connu", () => {
    expect(underTabLabel("Événements")).toBe("Événements");
    expect(underTabLabel("Événements", null)).toBe("Événements");
    expect(underTabLabel("Événements", Number.NaN)).toBe("Événements");
  });
});
