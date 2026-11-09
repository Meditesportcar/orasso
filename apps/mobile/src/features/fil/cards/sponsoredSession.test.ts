import { sponsoredSessionKey } from "@orasso/shared";
import { beforeEach, describe, expect, it } from "vitest";

import {
  claimImpression,
  countsAsSeen,
  isImpressionRefused,
  isRefusalStatus,
  refuseImpression,
  releaseImpression,
  resetSponsoredSession,
} from "./sponsoredSession";

describe("affichages d'une carte Sponsorisé dans la session", () => {
  beforeEach(resetSponsoredSession);

  it("compte un emplacement une seule fois", () => {
    expect(claimImpression("a")).toBe(true);
    expect(claimImpression("a")).toBe(false);
    expect(claimImpression("b")).toBe(true);
  });

  it("permet un nouvel essai après un échec réseau", () => {
    expect(claimImpression("a")).toBe(true);
    releaseImpression("a");
    expect(claimImpression("a")).toBe(true);
  });

  it("n'essaie plus un emplacement refusé par l'API", () => {
    claimImpression("a");
    refuseImpression("a");
    releaseImpression("a");
    expect(isImpressionRefused("a")).toBe(true);
    expect(claimImpression("a")).toBe(false);
  });

  it("compte par compte et par jour : un autre compte ou le lendemain recompte", () => {
    const d1 = new Date("2026-11-09T11:00:00Z");
    const d2 = new Date("2026-11-10T11:00:00Z");
    expect(claimImpression(sponsoredSessionKey("u1", "a", d1))).toBe(true);
    expect(claimImpression(sponsoredSessionKey("u1", "a", d1))).toBe(false);
    expect(claimImpression(sponsoredSessionKey("u2", "a", d1))).toBe(true);
    expect(claimImpression(sponsoredSessionKey("u1", "a", d2))).toBe(true);
  });

  it("un emplacement refusé reste refusé pour ce compte ce jour-là (la carte ne revient pas plus bas), pas pour un autre", () => {
    const d1 = new Date("2026-11-09T11:00:00Z");
    refuseImpression(sponsoredSessionKey("u1", "a", d1));
    expect(isImpressionRefused(sponsoredSessionKey("u1", "a", d1))).toBe(true);
    expect(isImpressionRefused(sponsoredSessionKey("u2", "a", d1))).toBe(false);
    expect(isImpressionRefused(sponsoredSessionKey("u1", "a", new Date("2026-11-10T11:00:00Z")))).toBe(false);
  });

  it("ne compte que la partie visible, pas ce qui est caché sous la bande ou la barre d'onglets", () => {
    // Zone visible : de 100 (sous la bande) à 700 (au-dessus de la barre d'onglets) ; carte de 200 px : 100 px visibles au moins.
    expect(countsAsSeen(300, 200, 100, 700)).toBe(true);
    expect(countsAsSeen(650, 200, 100, 700)).toBe(false); // 50 px visibles sur 200 : le reste sous la barre
    expect(countsAsSeen(600, 200, 100, 700)).toBe(true); // 100 px sur 200 : pile 50 %
    expect(countsAsSeen(-50, 200, 100, 700)).toBe(false); // 50 px visibles : le reste sous la bande
    // Une carte de 1 800 px dans 600 px (33 % visibles au mieux) compte à partir de 540 px, pas avant.
    expect(countsAsSeen(160, 1800, 100, 700)).toBe(true);
    expect(countsAsSeen(161, 1800, 100, 700)).toBe(false);
    expect(countsAsSeen(0, 0, 100, 700)).toBe(false);
    expect(countsAsSeen(300, 200, 700, 100)).toBe(false);
  });

  it("retire la carte sur 409 et 404 seulement", () => {
    expect(isRefusalStatus(409)).toBe(true);
    expect(isRefusalStatus(404)).toBe(true);
    expect(isRefusalStatus(429)).toBe(false);
    expect(isRefusalStatus(0)).toBe(false);
    expect(isRefusalStatus(undefined)).toBe(false);
  });
});
