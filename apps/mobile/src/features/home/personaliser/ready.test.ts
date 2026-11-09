import { describe, expect, it } from "vitest";

import { personalizeReadiness } from "./ready";

describe("Personnaliser : édition permise seulement avec le réglage frais", () => {
  it("réponse en attente : chargement, rien d'éditable", () => {
    expect(personalizeReadiness({ data: null, error: null, loading: true })).toBe("loading");
  });
  it("échec ou hors ligne sans réglage : échec (Réessayer), jamais les valeurs par défaut", () => {
    expect(personalizeReadiness({ data: null, error: new Error("network"), loading: false })).toBe("failed");
    expect(personalizeReadiness({ data: null, error: null, loading: false })).toBe("failed");
  });
  it("réglage arrivé : prêt", () => {
    expect(personalizeReadiness({ data: { homeWidgets: null }, error: null, loading: false })).toBe("ready");
  });
});
