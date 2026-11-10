import { describe, expect, it } from "vitest";
import { barFor, rememberBar } from "./chainBar";

const bar = { mine: null, authors: [] };

describe("chainBar", () => {
  it("rend la barre affichée du même compte, pas celle d'un autre, pas une périmée", () => {
    rememberBar("a", bar, 1_000);
    expect(barFor("a", 2_000)).toBe(bar);
    expect(barFor("b", 2_000)).toBeNull();
    expect(barFor(null, 2_000)).toBeNull();
    expect(barFor("a", 1_000 + 10 * 60_000)).toBeNull();
  });
  it("oublie à la déconnexion", () => {
    rememberBar("a", bar, 1_000);
    rememberBar(null, null);
    expect(barFor("a", 1_001)).toBeNull();
  });
});
