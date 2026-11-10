import { describe, expect, it } from "vitest";

import { explorerR2Labels as R } from "./explorer.fr";

describe("pastille « Mon coin » (lot R8x)", () => {
  it("dit les départements jusqu'à trois", () => {
    expect(R.pillMine([])).toBe("Mon coin");
    expect(R.pillMine(["66"])).toBe("Mon coin (66)");
    expect(R.pillMine(["66", "11", "34"])).toBe("Mon coin (66, 11, 34)");
  });
  it("se résume au-delà (jusqu'à 20 départements ne tiendraient pas à l'écran)", () => {
    const vingt = Array.from({ length: 20 }, (_, i) => String(i + 1).padStart(2, "0"));
    expect(R.pillMine(vingt)).toBe("Mon coin · 20 départements");
    expect(R.pillMine(vingt).length).toBeLessThan(30);
  });
});
