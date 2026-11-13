import { describe, expect, it } from "vitest";

import { departmentBounds } from "../departmentBounds";
import { departmentCentroids } from "../geo";
import { practicalInput } from "../schemas/practical";
import {
  departmentsAround,
  filterKind,
  formatKm,
  nearestDepartments,
  nearestOfEach,
  PRACTICAL_DEPARTMENTS_MAX,
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
const place = (
  kind: "fuel" | "wash",
  lat: number,
  lng: number,
  extra: Partial<PracticalPlace> = {},
): PracticalPlace => ({
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
    expect(practicalTitle(place("fuel", 1, 1, { address: "Route de Canet, 66140 Canet" }), UNNAMED)).toBe(
      "Route de Canet",
    );
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
      expect(
        practicalInput.safeParse({ near: "outing", eventId: "d3b07384-d9a1-4f4e-8a8e-3f0f2d1c9a11" }).success,
      ).toBe(true);
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

describe("départements autour d'un point et tri exact (suite R8q)", () => {
  it("Paris : la petite couronne est lue, pas seulement les deux départements aux centres les plus proches", () => {
    const around = departmentsAround({ lat: 48.85, lng: 2.35 });
    for (const code of ["75", "92", "93", "94"]) expect(around, code).toContain(code);
    expect(around.length).toBeGreaterThan(nearestDepartments({ lat: 48.85, lng: 2.35 }).length);
  });

  it("près d'une limite des Pyrénées-Orientales : le département voisin est lu, en rase campagne le nombre reste petit", () => {
    // Côté Aude de la limite avec le 66 (Salses, Leucate) : les deux départements sont dans la zone.
    const border = departmentsAround({ lat: 42.85, lng: 2.85 });
    expect(border).toContain("66");
    expect(border).toContain("11");
    // Au cœur du 66, loin des limites de la zone de 30 km : pas de département inutile des autres régions.
    const inside = departmentsAround({ lat: 42.6, lng: 2.5 });
    expect(inside).toContain("66");
    expect(inside.length).toBeLessThanOrEqual(5);
  });

  it("le plancher des deux plus proches est conservé, sans doublon", () => {
    const point = { lat: 46.6, lng: 2.4 };
    const around = departmentsAround(point);
    for (const code of nearestDepartments(point, 2)) expect(around).toContain(code);
    expect(new Set(around).size).toBe(around.length);
  });

  it("trier sur la distance exacte : deux lieux dans le même dixième de kilomètre restent dans l'ordre exact", () => {
    const from = { lat: 42.7, lng: 2.9 };
    // 0,04 km d'écart (même dixième : 1,0 km), le plus proche est listé en second dans l'entrée.
    const farther = place("fuel", 42.70898, 2.9, { id: "a" });
    const nearer = place("fuel", 42.70862, 2.9, { id: "b" });
    const sorted = withDistance([farther, nearer], from);
    expect(sorted.map((p) => p.id)).toEqual(["b", "a"]);
    expect(sorted[0]?.distanceKm).toBe(sorted[1]?.distanceKm);
    expect(String(sorted[0]?.distanceKm).split(".")[1]?.length ?? 0).toBeLessThanOrEqual(1);
  });
});

describe("emprises des départements et plafond (suite R8q, tour 3)", () => {
  it("les contre-exemples de Codex : près de (49,5 ; 5,5) et de (49,6 ; 5,5), le 54 est lu", () => {
    for (const point of [
      { lat: 49.5, lng: 5.5 },
      { lat: 49.6, lng: 5.5 },
    ]) {
      const around = departmentsAround(point);
      expect(around, JSON.stringify(point)).toContain("54");
      for (const code of ["08", "55", "57"]) expect(around, code).toContain(code);
    }
  });

  it("un département dont l'emprise est hors du carré de recherche n'est pas lu", () => {
    const inside = departmentsAround({ lat: 42.6, lng: 2.5 });
    expect(inside).toContain("66");
    for (const code of ["29", "74", "67", "59"]) expect(inside, code).not.toContain(code);
  });

  it("Paris et la limite 66/11", () => {
    const paris = departmentsAround({ lat: 48.85, lng: 2.35 });
    for (const code of ["75", "92", "93", "94"]) expect(paris, code).toContain(code);
    const border = departmentsAround({ lat: 42.85, lng: 2.85 });
    expect(border).toContain("66");
    expect(border).toContain("11");
  });

  it("plafond de 12 départements, le département du point toujours lu", () => {
    for (const point of [
      { lat: 48.85, lng: 2.35 },
      { lat: 49.5, lng: 5.5 },
      { lat: 47.2, lng: 2.4 },
      { lat: 43.6, lng: 1.44 },
      { lat: 45.76, lng: 4.84 },
    ]) {
      const around = departmentsAround(point);
      expect(around.length).toBeLessThanOrEqual(PRACTICAL_DEPARTMENTS_MAX);
      expect(around).toContain(nearestDepartments(point, 1)[0]);
    }
    // Un très grand rayon dépasse le plafond : la liste reste bornée.
    expect(departmentsAround({ lat: 48.85, lng: 2.35 }, 150).length).toBe(PRACTICAL_DEPARTMENTS_MAX);
  });

  it("les emprises couvrent les 101 départements, chaque centre y est contenu", () => {
    for (const [code, centre] of Object.entries(departmentCentroids)) {
      const box = departmentBounds[code];
      expect(box, code).toBeTruthy();
      const [south, west, north, east] = box as readonly [number, number, number, number];
      // Les centres sont approchés (quelques km) : une marge de 0,1° suffit.
      expect(centre.lat, code).toBeGreaterThanOrEqual(south - 0.1);
      expect(centre.lat, code).toBeLessThanOrEqual(north + 0.1);
      expect(centre.lng, code).toBeGreaterThanOrEqual(west - 0.1);
      expect(centre.lng, code).toBeLessThanOrEqual(east + 0.1);
    }
  });
});

describe("le département qui contient le point n'est jamais écarté (suite R8q, tour 4)", () => {
  it("un point dense, au plafond : 75 reste lu même avec un rayon qui dépasse 12 départements", () => {
    const paris = { lat: 48.8566, lng: 2.3522 };
    for (const radius of [30, 80, 150, 300]) {
      const around = departmentsAround(paris, radius);
      expect(around.length).toBeLessThanOrEqual(PRACTICAL_DEPARTMENTS_MAX);
      expect(around, `rayon ${radius}`).toContain("75");
    }
  });

  it("un point à l'intérieur de l'emprise d'un département le lit, même si le centre d'un voisin est plus proche", () => {
    // Le 94 (Val-de-Marne) : un point à l'est de Vincennes, dans son emprise.
    const point = { lat: 48.79, lng: 2.5 };
    expect(departmentsAround(point, 5)).toContain("94");
  });
});

describe("le département du point : par l'emprise, pas par le centre (suite R8q, tour 5)", () => {
  it("à la limite du 66 et de l'Ariège, le centre le plus proche est celui de l'Ariège (09) mais le point est dans le 66 : l'Ariège n'est pas lue", () => {
    const point = { lat: 42.4, lng: 1.75 };
    expect(nearestDepartments(point, 1)[0]).toBe("09");
    // Un rayon d'un kilomètre : seule l'emprise du 66 contient le point (celle du 09 en est loin au nord).
    const around = departmentsAround(point, 1);
    expect(around).toContain("66");
    expect(around).not.toContain("09");
  });

  it("au plafond, quand beaucoup d'emprises coupent le carré, celle qui contient le point est lue", () => {
    const point = { lat: 48.8566, lng: 2.3522 };
    const around = departmentsAround(point, 300);
    expect(around.length).toBe(PRACTICAL_DEPARTMENTS_MAX);
    expect(around).toContain("75");
  });
});
