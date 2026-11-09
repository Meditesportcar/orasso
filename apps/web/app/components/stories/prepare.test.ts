import { describe, expect, it } from "vitest";

import { fitSize, STORY_SIDE } from "./prepare";

describe("taille de la photo d'une story sur le site", () => {
  it("une photo plus petite que 2048 px garde sa taille", () => {
    expect(fitSize(1600, 900)).toEqual({ width: 1600, height: 900 });
    expect(fitSize(STORY_SIDE, 1000)).toEqual({ width: STORY_SIDE, height: 1000 });
  });

  it("une grande photo est ramenée à 2048 px sur son plus long côté, format gardé", () => {
    expect(fitSize(4000, 3000)).toEqual({ width: 2048, height: 1536 });
    expect(fitSize(3000, 6000)).toEqual({ width: 1024, height: 2048 });
    const r = fitSize(6000, 1000);
    expect(r.width).toBe(2048);
    expect(r.height).toBe(341);
  });

  it("des tailles absurdes ne cassent rien", () => {
    expect(fitSize(0, 0)).toEqual({ width: 0, height: 0 });
    expect(fitSize(100_000, 1).height).toBeGreaterThanOrEqual(1);
  });
});
