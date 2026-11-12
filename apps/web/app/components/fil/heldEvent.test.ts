import { loadUncertain, purgeUncertain, saveUncertain } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import { loadHeldEvent, saveHeldEvent } from "./heldEvent";

function memory() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    get length() {
      return m.size;
    },
    key: (i: number) => [...m.keys()][i] ?? null,
  };
}

describe("événement gardé avec l'envoi incertain", () => {
  it("se relit pour le même événement, jamais pour un autre ni pour un autre compte", () => {
    const store = memory();
    saveHeldEvent(store, "A", { id: "e1", title: "Balade" });
    expect(loadHeldEvent(store, "A", "e1")).toEqual({ id: "e1", title: "Balade" });
    expect(loadHeldEvent(store, "A", "e2")).toBeNull();
    expect(loadHeldEvent(store, "B", "e1")).toBeNull();
  });
  it("la déconnexion (purgeUncertain) efface le corps et l'événement ensemble", () => {
    const store = memory();
    store.setItem("autre-cle", "garde");
    saveUncertain(store, "A", { clientId: "c1" });
    saveHeldEvent(store, "A", { id: "e1" });
    saveHeldEvent(store, "B", { id: "e2" });
    purgeUncertain(store);
    expect(loadUncertain(store, "A")).toBeNull();
    expect(loadHeldEvent(store, "A", "e1")).toBeNull();
    expect(loadHeldEvent(store, "B", "e2")).toBeNull();
    expect(store.getItem("autre-cle")).toBe("garde");
  });
});
