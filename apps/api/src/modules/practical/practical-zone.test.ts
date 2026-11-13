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

  it("refuse une zone de plus de 60 km de côté plus l'arrondi, accepte une vue de 60 km au plus, sans appeler de source pour un refus", async () => {
    const stub = practicalSources(data);
    const u = await signUp("Fan_Grande");
    for (const body of [
      // Plus de 8 cases de 0,1° en latitude (60 km plus l'arrondi), ou plus de 10 en longitude.
      { near: "zone", south: 41.9, west: 2.5, north: 42.8, east: 3.0 },
      { near: "zone", south: 42.5, west: 2.0, north: 42.6, east: 3.2 },
      { near: "zone", south: 42.0, west: 2.0, north: 43.5, east: 3.5 },
    ]) {
      const res = await call(u, "POST", "/practical", body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect(stub.calls).toHaveLength(0);
    // Une vue de 59,9 km (arrondie : 8 cases) est acceptée, quel que soit son calage.
    const ok = await call(u, "POST", "/practical", {
      near: "zone",
      south: 42.005,
      west: 2.55,
      north: 42.543,
      east: 3.1,
    });
    expect(ok.status).toBe(200);
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

  it("plus de 200 lieux dans la zone : la coupe est signalée (truncated, partialCells), répartie par case, jamais toute la zone couverte", async () => {
    const wash = Array.from({ length: 250 }, (_, i) => ({
      name: `Lavage ${i}`,
      lat: 42.45 + (i % 25) * 0.011,
      lon: 2.95 + Math.floor(i / 25) * 0.013,
    }));
    practicalSources({ wash: { "66": wash }, fuel: { "66": [] } });
    const u = await signUp("Fan_Coupe");
    const res = await call(u, "POST", "/practical", { near: "zone", south: 42.4, west: 2.9, north: 42.8, east: 3.2 });
    expect(res.status).toBe(200);
    expect(res.json.places).toHaveLength(200);
    expect(res.json.truncated).toBe(true);
    // Répartis par case : les cases dont tous les lieux ne sont pas servis sont listées (pas de rayon en mode zone).
    expect(Array.isArray(res.json.partialCells)).toBe(true);
    expect(res.json.partialCells.length).toBeGreaterThan(0);
    expect(res.json.coveredKm).toBeUndefined();
    // Une zone sans coupe ne porte aucun de ces champs (l'APK en ligne et l'écran n'ont rien de neuf à lire).
    const small = await call(u, "POST", "/practical", { near: "zone", south: 42.4, west: 2.9, north: 42.5, east: 3.0 });
    expect(small.json.truncated).toBeUndefined();
    expect(small.json.coveredKm).toBeUndefined();
  });

  it("la coupe est signalée aussi à l'ouverture (position) : 200 lieux centraux et un lavage à 20 km, le disque couvert ne l'atteint pas", async () => {
    const wash = Array.from({ length: 250 }, (_, i) => ({
      name: `Lavage ${i}`,
      lat: 42.7 + ((i % 25) - 12) * 0.002,
      lon: 2.9 + (Math.floor(i / 25) - 5) * 0.003,
    }));
    wash.push({ name: "Lavage lointain", lat: 42.52, lon: 2.9 });
    practicalSources({ wash: { "66": wash }, fuel: { "66": [] } });
    const u = await signUp("Fan_Ouverture");
    const res = await call(u, "POST", "/practical", { near: "position", lat: 42.7, lng: 2.9 });
    expect(res.status).toBe(200);
    expect(res.json.places).toHaveLength(200);
    expect(res.json.truncated).toBe(true);
    // Le rayon couvert (autour de la case) est celui du dernier lieu gardé : bien en deçà des 20 km du lavage lointain.
    expect(res.json.coveredKm).toBeGreaterThan(0);
    expect(res.json.coveredKm).toBeLessThan(5);
    expect(res.json.places.map((p: { name: string }) => p.name)).not.toContain("Lavage lointain");
  });

  it("zone dense : 220 lieux au centre d'une case et un lavage dans la case voisine, près du coin : le lavage arrive à la première lecture", async () => {
    const wash = Array.from({ length: 220 }, (_, i) => ({
      name: `Lavage ${i}`,
      lat: 42.505 + (i % 20) * 0.00005,
      lon: 2.905 + Math.floor(i / 20) * 0.00005,
    }));
    wash.push({ name: "Lavage du coin", lat: 42.6006, lon: 2.9995 });
    practicalSources({ wash: { "66": wash }, fuel: { "66": [] } });
    const u = await signUp("Fan_Dense");
    const res = await call(u, "POST", "/practical", { near: "zone", south: 42.4, west: 2.8, north: 42.7, east: 3.1 });
    expect(res.status).toBe(200);
    expect(res.json.places).toHaveLength(200);
    expect(res.json.truncated).toBe(true);
    expect(res.json.places.map((p: { name: string }) => p.name)).toContain("Lavage du coin");
    // Seule la case du centre (42,5 à 42,6 N ; 2,9 à 3,0 E) est incomplète.
    expect(res.json.partialCells).toEqual([[425, 29]]);
  });

  it("pagination : neuf cases de 30 lieux (plus de 200 ensemble), le lavage visible arrive à la 2e page par le curseur ; curseur d'une autre zone refusé", async () => {
    const wash: { name: string; lat: number; lon: number }[] = [];
    for (let ci = 0; ci < 3; ci++)
      for (let cj = 0; cj < 3; cj++)
        for (let k = 0; k < 30; k++)
          wash.push({
            name: `L${ci}${cj}-${k}`,
            lat: 42.4 + ci * 0.1 + 0.001 + k * 0.0002,
            lon: 2.8 + cj * 0.1 + 0.001 + k * 0.0002,
          });
    wash.push({ name: "Lavage visible", lat: 42.4 + 0.1 + 0.099, lon: 2.8 + 0.2 + 0.099 });
    practicalSources({ wash: { "66": wash }, fuel: { "66": [] } });
    const u = await signUp("Fan_Pages");
    const zone = { near: "zone", south: 42.4, west: 2.8, north: 42.7, east: 3.1 };
    const first = await call(u, "POST", "/practical", zone);
    expect(first.status).toBe(200);
    expect(first.json.places).toHaveLength(200);
    expect(first.json.truncated).toBe(true);
    expect(typeof first.json.nextCursor).toBe("string");
    expect(first.json.places.map((p: { name: string }) => p.name)).not.toContain("Lavage visible");
    const second = await call(u, "POST", "/practical", { ...zone, cursor: first.json.nextCursor });
    expect(second.status).toBe(200);
    expect(second.json.places).toHaveLength(71);
    expect(second.json.places.map((p: { name: string }) => p.name)).toContain("Lavage visible");
    // Dernière page : la zone est complète, plus de curseur ni de coupe.
    expect(second.json.truncated).toBeUndefined();
    expect(second.json.nextCursor).toBeUndefined();
    expect(second.json.partialCells).toBeUndefined();
    // Aucun lieu en double d'une page à l'autre.
    const names = [...first.json.places, ...second.json.places].map((p: { name: string }) => p.name);
    expect(new Set(names).size).toBe(names.length);
    // Un curseur d'une autre zone, ou illisible, est refusé (400).
    const other = await call(u, "POST", "/practical", {
      ...zone,
      south: 42.5,
      north: 42.8,
      cursor: first.json.nextCursor,
    });
    expect(other.status).toBe(400);
    const junk = await call(u, "POST", "/practical", { ...zone, cursor: "n-importe-quoi" });
    expect(junk.status).toBe(400);
  });

  it("au plus dix pages par zone : la page 10 (indice 10) est refusée, l'indice 9 est servi (la dixième page n'a pas de curseur)", async () => {
    practicalSources({ wash: { "66": [{ name: "Lavage", lat: 42.5, lon: 2.9 }] }, fuel: { "66": [] } });
    const u = await signUp("Fan_Dix");
    const zone = { near: "zone", south: 42.4, west: 2.8, north: 42.7, east: 3.1 };
    const cursorFor = (p: number) => Buffer.from(JSON.stringify({ p, z: "42.4,2.8,42.7,3.1" })).toString("base64url");
    expect((await call(u, "POST", "/practical", { ...zone, cursor: cursorFor(9) })).status).toBe(200);
    expect((await call(u, "POST", "/practical", { ...zone, cursor: cursorFor(10) })).status).toBe(400);
    expect((await call(u, "POST", "/practical", { ...zone, cursor: cursorFor(0) })).status).toBe(400);
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
