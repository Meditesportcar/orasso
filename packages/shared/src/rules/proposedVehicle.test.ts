import { describe, expect, it } from "vitest";

import { cleanProposedName, proposalKey, proposalText } from "./proposedVehicle";

describe("nom tapé (lot R4a)", () => {
  it("nettoyé : contrôles, marques de sens et espaces de largeur nulle retirés, espaces réduits, 40 caractères", () => {
    expect(cleanProposedName("  207   CC ")).toBe("207 CC");
    expect(cleanProposedName("207\u0085CC")).toBe("207 CC");
    expect(cleanProposedName("‮207 CC‬")).toBe("207 CC");
    expect(cleanProposedName("2​0‍7﻿")).toBe("207");
    expect(cleanProposedName("a")).toBeNull();
    expect(cleanProposedName("x".repeat(60))).toHaveLength(40);
  });

  it("regroupement : sans accents ni casse, espaces et ponctuation retirés, toutes écritures gardées", () => {
    expect(proposalText("207 CC")).toBe(proposalText("207-cc"));
    expect(proposalText("Citroën")).toBe("citroen");
    expect(proposalText("丰田")).toBe("丰田");
    expect(proposalText("Лада")).toBe("лада");
  });

  it("clés sans collision et sûres dans une adresse", () => {
    const key = (proposedModel: string) =>
      proposalKey({ makeId: "m1", makeIsOther: false, proposedMake: null, proposedModel });
    const names = ["207 CC", "丰田", "Лада", "--", "!!", "Ла да", "_4e30_", "-"];
    const keys = names.map(key);
    // « 207 CC » et « 207cc » ensemble, « Лада » et « Ла да » ensemble ; tout le reste séparé.
    expect(key("207cc")).toBe(key("207 CC"));
    expect(key("Ла да")).toBe(key("Лада"));
    expect(new Set(keys).size).toBe(names.length - 1);
    expect(key("丰田")).not.toBe(key("Лада"));
    expect(key("--")).not.toBe(key("!!"));
    expect(key("_4e30_")).not.toBe(key("丰"));
    for (const k of keys) expect(k).toMatch(/^model\.m1\.[a-z0-9_-]+$/);
    expect(proposalKey({ makeId: "x", makeIsOther: true, proposedMake: "Lotus", proposedModel: "Exige" })).toBe(
      "make.lotus.exige",
    );
  });
});
