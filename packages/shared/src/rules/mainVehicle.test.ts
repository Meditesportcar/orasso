import { describe, expect, it } from "vitest";
import { canFollowUser, followNotificationBody } from "./follows";
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
  const ok = (id: string) => ({ id, hasPhoto: true, matches: true });
  it("le principal d'abord", () => {
    expect(preselectVehicle([ok("a"), ok("b")], "b", "a")).toEqual({ id: "b", reason: "main" });
  });
  it("principal sans photo : le dernier utilisé", () => {
    expect(preselectVehicle([{ id: "b", hasPhoto: false, matches: true }, ok("a")], "b", "a")).toEqual({
      id: "a",
      reason: "last",
    });
  });
  it("principal hors des catégories recherchées : le dernier utilisé, puis le premier qui convient", () => {
    const off = { id: "b", hasPhoto: true, matches: false };
    expect(preselectVehicle([off, ok("a"), ok("c")], "b", "c")).toEqual({ id: "c", reason: "last" });
    expect(preselectVehicle([off, ok("a")], "b", null)).toEqual({ id: "a", reason: "first" });
  });
  it("rien ne convient aux catégories : le premier qui a une photo (candidature possible quand même)", () => {
    const offA = { id: "a", hasPhoto: false, matches: false };
    const offB = { id: "b", hasPhoto: true, matches: false };
    expect(preselectVehicle([offA, offB], "a", null)).toEqual({ id: "b", reason: "first" });
  });
  it("aucune photo : rien de présélectionné", () => {
    expect(preselectVehicle([{ id: "a", hasPhoto: false, matches: true }], "a", "a")).toBeNull();
  });
});

describe("suivre une personne (R4.6)", () => {
  it("seulement un compte public, jamais soi-même, jamais un compte indisponible", () => {
    expect(canFollowUser({ isSelf: false, visibility: "public" })).toBe(true);
    expect(canFollowUser({ isSelf: false, visibility: "private" })).toBe(false);
    expect(canFollowUser({ isSelf: true, visibility: "public" })).toBe(false);
    expect(canFollowUser({ isSelf: false, visibility: "public", unavailable: true })).toBe(false);
  });
  it("notification regroupée", () => {
    expect(followNotificationBody(["Kenji_66"], 1)).toBe("Kenji_66 te suit.");
    expect(followNotificationBody(["Kenji_66", "Lea_11"], 2)).toBe("Kenji_66 et Lea_11 te suivent.");
    expect(followNotificationBody(["Kenji_66", "Lea_11"], 4)).toBe("Kenji_66 et 3 autres personnes te suivent.");
  });
});
