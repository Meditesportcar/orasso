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

// Lot R7i, tour 4 : le lieu d'un rendez-vous au spot (Accueil) passe par les mêmes contrôles que la valeur de l'écran.
describe("réponses dans l'ordre inverse (useApi, onFresh)", () => {
  it("la réponse ancienne, arrivée après la récente qui confirme l'annulation, ne réaffiche aucun lieu", async () => {
    const { createRequestGate } = await import("./requestGate");
    const { acceptRead } = await import("./useApi");
    const { splitSponsored } = await import("../features/home/rail");
    const gate = createRequestGate(() => "compte-1");
    let spot: unknown = null;
    const apply = (ticket: { latest: () => boolean; current: () => boolean }, fresh: { spotMeetup: unknown }) => {
      if (!acceptRead(true, ticket.current(), ticket.latest())) return;
      spot = splitSponsored(fresh as never).spotMeetup;
    };
    const old = gate.start(); // lecture ancienne : le lieu y est encore
    const recent = gate.start(); // lecture récente : annulé, plus de lieu
    apply(recent, { spotMeetup: null });
    expect(spot).toBeNull();
    apply(old, { spotMeetup: { id: "x", place: { label: "Parking" } } }); // arrive en retard
    expect(spot).toBeNull();
  });

  it("une réponse d'un ancien compte ou d'un écran démonté est jetée", async () => {
    const { acceptRead } = await import("./useApi");
    expect(acceptRead(true, false, true)).toBe(false);
    expect(acceptRead(false, true, true)).toBe(false);
    expect(acceptRead(true, true, true)).toBe(true);
  });
});
