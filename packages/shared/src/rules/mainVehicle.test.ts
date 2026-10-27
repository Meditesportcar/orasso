import { describe, expect, it } from "vitest";
import { canFollowUser, followNotificationBody, networkCountsVisible } from "./follows";
import { effectiveMainVehicleId, garageOrder, preselectVehicle } from "./mainVehicle";

const garage = [
  { id: "a", status: "active" },
  { id: "b", status: "sold" },
  { id: "c", status: "active" },
  { id: "d", status: "active" },
];

describe("véhicule principal (lot R4c)", () => {
  it("garde le principal choisi s'il est actif", () => {
    expect(effectiveMainVehicleId(garage, "c")).toBe("c");
  });
  it("sans choix, le plus ancien véhicule actif", () => {
    expect(effectiveMainVehicleId(garage, null)).toBe("a");
  });
  it("un principal archivé ou disparu cède sa place au plus ancien actif, sans question", () => {
    expect(effectiveMainVehicleId(garage, "b")).toBe("a");
    expect(effectiveMainVehicleId(garage, "zz")).toBe("a");
    expect(
      effectiveMainVehicleId(
        [
          { id: "a", status: "sold" },
          { id: "c", status: "active" },
        ],
        "a",
      ),
    ).toBe("c");
  });
  it("aucun véhicule actif : pas de principal", () => {
    expect(effectiveMainVehicleId([{ id: "a", status: "sold" }], "a")).toBeNull();
    expect(effectiveMainVehicleId([], null)).toBeNull();
  });
  it("le garage met le principal d'abord, puis l'ordre d'ajout", () => {
    expect(garageOrder(garage, "c").map((v) => v.id)).toEqual(["c", "a", "b", "d"]);
    expect(garageOrder(garage, null).map((v) => v.id)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("présélection de la candidature (R4.5b)", () => {
  const ok = (id: string) => ({ id, hasPhoto: true, matches: true, admitted: true });
  it("le principal d'abord", () => {
    expect(preselectVehicle([ok("a"), ok("b")], "b", "a")).toEqual({ id: "b", reason: "main" });
  });
  it("principal sans photo : le dernier utilisé", () => {
    expect(preselectVehicle([{ id: "b", hasPhoto: false, matches: true, admitted: true }, ok("a")], "b", "a")).toEqual({
      id: "a",
      reason: "last",
    });
  });
  it("principal hors des catégories recherchées : le dernier utilisé, puis le premier qui convient", () => {
    const off = { id: "b", hasPhoto: true, matches: false, admitted: true };
    expect(preselectVehicle([off, ok("a"), ok("c")], "b", "c")).toEqual({ id: "c", reason: "last" });
    expect(preselectVehicle([off, ok("a")], "b", null)).toEqual({ id: "a", reason: "first" });
  });
  it("rien ne convient aux catégories : le premier qui a une photo (candidature possible quand même)", () => {
    const offA = { id: "a", hasPhoto: false, matches: false, admitted: true };
    const offB = { id: "b", hasPhoto: true, matches: false, admitted: true };
    expect(preselectVehicle([offA, offB], "a", null)).toEqual({ id: "b", reason: "first" });
  });
  it("garage mixte : une moto principale n'est jamais proposée pour un événement réservé aux voitures", () => {
    const moto = { id: "moto", hasPhoto: true, matches: true, admitted: false };
    expect(preselectVehicle([moto, ok("car")], "moto", "moto")).toEqual({ id: "car", reason: "first" });
    expect(preselectVehicle([moto], "moto", null)).toBeNull();
  });
  it("aucune photo : rien de présélectionné", () => {
    expect(preselectVehicle([{ id: "a", hasPhoto: false, matches: true, admitted: true }], "a", "a")).toBeNull();
  });
});

describe("suivre une personne (R4.6, R6.1)", () => {
  it("tout compte disponible (privé : une demande), jamais soi-même, jamais un compte indisponible", () => {
    expect(canFollowUser({ isSelf: false })).toBe(true);
    expect(canFollowUser({ isSelf: true })).toBe(false);
    expect(canFollowUser({ isSelf: false, unavailable: true })).toBe(false);
  });
  it("nombres : visibles de tout membre connecté, même d'un compte privé (Damien, 24/10)", () => {
    expect(networkCountsVisible({ connected: true })).toBe(true);
    expect(networkCountsVisible({ connected: false })).toBe(false);
  });
  it("notification regroupée", () => {
    expect(followNotificationBody(["Kenji_66"], 1)).toBe("Kenji_66 te suit.");
    expect(followNotificationBody(["Kenji_66", "Lea_11"], 2)).toBe("Kenji_66 et Lea_11 te suivent.");
    expect(followNotificationBody(["Kenji_66", "Lea_11"], 4)).toBe("Kenji_66 et 3 autres personnes te suivent.");
  });
});
