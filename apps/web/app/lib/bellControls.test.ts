import { describe, expect, it } from "vitest";

import { bellControls } from "./bellControls";

describe("cloche : lecture des préférences (tour 5)", () => {
  it("lecture en cours : interrupteur désactivé, ni erreur ni « Réessayer »", () => {
    expect(bellControls("loading")).toEqual({ switchDisabled: true, showError: false, showRetry: false });
  });
  it("lecture échouée : interrupteur désactivé, erreur et « Réessayer »", () => {
    expect(bellControls("failed")).toEqual({ switchDisabled: true, showError: true, showRetry: true });
  });
  it("lecture réussie : interrupteur actif", () => {
    expect(bellControls("ready")).toEqual({ switchDisabled: false, showError: false, showRetry: false });
  });
});
