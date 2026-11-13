// Petit lot de fin F : règles de zone de « Pratique » (arrondi, taille, zone demandée, départements, couverture, texte).
import { describe, expect, it } from "vitest";

import {
  cityNameOf,
  countByKind,
  coverContains,
  departmentsInZone,
  elide,
  matchesSearch,
  mergeStore,
  placesInZone,
  roundZoneOutward,
  unloadedBands,
  viewCovered,
  zoneForRequest,
  zoneSizeKm,
  zoneTooBig,
} from "./practicalZone";

describe("arrondi et taille", () => {
  it("arrondit vers l'extérieur au 0,1° (sud et ouest vers le bas, nord et est vers le haut)", () => {
    expect(roundZoneOutward({ south: 42.41, west: 2.96, north: 42.49, east: 3.01 })).toEqual({
      south: 42.4,
      west: 2.9,
      north: 42.5,
      east: 3.1,
    });
    expect(roundZoneOutward({ south: 42.3, west: 2.9, north: 42.6, east: 3.2 })).toEqual({
      south: 42.3,
      west: 2.9,
      north: 42.6,
      east: 3.2,
    });
    expect(roundZoneOutward({ south: -0.04, west: -0.01, north: 0.01, east: 0.04 })).toEqual({
      south: -0.1,
      west: -0.1,
      north: 0.1,
      east: 0.1,
    });
  });
  it("trop grande au-delà de 60 km une fois arrondie", () => {
    expect(zoneTooBig({ south: 42.4, west: 2.9, north: 42.9, east: 3.4 })).toBe(false);
    expect(zoneTooBig({ south: 42.395, west: 2.9, north: 42.895, east: 3.4 })).toBe(true);
    expect(zoneTooBig({ south: 42.5, west: 2.0, north: 42.6, east: 3.0 })).toBe(true);
    const size = zoneSizeKm({ south: 42.4, west: 2.9, north: 42.9, east: 3.4 });
    expect(size.height).toBeLessThanOrEqual(60);
    expect(size.width).toBeLessThanOrEqual(60);
  });
});

describe("zone demandée", () => {
  it("élargit d'une demi-zone de chaque côté sans dépasser 60 km, jamais refusée par l'API", () => {
    const view = { south: 42.52, west: 2.99, north: 42.58, east: 3.07 };
    const asked = zoneForRequest(view);
    expect(zoneTooBig(asked)).toBe(false);
    expect(asked.south).toBeLessThanOrEqual(42.5);
    expect(asked.north).toBeGreaterThanOrEqual(42.6);
    expect(asked.west).toBeLessThan(2.99);
    expect(asked.east).toBeGreaterThan(3.07);
    const wide = zoneForRequest({ south: 42.4, west: 2.9, north: 42.9, east: 3.4 });
    expect(zoneTooBig(wide)).toBe(false);
    // La latitude est déjà à 5 cases (le maximum à 60 km) : elle ne grandit pas ; la longitude gagne une case de chaque côté.
    expect(wide).toEqual({ south: 42.4, west: 2.8, north: 42.9, east: 3.5 });
  });
  it("tous les bords sont des multiples de 0,1°", () => {
    const a = zoneForRequest({ south: 42.5234, west: 2.9123, north: 42.5811, east: 3.0467 });
    for (const v of Object.values(a)) expect(Math.abs(v * 10 - Math.round(v * 10))).toBeLessThan(1e-9);
  });
});

describe("départements et lieux de la zone", () => {
  it("les départements qui coupent la zone, douze au plus", () => {
    expect(departmentsInZone({ south: 42.4, west: 2.9, north: 42.6, east: 3.1 })).toContain("66");
    const chevauche = departmentsInZone({ south: 42.75, west: 2.85, north: 42.95, east: 3.1 });
    expect(chevauche).toContain("66");
    expect(chevauche).toContain("11");
    expect(departmentsInZone({ south: 48.5, west: 2.0, north: 49.0, east: 2.6 }).length).toBeLessThanOrEqual(12);
  });
  it("garde les lieux dans la zone, sans doublon, les plus proches du centre d'abord, plafonnés", () => {
    const z = { south: 42.4, west: 2.9, north: 42.6, east: 3.1 };
    const places = [
      { id: "a", lat: 42.5, lng: 3.0 },
      { id: "a", lat: 42.5, lng: 3.0 },
      { id: "b", lat: 42.41, lng: 2.91 },
      { id: "c", lat: 43.0, lng: 3.0 },
    ];
    expect(placesInZone(places, z).map((p) => p.id)).toEqual(["a", "b"]);
    expect(placesInZone(places, z, 1).map((p) => p.id)).toEqual(["a"]);
  });
});

describe("couverture", () => {
  const cover = [{ t: "disk" as const, lat: 42.7, lng: 2.9, km: 30 }];
  it("un disque et un carré couvrent ce qui est dedans ; la vue sortie du chargé ne l'est plus", () => {
    expect(coverContains(cover, { lat: 42.7, lng: 3.0 })).toBe(true);
    expect(coverContains(cover, { lat: 42.4, lng: 3.2 })).toBe(false);
    expect(viewCovered(cover, { south: 42.68, west: 2.88, north: 42.72, east: 2.92 })).toBe(true);
    expect(viewCovered(cover, { south: 42.45, west: 3.05, north: 42.55, east: 3.15 })).toBe(false);
    const withRect = [...cover, { t: "rect" as const, zone: { south: 42.3, west: 3.0, north: 42.6, east: 3.3 } }];
    expect(viewCovered(withRect, { south: 42.45, west: 3.05, north: 42.55, east: 3.15 })).toBe(true);
  });
  it("le voile : des bandes seulement hors de ce qui est chargé", () => {
    const bands = unloadedBands(cover, { south: 42.45, west: 3.05, north: 42.55, east: 3.15 });
    expect(bands.length).toBeGreaterThan(0);
    for (const b of bands)
      expect(coverContains(cover, { lat: (b.south + b.north) / 2, lng: (b.west + b.east) / 2 })).toBe(false);
    expect(unloadedBands(cover, { south: 42.69, west: 2.89, north: 42.71, east: 2.91 }, 0)).toEqual([]);
  });
});

describe("texte et libellés", () => {
  it("cherche sans accents ni majuscules", () => {
    expect(matchesSearch("La Laveuse", "laveuse")).toBe(true);
    expect(matchesSearch("Avenue de la Libération", "liberation")).toBe(true);
    expect(matchesSearch("Lavage du Port", "pneus")).toBe(false);
    expect(matchesSearch("Lavage du Port", "  ")).toBe(true);
  });
  it("nom de commune et élision", () => {
    expect(cityNameOf("Argelès-sur-Mer (66)")).toBe("Argelès-sur-Mer");
    expect(cityNameOf("Ajaccio (2A)")).toBe("Ajaccio");
    expect(elide("Argelès-sur-Mer")).toBe("d'Argelès-sur-Mer");
    expect(elide("Canet-en-Roussillon")).toBe("de Canet-en-Roussillon");
    expect(elide("Le Boulou")).toBe("du Boulou");
    expect(elide("Les Angles")).toBe("des Angles");
  });
  it("la mémoire de l'écran : sans doublon, le dernier reçu gagne", () => {
    const a = mergeStore(new Map(), [
      { id: "x", v: 1 },
      { id: "y", v: 1 },
    ]);
    const b = mergeStore(a, [{ id: "x", v: 2 }]);
    expect(b.size).toBe(2);
    expect(b.get("x")?.v).toBe(2);
    expect(countByKind([{ kind: "fuel" }, { kind: "wash" }, { kind: "fuel" }])).toEqual({ fuel: 2, wash: 1 });
  });
});

describe("vue de la carte", () => {
  it("une carte de 8 km de large autour d'Argelès : la zone a bien 8 km de large et contient son centre", async () => {
    const { viewZone, zoomForWidthKm, fitView, zoneSizeKm, zoneContains } = await import("./practicalZone");
    const centre = { lat: 42.5496, lng: 3.0256 };
    const zoom = zoomForWidthKm(centre.lat, 8, 352);
    const z = viewZone({ ...centre, zoom }, 352, 400);
    expect(zoneSizeKm(z).width).toBeGreaterThan(7.8);
    expect(zoneSizeKm(z).width).toBeLessThan(8.2);
    expect(zoneContains(z, centre)).toBe(true);
    // Reprise d'une zone connue : le zoom 11,4 de la maquette montre environ 7,5 km sur 352 px.
    expect(zoom).toBeGreaterThan(11);
    expect(zoom).toBeLessThan(12.5);
    const fit = fitView([{ lat: 42.5, lng: 3.0 }, { lat: 42.55, lng: 3.08 }], 352, 400);
    const shown = viewZone(fit, 352, 400);
    expect(zoneContains(shown, { lat: 42.5, lng: 3.0 })).toBe(true);
    expect(zoneContains(shown, { lat: 42.55, lng: 3.08 })).toBe(true);
  });
});
