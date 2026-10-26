import { describe, expect, it } from "vitest";

import { mergeProposalPages } from "./stylesModel";

describe("file des styles proposés de l'admin (lot R5a, tour 2)", () => {
  it("« Charger la suite » ajoute la page suivante, au-delà de 50 groupes, sans doublon", () => {
    const group = (i: number) => ({ key: `style${i}` });
    const first = Array.from({ length: 50 }, (_, i) => group(i));
    const second = [group(49), ...Array.from({ length: 5 }, (_, i) => group(50 + i))];
    const all = mergeProposalPages(first, second);
    expect(all).toHaveLength(55);
    expect(all.at(-1)?.key).toBe("style54");
    expect(new Set(all.map((g) => g.key)).size).toBe(55);
  });
});
