import { describe, expect, it } from "vitest";
import { decideClick, settleWait, type WaitedAction } from "./wizardNeedsWait";

describe("clic pendant le chargement des missions (R9-assistant)", () => {
  it("missions chargées : le clic s'exécute tout de suite", () => {
    expect(decideClick("ok", null, true)).toBe("run");
  });

  it("missions en chargement : le clic est mis en attente, pas refusé", () => {
    expect(decideClick("loading", null, true)).toBe("wait");
  });

  it("une action qui n'a pas besoin des missions (création au temps 1) part sans attendre", () => {
    expect(decideClick("loading", null, false)).toBe("run");
  });

  it("lecture en échec : refus (message et « Recharger les missions »), jamais d'attente sans fin", () => {
    expect(decideClick("failed", null, true)).toBe("refuse");
  });

  it("double clic : le second, pendant l'attente, ne double rien", () => {
    const first: WaitedAction = "next";
    expect(decideClick("loading", null, true)).toBe("wait");
    expect(decideClick("loading", first, true)).toBe("ignore");
    expect(decideClick("loading", "publish", true)).toBe("ignore");
  });

  it("à l'arrivée des missions : le clic en attente part, une seule fois", () => {
    expect(settleWait("next", "loading")).toBe("keep");
    expect(settleWait("next", "ok")).toBe("run");
    // Le clic parti est vidé : plus rien à faire au changement d'état suivant.
    expect(settleWait(null, "ok")).toBe("none");
  });

  it("panne de lecture : le clic en attente est annulé (`fail`), jamais exécuté", () => {
    expect(settleWait("publish", "failed")).toBe("fail");
    expect(settleWait("save", "failed")).toBe("fail");
    expect(settleWait(null, "failed")).toBe("none");
  });
});
