import { describe, expect, it } from "vitest";

import { boundingBox, distanceKm, resolvePosition } from "../geo";
import { AFFINITY_NEAR_KM, affinityOf, compareByAffinity } from "./affinity";

describe("score d'affinités (S34)", () => {
  it("organisateur suivi +3, catégorie commune +2 chacune, proche +1", () => {
    expect(affinityOf({ followed: true, commonCategories: 0, distanceKm: null }).score).toBe(3);
    expect(affinityOf({ followed: false, commonCategories: 1, distanceKm: null }).score).toBe(2);
    expect(affinityOf({ followed: false, commonCategories: 3, distanceKm: null }).score).toBe(6);
    expect(affinityOf({ followed: false, commonCategories: 0, distanceKm: 10 }).score).toBe(1);
    expect(affinityOf({ followed: true, commonCategories: 2, distanceKm: 49 }).score).toBe(3 + 4 + 1);
  });

  it("le seuil de 50 km est inclus, au-delà rien", () => {
    expect(affinityOf({ followed: false, commonCategories: 0, distanceKm: AFFINITY_NEAR_KM }).near).toBe(true);
    expect(affinityOf({ followed: false, commonCategories: 0, distanceKm: AFFINITY_NEAR_KM + 0.1 }).score).toBe(0);
  });

  it("position inconnue : aucun point de proximité, jamais d'erreur", () => {
    const a = affinityOf({ followed: false, commonCategories: 0, distanceKm: null });
    expect(a).toEqual({ score: 0, followed: false, commonCategories: 0, near: false });
  });

  it("un nombre de catégories négatif ou décimal est ramené à un entier positif", () => {
    expect(affinityOf({ followed: false, commonCategories: -2, distanceKm: null }).score).toBe(0);
    expect(affinityOf({ followed: false, commonCategories: 1.9, distanceKm: null }).score).toBe(2);
  });

  it("tri : score décroissant, puis date, puis identifiant", () => {
    const list = [
      { id: "c", score: 1, startsAt: "2026-11-01T10:00:00Z" },
      { id: "b", score: 3, startsAt: "2026-12-01T10:00:00Z" },
      { id: "a", score: 3, startsAt: "2026-11-15T10:00:00Z" },
      { id: "d", score: 1, startsAt: "2026-11-01T10:00:00Z" },
      { id: "e", score: 0, startsAt: "2026-10-20T10:00:00Z" },
    ];
    expect([...list].sort(compareByAffinity).map((x) => x.id)).toEqual(["a", "b", "c", "d", "e"]);
  });
});

describe("position et rayon", () => {
  it("la position envoyée par l'appareil prime sur le secteur", () => {
    const r = resolvePosition({ lat: 43.2, lng: 2.9 }, ["66"]);
    expect(r?.source).toBe("device");
    expect(r?.position).toEqual({ lat: 43.2, lng: 2.9 });
  });

  it("sans position envoyée, le centre du premier département du secteur", () => {
    const r = resolvePosition({}, ["66", "11"]);
    expect(r?.source).toBe("sector");
    expect(r?.position.lat).toBeCloseTo(42.6, 0);
  });

  it("ni position ni secteur : rien", () => {
    expect(resolvePosition({}, [])).toBeNull();
    expect(resolvePosition({}, null)).toBeNull();
    expect(resolvePosition({ lat: 43 }, [])).toBeNull();
  });

  it("le rectangle contient tout le cercle", () => {
    const c = { lat: 42.7, lng: 2.9 };
    const box = boundingBox(c, 50);
    const cos = Math.cos((c.lat * Math.PI) / 180);
    for (const bearing of [0, 90, 180, 270, 45, 135]) {
      const rad = (bearing * Math.PI) / 180;
      const p = {
        lat: c.lat + (49 / 111.2) * Math.cos(rad),
        lng: c.lng + (49 / (111.2 * cos)) * Math.sin(rad),
      };
      expect(distanceKm(c, p)).toBeLessThan(50);
      expect(p.lat).toBeGreaterThanOrEqual(box.minLat);
      expect(p.lat).toBeLessThanOrEqual(box.maxLat);
      expect(p.lng).toBeGreaterThanOrEqual(box.minLng);
      expect(p.lng).toBeLessThanOrEqual(box.maxLng);
    }
  });
});
