import { describe, expect, it } from "vitest";

import { createReadSeq } from "./readSeq";

describe("lectures numérotées", () => {
  it("la réponse de A arrivée après celle de B est jetée", () => {
    const seq = createReadSeq();
    const a = seq.start(); // lecture du compte A
    const b = seq.start(); // le compte de la page change : lecture de B
    expect(seq.isCurrent(b)).toBe(true); // B répond
    expect(seq.isCurrent(a)).toBe(false); // A répond en retard : jetée
  });
  it("une lecture seule reste valable", () => {
    const seq = createReadSeq();
    expect(seq.isCurrent(seq.start())).toBe(true);
  });
});
