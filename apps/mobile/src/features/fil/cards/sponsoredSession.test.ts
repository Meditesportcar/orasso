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
    expect(isImpressionRefused("a")).toBe(true);
    expect(claimImpression("a")).toBe(false);
  });

  it("retire la carte sur 409 et 404 seulement", () => {
    expect(isRefusalStatus(409)).toBe(true);
    expect(isRefusalStatus(404)).toBe(true);
    expect(isRefusalStatus(429)).toBe(false);
    expect(isRefusalStatus(0)).toBe(false);
    expect(isRefusalStatus(undefined)).toBe(false);
  });
});
