// Petit lot de fin, partie D2 : le seed ne pose de faux lieux dans le cache de « Pratique » que pour une source remplacée ou coupée ;
// avec les vraies sources il retire ce qu'il a posé autrefois (contenu exactement le sien), jamais une ligne remplie par une vraie source.
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db, pool } from "../../src/db/client";
import { externalCache } from "../../src/db/schema";
import { DEFAULT_FUEL_API_URL, DEFAULT_OVERPASS_URL } from "../../src/env";
import { resetDb } from "../../test/helpers";
import { homeSeedFuel, homeSeedWash, seedHomeCache } from "./home";
import { practicalSeedFuel, practicalSeedWash, seedPractical } from "./practical";
import { isSeedContent, seedableSources } from "./practical-cache";

afterAll(async () => {
  await pool.end();
});
beforeEach(async () => {
  await resetDb();
  await db.delete(externalCache);
});

const REAL = { OVERPASS_URL: DEFAULT_OVERPASS_URL, FUEL_API_URL: DEFAULT_FUEL_API_URL };
const FAKE = { OVERPASS_URL: "http://127.0.0.1:4898/overpass", FUEL_API_URL: "http://127.0.0.1:4898/fuel" };
const OFF = { OVERPASS_URL: "off", FUEL_API_URL: "off" };
const keys = async () => (await db.select({ key: externalCache.key }).from(externalCache)).map((r) => r.key).sort();

describe("règle pure : quelles listes inventées le seed peut poser", () => {
  it("vraies sources : rien ; faux services ou coupées : la liste de la source concernée", () => {
    expect(seedableSources(REAL)).toEqual({ osm: false, fuel: false });
    expect(seedableSources(FAKE)).toEqual({ osm: true, fuel: true });
    expect(seedableSources(OFF)).toEqual({ osm: true, fuel: true });
    expect(seedableSources({ ...REAL, OVERPASS_URL: "off" })).toEqual({ osm: true, fuel: false });
    expect(seedableSources({ ...REAL, FUEL_API_URL: "http://127.0.0.1:1/fuel" })).toEqual({ osm: false, fuel: true });
  });

  it("une liste est reconnue seulement si ses lieux sont exactement ceux du seed (ordre et prix indifférents)", () => {
    const places = practicalSeedWash.map((p) => ({ ...p })).reverse();
    expect(isSeedContent(places, [practicalSeedWash])).toBe(true);
    expect(isSeedContent(practicalSeedFuel, [practicalSeedFuel, homeSeedFuel])).toBe(true);
    expect(isSeedContent(practicalSeedWash.slice(1), [practicalSeedWash])).toBe(false);
    expect(
      isSeedContent(
        [...practicalSeedWash, { name: "La Laveuse", address: null, lat: 42.7, lng: 2.9 }],
        [practicalSeedWash],
      ),
    ).toBe(false);
    expect(
      isSeedContent([{ ...practicalSeedWash[0], lat: 42.70921 }, ...practicalSeedWash.slice(1)], [practicalSeedWash]),
    ).toBe(false);
    expect(isSeedContent([], [practicalSeedWash])).toBe(false);
    expect(isSeedContent("x", [practicalSeedWash])).toBe(false);
  });
});

describe("seedPractical et seedHomeCache sur une base de test", () => {
  it("faux services ou sources coupées : les listes inventées sont posées (`osm:66`, `fuel2:66`)", async () => {
    await seedHomeCache(FAKE);
    await seedPractical(FAKE);
    expect(await keys()).toEqual(["fuel2:66", "osm:66"]);
    const osm = await db.query.externalCache.findFirst({ where: eq(externalCache.key, "osm:66") });
    expect(isSeedContent(osm?.data, [practicalSeedWash])).toBe(true);
    await db.delete(externalCache);
    await seedPractical(OFF);
    expect(await keys()).toEqual(["fuel2:66", "osm:66"]);
  });

  it("vraies sources : rien n'est posé, et les lignes inventées d'autrefois (`wash:`, `fuel:`, `osm:`, `fuel2:`) sont retirées", async () => {
    const at = new Date();
    await db.insert(externalCache).values([
      { key: "wash:66", fetchedAt: at, data: practicalSeedWash },
      { key: "fuel:66", fetchedAt: at, data: practicalSeedFuel },
      { key: "osm:66", fetchedAt: at, data: practicalSeedWash },
      { key: "fuel2:66", fetchedAt: at, data: homeSeedFuel },
    ]);
    await seedHomeCache(REAL);
    await seedPractical(REAL);
    expect(await keys()).toEqual([]);
    // Rejouable : sans rien à retirer, rien ne plante et rien n'est posé.
    await seedPractical(REAL);
    await seedHomeCache(REAL);
    expect(await keys()).toEqual([]);
  });

  it("une ligne remplie par une vraie source (La Laveuse, même une seule) n'est jamais retirée, ni une ligne d'un autre département", async () => {
    const real = [{ name: "La Laveuse", address: "Perpignan", lat: 42.69, lng: 2.89 }];
    const mixed = [...practicalSeedWash, ...real];
    const at = new Date();
    await db.insert(externalCache).values([
      { key: "osm:66", fetchedAt: at, data: real },
      { key: "wash:66", fetchedAt: at, data: mixed },
      {
        key: "fuel2:66",
        fetchedAt: at,
        data: [{ name: "Station-service", address: "Route d'Elne", lat: 42.6, lng: 2.9 }],
      },
      { key: "osm:11", fetchedAt: at, data: practicalSeedWash },
    ]);
    await seedHomeCache(REAL);
    await seedPractical(REAL);
    expect(await keys()).toEqual(["fuel2:66", "osm:11", "osm:66", "wash:66"]);
  });

  it("une source réelle et l'autre coupée : seule la liste de la source coupée est posée, et seule l'autre est nettoyée", async () => {
    const at = new Date();
    await db.insert(externalCache).values({ key: "osm:66", fetchedAt: at, data: practicalSeedWash });
    await seedPractical({ OVERPASS_URL: DEFAULT_OVERPASS_URL, FUEL_API_URL: "off" });
    expect(await keys()).toEqual(["fuel2:66"]);
    expect(homeSeedWash.length).toBeGreaterThan(0);
  });
});
