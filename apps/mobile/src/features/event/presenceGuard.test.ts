import { describe, expect, it } from "vitest";

import { attemptGuard } from "./presenceGuard";

describe("garde d'une tentative de présence", () => {
  it("A se déconnecte, B se connecte pendant la mesure : plus d'envoi", () => {
    let token: string | null = "jeton-A";
    const guard = attemptGuard(() => token);
    expect(guard.valid()).toBe(true);
    token = null;
    expect(guard.valid()).toBe(false);
    token = "jeton-B";
    expect(guard.valid()).toBe(false);
  });
  it("fermeture ou démontage de la feuille : annulée", () => {
    const guard = attemptGuard(() => "jeton-A");
    guard.cancel();
    expect(guard.valid()).toBe(false);
  });
  it("sans session au départ : jamais valable", () => {
    expect(attemptGuard(() => null).valid()).toBe(false);
  });
});
