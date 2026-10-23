import { describe, expect, it, vi } from "vitest";

vi.mock("expo-network", () => ({ useNetworkState: () => ({}) }));
vi.mock("expo-router", () => ({ useFocusEffect: () => undefined }));
vi.mock("@/lib/http", () => ({ errorMessage: String }));
vi.mock("@/lib/kv", () => ({ cacheGetJson: async () => null, cacheSetJson: async () => {}, cacheScope: () => "a" }));
vi.mock("@/lib/requestGate", () => ({ createRequestGate: () => ({}) }));

import { appendUnique, STALE_MS, shouldRevalidate } from "./usePaged";

const base = { busy: false, pending: false, enabled: true, error: null, lastOk: 1000 };

describe("revalidation de la liste (lot M3, tour 3)", () => {
  it("un changement de filtre ne lance qu'une requête : rien pendant son délai de frappe ni pendant la lecture", () => {
    expect(shouldRevalidate({ ...base, error: "réseau", pending: true }, 1000 + STALE_MS * 2)).toBe(false);
    expect(shouldRevalidate({ ...base, error: "réseau", busy: true }, 1000 + STALE_MS * 2)).toBe(false);
  });
  it("relit une liste en échec ou ancienne, pas une liste fraîche", () => {
    expect(shouldRevalidate({ ...base, error: "réseau" }, 1001)).toBe(true);
    expect(shouldRevalidate(base, 1001 + STALE_MS)).toBe(true);
    expect(shouldRevalidate(base, 1000 + STALE_MS)).toBe(false);
    expect(shouldRevalidate({ ...base, lastOk: 0 }, 1000 + STALE_MS * 2)).toBe(false);
  });
});

describe("page suivante sans doublon (lot M4, tour 2)", () => {
  it("un événement déjà vu (sa valeur de tri a baissé entre deux pages) n'est pas répété", () => {
    const a = { id: "A" };
    const b = { id: "B" };
    const c = { id: "C" };
    expect(appendUnique([a, b], [c, b])).toEqual([a, b, c]);
    expect(appendUnique([], [a])).toEqual([a]);
  });
});
