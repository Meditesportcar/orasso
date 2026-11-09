import { sponsoredSessionKey } from "@orasso/shared";
import { beforeEach, describe, expect, it } from "vitest";

import {
  claimImpression,
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
    expect(claimImpression("a")).toBe(false);
  });

  it("retire la carte sur 409 et 404 seulement", () => {
    expect(isRefusalStatus(409)).toBe(true);
    expect(isRefusalStatus(404)).toBe(true);
    expect(isRefusalStatus(429)).toBe(false);
    expect(isRefusalStatus(0)).toBe(false);
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
});
