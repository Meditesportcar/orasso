// Règle « première fois » (lots M1 et M6) : après le premier véhicule, l'étape « Tes préférences » si le compte ne l'a
// jamais vue, sinon l'Explorer ; hors ligne, l'Explorer (l'étape reste proposée la prochaine fois).
import { shouldAskPreferences } from "@orasso/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sim = vi.hoisted(() => ({ preferences: vi.fn() }));
vi.mock("./api", () => ({ api: { preferences: sim.preferences } }));
vi.mock("./useApi", () => ({ useApi: vi.fn() }));

import { EXPLORER_ROUTE, PREFERENCES_FIRST_ROUTE, routeAfterFirstVehicle } from "./preferences";

beforeEach(() => {
  sim.preferences.mockReset();
});

describe("après le premier véhicule", () => {
  it("étape jamais vue : « Tes préférences » en première fois", async () => {
    sim.preferences.mockResolvedValue({ seenAt: null });
    expect(await routeAfterFirstVehicle()).toBe(PREFERENCES_FIRST_ROUTE);
    expect(PREFERENCES_FIRST_ROUTE).toBe("/preferences?premiere=1");
  });

  it("étape déjà vue : l'Explorer", async () => {
    sim.preferences.mockResolvedValue({ seenAt: new Date(Date.now() - 60_000).toISOString() });
    expect(await routeAfterFirstVehicle()).toBe(EXPLORER_ROUTE);
  });

  it("hors ligne : l'Explorer", async () => {
    sim.preferences.mockImplementation(async () => {
      throw new Error("hors ligne");
    });
    expect(await routeAfterFirstVehicle()).toBe(EXPLORER_ROUTE);
  });

  it("préférences inconnues : on ne demande rien", () => {
    expect(shouldAskPreferences(null)).toBe(false);
    expect(shouldAskPreferences(undefined)).toBe(false);
  });
});
