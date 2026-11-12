// R8p, tour 3 : une coupure après les en-têtes (corps de la réponse interrompu) est une erreur réseau, jamais une `TypeError`.
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("expo-secure-store", () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => {},
  deleteItemAsync: async () => {},
}));
vi.mock("@/api", () => ({ apiUrl: (p: string) => `http://localhost${p}` }));

import { ApiRequestError, requestWithHeaders } from "./http";

describe("requestWithHeaders : corps interrompu", () => {
  it("la lecture du corps qui échoue donne une erreur réseau (status 0)", async () => {
    const broken = new Response(
      new ReadableStream({
        start(controller) {
          controller.error(new TypeError("Network request failed"));
        },
      }),
      { status: 201 },
    );
    vi.stubGlobal("fetch", async () => broken);
    const error = await requestWithHeaders("/api/me/feed-posts", { method: "POST", body: {} }).catch((e) => e);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({ status: 0, code: "network" });
    expect((error as ApiRequestError).isNetwork).toBe(true);
    vi.unstubAllGlobals();
  });
  it("une réponse entière reste lue comme avant", async () => {
    vi.stubGlobal("fetch", async () => new Response('{"ok":1}', { status: 200 }));
    const { data } = await requestWithHeaders<{ ok: number }>("/api/x");
    expect(data.ok).toBe(1);
    vi.unstubAllGlobals();
  });
});
