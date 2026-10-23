// Lot M3, tour 2 : au retour sur un écran, jamais d'état périmé après une modification.
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("expo-router", () => ({ useFocusEffect: () => undefined }));
vi.mock("expo-secure-store", () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => {},
  deleteItemAsync: async () => {},
}));
vi.mock("@/api", () => ({ apiUrl: (p: string) => `http://localhost${p}` }));

import { mutationCount, requestWithHeaders } from "./http";
import { shouldReloadOnFocus } from "./useApi";

describe("retour sur l'écran (useApi)", () => {
  it("recharge quand aucune lecture n'est en cours, même juste après la précédente", () => {
    expect(shouldReloadOnFocus(null, 0)).toBe(true);
  });
  it("ne double pas une lecture en cours sans modification depuis son départ", () => {
    expect(shouldReloadOnFocus(3, 3)).toBe(false);
  });
  it("recharge si une modification est partie après le départ de la lecture en cours", () => {
    expect(shouldReloadOnFocus(3, 4)).toBe(true);
  });
  it("toute requête autre que GET compte comme une modification", async () => {
    const fetchMock = vi.fn(
      async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const before = mutationCount();
    await requestWithHeaders("/api/x").catch(() => undefined);
    expect(mutationCount()).toBe(before);
    await requestWithHeaders("/api/vehicles/1", { method: "DELETE" }).catch(() => undefined);
    expect(mutationCount()).toBe(before + 1);
    vi.unstubAllGlobals();
  });
});
