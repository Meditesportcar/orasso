import { describe, expect, it } from "vitest";

import { departmentCentroids } from "../geo";
import { practicalInput } from "../schemas/practical";
import {
  filterKind,
  formatKm,
  nearestDepartments,
  nearestOfEach,
  PRACTICAL_MAX,
  PRACTICAL_RADIUS_KM,
  type PracticalPlace,
  placesAround,
  practicalKinds,
  practicalPlaceId,
  practicalTitle,
  withDistance,
} from "./practical";

const PERPIGNAN = { lat: 42.7, lng: 2.9 };
const place = (kind: "fuel" | "wash", lat: number, lng: number, extra: Partial<PracticalPlace> = {}): PracticalPlace => ({
  id: practicalPlaceId(kind, lat, lng),
  kind,
  name: kind === "fuel" ? "Station-service" : "Lavage Tech'Auto",
  address: null,
  lat,
  lng,
  ...extra,
});
const UNNAMED = { fuel: "Station-service", wash: "Station de lavage" } as const;

describe("règles de Pratique (R8q)", () => {
  it("deux sortes, rayon de 30 km, 200 lieux au plus", () => {
    expect([...practicalKinds]).toEqual(["fuel", "wash"]);
    expect(PRACTICAL_RADIUS_KM).toBe(30);
    expect(PRACTICAL_MAX).toBe(200);
  });

  it("l'identifiant d'un lieu est stable et dépend de la sorte et de la position", () => {
    expect(practicalPlaceId("fuel", 42.7, 2.9)).toBe(practicalPlaceId("fuel", 42.7, 2.9));
    expect(practicalPlaceId("fuel", 42.7, 2.9)).not.toBe(practicalPlaceId("wash", 42.7, 2.9));
    expect(practicalPlaceId("fuel", 42.7, 2.9)).not.toBe(practicalPlaceId("fuel", 42.70001, 2.9));
  });

  it("les deux départements les plus proches : la limite n'est pas oubliée", () => {
    // Perpignan : le 66, puis l'Aude (11) ou l'Ariège (09) la plus proche, jamais plus de deux.
    const two = nearestDepartments(PERPIGNAN);
    expect(two).toHaveLength(2);
    expect(two[0]).toBe("66");
    expect(nearestDepartments(PERPIGNAN, 1)).toEqual(["66"]);
    // Une position collée au centre du 11 garde le 11 en premier.
    expect(nearestDepartments(departmentCentroids["11"] as { lat: number; lng: number })[0]).toBe("11");
  });

  it("placesAround : rayon, plafond, les plus proches d'abord, sans doublon", () => {
    const near = place("wash", 42.71, 2.9);
    const mid = place("fuel", 42.8, 2.9);
    const far = place("fuel", 43.5, 2.9); // ~89 km
    expect(placesAround([far, mid, near, near], PERPIGNAN).map((p) => p.id)).toEqual([near.id, mid.id]);
    const many = Array.from({ length: 300 }, (_, i) => place("fuel", 42.7 + i * 0.0005, 2.9));
    expect(placesAround(many, PERPIGNAN)).toHaveLength(PRACTICAL_MAX);
    expect(placesAround(many, PERPIGNAN, 30, 5)).toHaveLength(5);
    // Pile au rayon : gardé ; juste au-delà : écarté.
    expect(placesAround([place("fuel", 42.7, 3.2)], PERPIGNAN, 100)).toHaveLength(1);
    expect(placesAround([place("fuel", 42.7, 3.2)], PERPIGNAN, 10)).toHaveLength(0);
  });

  it("withDistance trie par distance, au dixième de km", () => {
    const list = withDistance([place("fuel", 42.8, 2.9), place("wash", 42.71, 2.9)], PERPIGNAN);
    expect(list.map((p) => p.kind)).toEqual(["wash", "fuel"]);
    expect(list[0]?.distanceKm).toBeCloseTo(1.1, 1);
    expect(list[1]?.distanceKm).toBeGreaterThan(list[0]?.distanceKm ?? 0);
    expect(String(list[0]?.distanceKm).split(".")[1]?.length ?? 0).toBeLessThanOrEqual(1);
  });

  it("nearestOfEach : la plus proche de chaque sorte, null quand il n'y en a pas", () => {
    const places = [place("fuel", 42.8, 2.9), place("fuel", 42.72, 2.9), place("wash", 42.9, 2.9)];
    const r = nearestOfEach(places, PERPIGNAN);
    expect(r.fuel?.lat).toBe(42.72);
    expect(r.wash?.lat).toBe(42.9);
    expect(nearestOfEach([place("fuel", 42.8, 2.9)], PERPIGNAN).wash).toBeNull();
    expect(nearestOfEach([], PERPIGNAN)).toEqual({ fuel: null, wash: null });
  });

  it("filterKind : tout, stations-service, lavage", () => {
    const places = [place("fuel", 42.8, 2.9), place("wash", 42.9, 2.9)];
    expect(filterKind(places, "all")).toHaveLength(2);
    expect(filterKind(places, "fuel").map((p) => p.kind)).toEqual(["fuel"]);
    expect(filterKind(places, "wash").map((p) => p.kind)).toEqual(["wash"]);
  });

  it("titres : lavage = son nom OSM ; station = la rue de son adresse, sans numéro", () => {
    expect(practicalTitle(place("wash", 1, 1, { name: "Lavage du Port" }), UNNAMED)).toBe("Lavage du Port");
    expect(practicalTitle(place("wash", 1, 1, { name: "  " }), UNNAMED)).toBe("Station de lavage");
    expect(practicalTitle(place("fuel", 1, 1, { address: "12 rue de la Gare, 66000 Perpignan" }), UNNAMED)).toBe(
      "Rue de la Gare",
    );
    expect(practicalTitle(place("fuel", 1, 1, { address: "12 bis avenue du Vernet, 66000 Perpignan" }), UNNAMED)).toBe(
      "Avenue du Vernet",
    );
    expect(practicalTitle(place("fuel", 1, 1, { address: "Route de Canet, 66140 Canet" }), UNNAMED)).toBe("Route de Canet");
    expect(practicalTitle(place("fuel", 1, 1, { address: null }), UNNAMED)).toBe("Station-service");
    expect(practicalTitle(place("fuel", 1, 1, { address: "66000 Perpignan" }), UNNAMED)).toBe("Station-service");
  });

  it("formatKm : un décimal sous 10 km, espace insécable", () => {
    expect(formatKm(0.8)).toBe("0,8 km");
    expect(formatKm(12.4)).toBe("12 km");
  });

  describe("corps de POST /practical", () => {
    it("position (en France), city, outing", () => {
      expect(practicalInput.safeParse({ near: "position", lat: 42.69, lng: 2.89 }).success).toBe(true);
      expect(practicalInput.safeParse({ near: "city" }).success).toBe(true);
      expect(practicalInput.safeParse({ near: "outing" }).success).toBe(true);
      expect(practicalInput.safeParse({ near: "outing", eventId: "d3b07384-d9a1-4f4e-8a8e-3f0f2d1c9a11" }).success).toBe(true);
    });
    it("hors de France, champ en trop, mauvais identifiant : refusés", () => {
      expect(practicalInput.safeParse({ near: "position", lat: 51.5, lng: -0.12 }).success).toBe(false);
      expect(practicalInput.safeParse({ near: "position", lat: 42.7 }).success).toBe(false);
      expect(practicalInput.safeParse({ near: "city", lat: 42.7, lng: 2.9 }).success).toBe(false);
      expect(practicalInput.safeParse({ near: "outing", eventId: "x" }).success).toBe(false);
      expect(practicalInput.safeParse({ near: "elsewhere" }).success).toBe(false);
    });
  });
});
