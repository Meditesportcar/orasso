import { describe, expect, it } from "vitest";

import { END_MARGIN, endReached, markSeen, waitsForEnd } from "./scrollEnd";

describe("étape vue jusqu'en bas (lot R3a, retour 3)", () => {
  it("une étape qui tient à l'écran est vue d'emblée", () => {
    expect(endReached({ offset: 0, viewport: 600, content: 500 })).toBe(true);
  });
  it("une étape longue : pas vue en haut, vue en bas ou presque", () => {
    expect(endReached({ offset: 0, viewport: 600, content: 1500 })).toBe(false);
    expect(endReached({ offset: 900 - END_MARGIN, viewport: 600, content: 1500 })).toBe(true);
    expect(endReached({ offset: 900 - END_MARGIN - 1, viewport: 600, content: 1500 })).toBe(false);
  });
  it("mesures manquantes : on attend la mise en page", () => {
    expect(endReached({ offset: 0, viewport: 0, content: 500 })).toBe(false);
    expect(endReached({ offset: 0, viewport: 600, content: 0 })).toBe(false);
  });
  it("vue une fois, l'étape reste débloquée (remonter, revenir en arrière)", () => {
    let seen: ReadonlySet<number> = new Set();
    expect(waitsForEnd(seen, 3, false)).toBe(true);
    seen = markSeen(seen, 3);
    expect(waitsForEnd(seen, 3, false)).toBe(false);
    // Retour à l'étape 2 puis de nouveau à la 3 : toujours vue.
    expect(waitsForEnd(seen, 2, false)).toBe(true);
    expect(waitsForEnd(seen, 3, false)).toBe(false);
    expect(markSeen(seen, 3)).toBe(seen);
  });
  it("lecteur d'écran actif : jamais de blocage", () => {
    expect(waitsForEnd(new Set(), 3, true)).toBe(false);
  });
});
