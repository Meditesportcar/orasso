import { describe, expect, it } from "vitest";
import { countFr, pluralFr } from "./plural.fr";

describe("accord en nombre (lot R6-retouches)", () => {
  it("met 0 et 1 au singulier, le pluriel dès 2", () => {
    expect(countFr(0, "abonné")).toBe("0 abonné");
    expect(countFr(1, "abonné")).toBe("1 abonné");
    expect(countFr(2, "abonné")).toBe("2 abonnés");
    expect(countFr(12, "place")).toBe("12 places");
  });
  it("prend un pluriel irrégulier", () => {
    expect(countFr(1, "avis", "avis")).toBe("1 avis");
    expect(pluralFr(3, "vient", "viennent")).toBe("viennent");
    expect(pluralFr(1, "voit", "voient")).toBe("voit");
  });
});
