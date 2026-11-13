// Petit lot de fin F : `POST /practical` avec `near: "zone"` (la zone regardée sur la carte). Arrondi vers l'extérieur au 0,1°, refus au-delà
// de 60 km, départements qui coupent la zone, lieux DANS la zone (plus de rayon), aucune position journalisée ni envoyée aux sources,
// et compatibilité de l'APK en ligne (les autres modes ne changent pas).
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { call, resetDb, signUp, useClock } from "../../../test/helpers";
import { practicalSources } from "../../../test/practicalStubs";
import { db, pool } from "../../db/client";
import { externalCache } from "../../db/schema";
import { setExternalFetch } from "../../lib/external/cache";
import { resetRateLimits } from "../../lib/rateLimit";

afterAll(async () => {
  await pool.end();
});

const NOW = new Date("2026-10-16T09:00:00Z");
beforeEach(async () => {
  await resetDb();
  await db.delete(externalCache);
  useClock(NOW);
  resetRateLimits();
});
afterEach(() => {
  setExternalFetch(null);
  vi.restoreAllMocks();
});

const data = {
  wash: {
    "66": [
      { name: "Lavage du Port", lat: 42.7101, lon: 2.9012 },
      { name: "La Laveuse", lat: 42.5496, lon: 3.0256 },
      { name: "Lavage de Cerbère", lat: 42.443, lon: 3.163 },
    ],
  },
  fuel: {
    "66": [
      { adresse: "Route de Canet", ville: "Perpignan", cp: "66000", lat: 42.6987, lon: 2.8901 },
      { adresse: "Avenue de la Libération", ville: "Argelès-sur-Mer", cp: "66700", lat: 42.5461, lon: 3.0213 },
    ],
  },
};

const zoneArgelès = { near: "zone", south: 42.43, west: 2.96, north: 42.58, east: 3.07 };

describe("POST /practical : near zone", () => {
  it("arrondit la zone vers l'extérieur au 0,1° et sert les lieux dans la zone, sans origine", async () => {
    const stub = practicalSources(data);
    const u = await signUp("Fan_Zone");
    const res = await call(u, "POST", "/practical", zoneArgelès);
    expect(res.status).toBe(200);
    expect(res.json.origin).toBeNull();
    const names = (res.json.places as { name: string }[]).map((p) => p.name).sort();
    // Argelès (lavage et station) est dans la zone ; Perpignan (au nord) et Cerbère (hors est) n'y sont pas.
    expect(names).toContain("La Laveuse");
    expect(names).not.toContain("Lavage du Port");
    expect(names).not.toContain("Lavage de Cerbère");
    // Les sources ne reçoivent que des codes de département.
    for (const c of stub.calls) {
      expect(c.department).toMatch(/^[0-9][0-9AB]$/);
      expect(decodeURIComponent(`${c.url}\n${c.body}`)).not.toMatch(
        /42\.4|42\.5|2\.96|3\.07|around|latitude|longitude/i,
      );
    }
    expect(new Set(stub.calls.map((c) => c.department)).has("66")).toBe(true);
  });

  it("un bord à l'intérieur d'une case est arrondi vers l'extérieur : un lieu juste au-delà du bord reçu est servi", async () => {
    practicalSources(data);
    const u = await signUp("Fan_Arrondi");
    // Le bord nord reçu (42,5496 - 0,0001) laisserait « La Laveuse » (42,5496) dehors ; arrondi au 0,1° vers le haut (42,6), il est dedans.
    const res = await call(u, "POST", "/practical", {
      near: "zone",
      south: 42.51,
      west: 3.01,
      north: 42.5495,
      east: 3.04,
    });
    expect(res.status).toBe(200);
    expect((res.json.places as { name: string }[]).map((p) => p.name)).toContain("La Laveuse");
  });

  it("refuse une zone de plus de 60 km de côté (une fois arrondie), sans appeler aucune source", async () => {
    const stub = practicalSources(data);
    const u = await signUp("Fan_Grande");
    for (const body of [
      { near: "zone", south: 42.0, west: 2.5, north: 42.7, east: 3.0 },
      { near: "zone", south: 42.5, west: 2.0, north: 42.6, east: 3.0 },
      // 55 km de côté avant l arrondi (49 km à peine), 66 km après : 6 cases de 0,1°.
      { near: "zone", south: 42.395, west: 2.9, north: 42.895, east: 3.0 },
    ]) {
      const res = await call(u, "POST", "/practical", body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect(stub.calls).toHaveLength(0);
  });

  it("refuse une zone mal formée, hors de France ou avec des champs en trop", async () => {
    const stub = practicalSources(data);
    const u = await signUp("Fan_Mal");
    for (const body of [
      { near: "zone", south: 42.6, west: 3.0, north: 42.5, east: 3.1 },
      { near: "zone", south: 42.5, west: 3.1, north: 42.6, east: 3.0 },
      { near: "zone", south: 10, west: 100, north: 10.1, east: 100.1 },
      { near: "zone", south: 42.5, west: 3.0, north: 42.6 },
      { near: "zone", south: 42.5, west: 3.0, north: 42.6, east: 3.1, lat: 42.55 },
      { near: "zone", south: "42.5", west: 3.0, north: 42.6, east: 3.1 },
    ]) {
      const res = await call(u, "POST", "/practical", body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect(stub.calls).toHaveLength(0);
  });

  it("lit les départements qui coupent la zone (deux départements voisins) et jamais plus de douze", async () => {
    const stub = practicalSources({ wash: { "66": [], "11": [] }, fuel: { "66": [], "11": [] } });
    const u = await signUp("Fan_Deps");
    // La zone chevauche le 66 et l'Aude (11) autour de Leucate.
    const res = await call(u, "POST", "/practical", {
      near: "zone",
      south: 42.75,
      west: 2.85,
      north: 42.95,
      east: 3.1,
    });
    expect(res.status).toBe(200);
    const departments = new Set(stub.calls.map((c) => c.department));
    expect(departments.has("66")).toBe(true);
    expect(departments.has("11")).toBe(true);
    expect(departments.size).toBeLessThanOrEqual(12);
  });

  it("aucune position ni zone journalisée", async () => {
    practicalSources(data);
    const logs: string[] = [];
    for (const level of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        logs.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
      });
    }
    const u = await signUp("Fan_Journal");
    await call(u, "POST", "/practical", zoneArgelès);
    for (const line of logs) expect(line).not.toMatch(/42\.43|2\.96|3\.07|42\.58/);
  });

  it("les modes d'avant ne changent pas (APK en ligne) : ville et position servent toujours l'origine et les 30 km", async () => {
    practicalSources(data);
    const u = await signUp("Fan_Ancien");
    const res = await call(u, "POST", "/practical", { near: "position", lat: 42.704937, lng: 2.895412 });
    expect(res.status).toBe(200);
    expect(res.json.origin).toEqual({ kind: "cell", label: "Ma position", lat: 42.7, lng: 2.9 });
    expect(res.json.places.length).toBeGreaterThan(0);
    expect(Object.keys(res.json.places[0]).sort()).toEqual(["address", "id", "kind", "lat", "lng", "name"]);
  });

  it("liste blanche : un lieu de la zone ne porte ni prix ni heure", async () => {
    practicalSources(data);
    const u = await signUp("Fan_Liste");
    const res = await call(u, "POST", "/practical", zoneArgelès);
    for (const p of res.json.places)
      expect(Object.keys(p).sort()).toEqual(["address", "id", "kind", "lat", "lng", "name"]);
  });
});
