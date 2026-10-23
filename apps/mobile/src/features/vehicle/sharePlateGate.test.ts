// Lot M6, tour 4 : le partage de l'affiche n'est jamais possible sans vérification de la plaque.
import { describe, expect, it } from "vitest";

import { PLATE_CHECK_TIMEOUT_MS, plateGate } from "./sharePlateGate";

describe("filet de sécurité de l'affiche", () => {
  it("pas encore d'état : compté comme en cours, le partage direct reste fermé", () => {
    expect(plateGate(undefined, true)).toEqual({ checking: true, blocked: false });
    expect(plateGate("checking", true)).toEqual({ checking: true, blocked: false });
  });

  it("plaque repérée ou vérification trop longue : choix confirmé, pas de partage direct", () => {
    expect(plateGate("found", true)).toEqual({ checking: false, blocked: true });
    expect(plateGate("slow", true)).toEqual({ checking: false, blocked: true });
  });

  it("vérification aboutie : partage possible", () => {
    for (const check of ["clear", "server", "masked"] as const) {
      expect(plateGate(check, true)).toEqual({ checking: false, blocked: false });
    }
  });

  it("sans affiche : rien n'est « en cours » (le bouton est grisé par l'absence d'affiche)", () => {
    expect(plateGate(undefined, false)).toEqual({ checking: false, blocked: false });
  });

  it("délai maximal de 8 s", () => {
    expect(PLATE_CHECK_TIMEOUT_MS).toBe(8_000);
  });
});
