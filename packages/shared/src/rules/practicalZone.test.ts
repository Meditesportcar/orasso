// Petit lot de fin F : règles de zone de « Pratique » (arrondi, taille, zone demandée, départements, couverture, texte).
import { describe, expect, it } from "vitest";

import {
  cityNameOf,
  countByKind,
  coverContains,
  departmentsInZone,
  departmentsInZoneInfo,
  elide,
  matchesSearch,
  mergeStore,
  placesInZone,
  placesInZoneInfo,
  roundZoneOutward,
  unloadedBands,
  viewCovered,
  zoneAround,
  zoneContains,
  zoneForRequest,
  zoneInscribedKm,
  zoneRequestTooBig,
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
  it("trop grande : la vue AVANT arrondi dépasse 60 km, quel que soit son calage sur la grille", () => {
    for (let i = 0; i < 40; i++) {
      const centre = { lat: 42.5 + i * 0.0137, lng: 2.9 + i * 0.0291 };
      expect(zoneTooBig(zoneAround(centre, 59.9))).toBe(false);
      expect(zoneTooBig(zoneAround(centre, 60.1))).toBe(true);
    }
    expect(zoneTooBig(zoneAround({ lat: 42.5, lng: 3 }, 8))).toBe(false);
  });
  it("côté serveur : la zone arrondie est acceptée jusqu'à maxCells + 3 cases par axe, refusée au-delà", () => {
    // 60 km au plus avant l'arrondi : toujours accepté, quel que soit le calage.
    for (let i = 0; i < 60; i++) {
      const centre = { lat: 42.4 + i * 0.0113, lng: 2.8 + i * 0.0173 };
      expect(zoneRequestTooBig(roundZoneOutward(zoneAround(centre, 59.9)))).toBe(false);
    }
    expect(zoneRequestTooBig({ south: 42.0, west: 2.9, north: 42.8, east: 3.4 })).toBe(false);
    expect(zoneRequestTooBig({ south: 41.9, west: 2.9, north: 42.8, east: 3.4 })).toBe(true);
    expect(zoneRequestTooBig({ south: 42.5, west: 2.0, north: 42.6, east: 3.2 })).toBe(true);
  });
});

describe("zone demandée", () => {
  it("contient toujours la vue, élargie d'une demi-zone, sans jamais être refusée par l'API (vues de 60 km au plus, tous calages)", () => {
    for (let i = 0; i < 80; i++) {
      const centre = { lat: 42.3 + i * 0.0091, lng: 2.7 + i * 0.0213 };
      for (const km of [4, 8, 20, 40, 59.9]) {
        const view = zoneAround(centre, km, km * 1.1 > 59.9 ? 59.9 : km * 1.1);
        const asked = zoneForRequest(view);
        expect(zoneRequestTooBig(asked), `${km} km en ${i}`).toBe(false);
        for (const lat of [view.south, view.north])
          for (const lng of [view.west, view.east]) expect(zoneContains(asked, { lat, lng })).toBe(true);
      }
    }
    const view = zoneAround({ lat: 42.55, lng: 3.03 }, 8);
    const asked = zoneForRequest(view);
    expect(asked.south).toBeLessThan(view.south);
    expect(asked.north - asked.south).toBeGreaterThan((view.north - view.south) * 1.5);
  });
  it("vie privée : cent positions de la même case donnent exactement la même zone, aux bords multiples de 0,1°", () => {
    const first = zoneForRequest(zoneAround({ lat: 42.7001, lng: 2.9001 }, 8, 9));
    for (let i = 0; i < 100; i++) {
      const p = { lat: 42.7 + ((i * 37) % 100) / 1000.1, lng: 2.9 + ((i * 61) % 100) / 1000.1 };
      expect(zoneForRequest(zoneAround(p, 8, 9)), `${p.lat},${p.lng}`).toEqual(first);
    }
    for (const v of Object.values(first)) expect(Math.abs(v * 10 - Math.round(v * 10))).toBeLessThan(1e-9);
    // Une autre case donne une autre zone (la case reste connue, rien de plus fin).
    expect(zoneForRequest(zoneAround({ lat: 42.81, lng: 2.9 }, 8, 9))).not.toEqual(first);
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
    const fit = fitView(
      [
        { lat: 42.5, lng: 3.0 },
        { lat: 42.55, lng: 3.08 },
      ],
      352,
      400,
    );
    const shown = viewZone(fit, 352, 400);
    expect(zoneContains(shown, { lat: 42.5, lng: 3.0 })).toBe(true);
    expect(zoneContains(shown, { lat: 42.55, lng: 3.08 })).toBe(true);
  });
});

describe("coupes signalées", () => {
  it("plus de douze départements : coupe signalée, jamais en moins en silence", () => {
    const wide = { south: 44.0, west: 0.0, north: 50.0, east: 6.0 };
    const info = departmentsInZoneInfo(wide);
    expect(info.codes).toHaveLength(12);
    expect(info.cut).toBe(true);
    expect(departmentsInZoneInfo({ south: 42.4, west: 2.9, north: 42.6, east: 3.1 }).cut).toBe(false);
  });
  it("250 lieux dans la zone : coupée à 200, rayon couvert borné, jamais toute la zone", () => {
    const z = { south: 48.5, west: 2.0, north: 49.0, east: 2.6 };
    const places = Array.from({ length: 250 }, (_, i) => ({
      id: `p${i}`,
      lat: 48.75 + ((i % 25) - 12) * 0.008 + Math.floor(i / 25) * 0.001,
      lng: 2.3 + (Math.floor(i / 25) - 5) * 0.012,
    }));
    const info = placesInZoneInfo(places, z);
    expect(info.places).toHaveLength(200);
    expect(info.cut).toBe(true);
    expect(info.coveredKm).toBeGreaterThan(0);
    expect(info.coveredKm).toBeLessThanOrEqual(zoneInscribedKm(z));
    const cover = [{ t: "disk" as const, lat: 48.75, lng: 2.3, km: info.coveredKm }];
    expect(viewCovered(cover, { south: 48.55, west: 2.05, north: 48.95, east: 2.55 })).toBe(false);
    expect(placesInZoneInfo(places.slice(0, 100), z).cut).toBe(false);
  });
});
