// Lot B2b, tour 2 : la lecture d'une page d'événements par le site a un délai (15 s) ; l'expiration est un échec comme un autre.
import { describe, expect, it, vi } from "vitest";

const apiFetch = vi.fn();
vi.mock("../../lib/api.client", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

import { EVENTS_READ_TIMEOUT_MS, readEventsPage } from "./useMoreEvents";

describe("lecture d'une page d'événements (« Voir plus »)", () => {
  it("pose un délai de 15 s et lit la bonne adresse", async () => {
    apiFetch.mockResolvedValueOnce({ ok: true, status: 200, data: { items: [{ id: "e1" }], nextCursor: "c2" } });
    const res = await readEventsPage("st-1", "past", "c1");
    expect(res).toEqual({ ok: true, data: { items: [{ id: "e1" }], nextCursor: "c2" } });
    expect(EVENTS_READ_TIMEOUT_MS).toBe(15_000);
    expect(apiFetch).toHaveBeenCalledWith("/events?structureId=st-1&scope=past&limit=12&cursor=c1", {
      timeoutMs: 15_000,
    });
  });

  it("une expiration du délai (connexion impossible) est un échec, sans exception", async () => {
    apiFetch.mockResolvedValueOnce({
      ok: false,
      status: 0,
      error: { code: "internal", message: "Connexion impossible." },
    });
    expect(await readEventsPage("st-1", "upcoming", "c1")).toEqual({ ok: false });
  });
});
