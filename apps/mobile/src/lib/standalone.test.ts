import { describe, expect, it, vi } from "vitest";

import { isStandaloneOpen, openStandalone } from "./standalone";

describe("pages hors barre : une seule dans la pile", () => {
  it("non ouverte : push ; le registre ne retient rien hors d'une page montée", () => {
    const router = { push: vi.fn(), dismissTo: vi.fn() };
    openStandalone(router, "/sorties");
    expect(router.push).toHaveBeenCalledWith("/sorties");
    expect(router.dismissTo).not.toHaveBeenCalled();
    expect(isStandaloneOpen("/sorties")).toBe(false);
  });
});
