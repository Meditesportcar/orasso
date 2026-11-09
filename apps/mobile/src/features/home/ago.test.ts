import { describe, expect, it } from "vitest";

import { agoLabel } from "./ago";

const NOW = new Date("2026-11-10T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

describe("âge d'une nouveauté de l'Accueil", () => {
  it("à l'instant, minutes, heures, hier, jours", () => {
    expect(agoLabel(ago(20_000), NOW)).toBe("à l'instant");
    expect(agoLabel(ago(5 * 60_000), NOW)).toBe("il y a 5 min");
    expect(agoLabel(ago(2 * 3_600_000), NOW)).toBe("il y a 2 h");
    expect(agoLabel(ago(30 * 3_600_000), NOW)).toBe("hier");
    expect(agoLabel(ago(3 * 86_400_000), NOW)).toBe("il y a 3 jours");
  });
  it("une date dans le futur (horloge décalée) : à l'instant", () => {
    expect(agoLabel(new Date(NOW.getTime() + 60_000).toISOString(), NOW)).toBe("à l'instant");
  });
});
