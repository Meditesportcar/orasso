import { describe, expect, it } from "vitest";

import { createSeenGate } from "./seenGate";

describe("« vu » de l'Activité (lot R7c2, tour 2)", () => {
  it("l'ouverture de l'écran pose « vu » après une lecture réussie, une seule fois", () => {
    const g = createSeenGate();
    expect(g.settle({ ok: true, focused: true })).toBe(true);
    expect(g.settle({ ok: true, focused: true })).toBe(false);
  });

  it("lecture échouée : pas de « vu », il reste dû", () => {
    const g = createSeenGate();
    expect(g.settle({ ok: false, focused: true })).toBe(false);
    expect(g.owed()).toBe(true);
    expect(g.settle({ ok: true, focused: true })).toBe(true);
  });

  it("notification reçue pendant la consultation d'une fiche : pas de « vu » tant que l'Activité n'a pas le focus", () => {
    const g = createSeenGate();
    expect(g.settle({ ok: true, focused: true })).toBe(true);
    g.owe(); // la notification arrive, une fiche est ouverte par-dessus
    expect(g.settle({ ok: true, focused: false })).toBe(false);
    expect(g.owed()).toBe(true);
    // retour sur l'Activité : la liste est relue, puis « vu »
    expect(g.settle({ ok: true, focused: true })).toBe(true);
    expect(g.owed()).toBe(false);
  });
});
