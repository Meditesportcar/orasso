// Lot R7i, tour 3 : l'heure du serveur passée par le loader racine corrige la pendule du navigateur (rendez-vous au spot).
import { afterEach, describe, expect, it, vi } from "vitest";

import { noteServerAt, serverNowMs, serverSkewMs } from "./clock";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("décalage navigateur / serveur", () => {
  it("rendu serveur (pas de fenêtre) : aucun décalage", () => {
    noteServerAt(Date.now() + 40 * 60_000);
    expect(serverSkewMs()).toBe(0);
  });

  it("navigateur en retard de 40 min : l'heure du serveur dépasse la fin, la pendule locale non", () => {
    vi.stubGlobal("window", {});
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-10T11:20:05.000Z"));
    const serverAt = Date.parse("2026-11-10T12:00:05.000Z");
    const ends = Date.parse("2026-11-10T12:00:00.000Z");
    noteServerAt(serverAt);
    expect(Date.now()).toBeLessThan(ends);
    expect(serverNowMs()).toBeGreaterThanOrEqual(ends);
    // Une valeur déjà vue n'est pas remesurée (le rendu du Layout la repasse à chaque fois).
    vi.setSystemTime(new Date("2026-11-10T11:25:05.000Z"));
    noteServerAt(serverAt);
    expect(serverSkewMs()).toBe(40 * 60_000);
  });
});
