import { describe, expect, it } from "vitest";

import { revealOffset } from "./ScrollAssist";
import { createTouchHold } from "./scrollHold";

describe("carte qui tient la page (lot 59c, tour 2)", () => {
  const track = () => {
    const calls: boolean[] = [];
    return { calls, hold: createTouchHold((on) => calls.push(on)) };
  };

  it("pincement : rendue quand les deux doigts de la carte sont levés", () => {
    const { calls, hold } = track();
    hold.start([1]);
    hold.start([2]);
    hold.end([1]);
    expect(calls).toEqual([true]);
    hold.end([2]);
    expect(calls).toEqual([true, false]);
  });

  it("un doigt resté ailleurs sur l'écran ne garde pas la page bloquée", () => {
    const { calls, hold } = track();
    // Le doigt 7 est posé hors de la carte : la carte ne le voit pas ; seul le doigt 1 compte.
    hold.start([1]);
    hold.end([1]);
    expect(calls).toEqual([true, false]);
  });

  it("geste annulé ou carte démontée doigt posé : rendue", () => {
    const { calls, hold } = track();
    hold.start([1, 2]);
    hold.cancel();
    expect(calls).toEqual([true, false]);
    hold.cancel();
    expect(calls).toEqual([true, false]);
  });
});

describe("défilement jusqu'à la fiche (lot 59c, tour 2)", () => {
  const page = { pageY: 100, pageH: 600 };
  it("déjà visible : rien", () => {
    expect(revealOffset({ ...page, offset: 50, viewY: 200, viewH: 200, margin: 12 })).toBeNull();
  });
  it("dépasse en bas : on montre son bas", () => {
    expect(revealOffset({ ...page, offset: 50, viewY: 600, viewH: 200, margin: 12 })).toBe(50 + 100 + 12);
  });
  it("plus haute que la page : on aligne son haut (les premières cartes restent visibles)", () => {
    expect(revealOffset({ ...page, offset: 50, viewY: 600, viewH: 900, margin: 12 })).toBe(50 + 500 - 12);
  });
});
