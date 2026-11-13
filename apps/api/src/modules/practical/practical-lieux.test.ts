// Petit lot de fin D : « Pratique » lit aussi les stations d'OpenStreetMap (`amenity=fuel`) et les stations avec lavage
// (`car_wash=yes`), dans la MÊME requête Overpass que les lavages (aucun appel de plus vers une instance déjà saturée). Le jeu public
// des prix gagne un doublon ; E10 et GPLc comptent ; une panne d'une source laisse l'autre répondre ; la vie privée est inchangée
// (les sources ne reçoivent qu'un code de département). Aucun appel réseau : bouchons de `test/practicalStubs.ts`.
import { HOUR, PRACTICAL_SAME_PLACE_M, practicalTexts } from "@orasso/shared";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { call, resetDb, seedReference, signUp, type TestUser, useClock } from "../../../test/helpers";
import { practicalSources, type StubFuel, type StubWash } from "../../../test/practicalStubs";
import { db, pool } from "../../db/client";
import { externalCache, profiles } from "../../db/schema";
import { setExternalFetch } from "../../lib/external/cache";
import { parseFuel } from "../../lib/external/fuel";
import { overpassQuery, parseOverpass } from "../../lib/external/overpass";
import { resetRateLimits } from "../../lib/rateLimit";

afterAll(async () => {
  await pool.end();
});

const NOW = new Date("2026-11-13T09:00:00Z");
const DAY = 24 * HOUR;
let clock: ReturnType<typeof useClock>;

beforeEach(async () => {
  await resetDb();
  await db.delete(externalCache);
  clock = useClock(NOW);
  await seedReference();
  setExternalFetch(null);
  resetRateLimits();
});
afterEach(() => {
  setExternalFetch(null);
});

async function fan(pseudo: string) {
  const u = await signUp(pseudo);
  await db
    .update(profiles)
    .set({ departments: ["66"] })
    .where(eq(profiles.userId, u.id));
  return u;
}

const PERPIGNAN = { lat: 42.7, lng: 2.9 };
const here = (u: TestUser) => call(u, "POST", "/practical", { near: "position", ...PERPIGNAN });
type Json = { places: { kind: string; name: string; address: string | null; lat: number; lng: number }[] };
const fuels = (r: { json: Json }) => r.json.places.filter((p) => p.kind === "fuel");
const washes = (r: { json: Json }) => r.json.places.filter((p) => p.kind === "wash");

// ~0,00009° de latitude = 10 m.
const m = (meters: number) => meters / 111_200;
const gov: StubFuel = { adresse: "Route de Canet", ville: "Perpignan", cp: "66000", lat: 42.7, lon: 2.9 };
const osmFuel = (over: Partial<StubWash> = {}): StubWash => ({ amenity: "fuel", lat: 42.7, lon: 2.9, ...over });

describe("fusion des stations : jeu public + OpenStreetMap", () => {
  it("un doublon proche (30 m) : une seule station, celle du jeu public ; une station à 150 m : deux", async () => {
    practicalSources({
      fuel: { "66": [gov] },
      wash: {
        "66": [
          osmFuel({ name: "TotalEnergies", lat: 42.7 + m(30) }), // le même lieu : perdu
          osmFuel({
            name: "Station du Vernet",
            lat: 42.7 + m(150),
            addr: { street: "Avenue du Vernet", city: "Perpignan", postcode: "66000" },
          }),
        ],
      },
    });
    const res = await here(await fan("Fan_Doublon"));
    expect(res.status).toBe(200);
    expect(fuels(res)).toHaveLength(2);
    // La station du jeu public garde sa place (adresse du jeu public, nom générique).
    const kept = fuels(res).find((p) => p.address === "Route de Canet, 66000 Perpignan");
    expect(kept?.name).toBe("Station-service");
    // L'autre, seule dans OpenStreetMap, porte son nom et son adresse.
    expect(fuels(res).find((p) => p.name === "Station du Vernet")?.address).toBe("Avenue du Vernet, 66000 Perpignan");
    expect(fuels(res).some((p) => p.name === "TotalEnergies")).toBe(false);
    expect(res.json.partial).toBe(false);
  });

  it("le seuil est celui des règles partagées (60 m) : 55 m fusionnent, 70 m non", async () => {
    expect(PRACTICAL_SAME_PLACE_M).toBe(60);
    practicalSources({
      fuel: { "66": [gov] },
      wash: {
        "66": [
          osmFuel({ name: "Proche", lat: 42.7 + m(55) }),
          osmFuel({ name: "Un peu plus loin", lon: 2.9 + m(70) * 1.35 }),
        ],
      },
    });
    const res = await here(await fan("Fan_Seuil"));
    expect(
      fuels(res)
        .map((p) => p.name)
        .sort(),
    ).toEqual(["Station-service", "Un peu plus loin"]);
  });

  it("station seulement dans OpenStreetMap : nom (`name`, sinon `brand`, sinon le libellé des stations sans nom)", async () => {
    practicalSources({
      wash: {
        "66": [osmFuel({ name: "Station Leclerc" }), osmFuel({ brand: "Avia", lat: 42.71 }), osmFuel({ lat: 42.72 })],
      },
    });
    const res = await here(await fan("Fan_OsmSeul"));
    expect(fuels(res).map((p) => p.name)).toEqual(["Station Leclerc", "Avia", "Station-service"]);
    expect(washes(res)).toHaveLength(0);
    // Seule OpenStreetMap a servi : seule sa source est citée pour les stations.
    expect(res.json.attribution.fuel).toBe(practicalTexts.fuelSourcesOsm);
  });

  it("station seulement dans le jeu public : comme avant, la seule source citée est la sienne", async () => {
    practicalSources({ fuel: { "66": [gov] } });
    const res = await here(await fan("Fan_GovSeul"));
    expect(fuels(res)).toHaveLength(1);
    expect(res.json.attribution.fuel).toContain("data.economie.gouv.fr");
    expect(res.json.attribution.fuel).not.toContain("OpenStreetMap");
  });

  it("les deux sources servent : les deux sont citées", async () => {
    practicalSources({ fuel: { "66": [gov] }, wash: { "66": [osmFuel({ name: "Ailleurs", lat: 42.71 })] } });
    const res = await here(await fan("Fan_DeuxSources"));
    expect(res.json.attribution.fuel).toBe(practicalTexts.fuelSourcesBoth);
    expect(res.json.attribution.wash).toContain("OpenStreetMap");
  });

  it("une station d'OpenStreetMap désaffectée ou privée n'est pas proposée", async () => {
    practicalSources({
      wash: {
        "66": [
          osmFuel({ name: "Fermée", extra: { disused: "yes" } }),
          osmFuel({ name: "Privée", lat: 42.71, extra: { access: "private" } }),
          osmFuel({ name: "Ouverte", lat: 42.72 }),
        ],
      },
    });
    const res = await here(await fan("Fan_Fermees"));
    expect(fuels(res).map((p) => p.name)).toEqual(["Ouverte"]);
  });

  it("liste blanche : ni prix, ni heure, ni la marque interne `as` ne sortent", async () => {
    practicalSources({
      fuel: { "66": [gov] },
      wash: { "66": [osmFuel({ name: "Avec lavage", carWash: true, lat: 42.71 })] },
    });
    const res = await here(await fan("Fan_Blanche"));
    for (const p of res.json.places)
      expect(Object.keys(p).sort()).toEqual(["address", "id", "kind", "lat", "lng", "name"]);
    expect(JSON.stringify(res.json)).not.toContain('"as"');
  });
});

describe("E10 et GPLc", () => {
  it("une station qui ne vend que de l'E10, ou que du GPLc, n'est plus écartée (lecture)", () => {
    const rows = (extra: Record<string, unknown>) => ({
      results: [{ geom: { lat: 42.7, lon: 2.9 }, adresse: "1 rue A", ville: "Perpignan", cp: "66000", ...extra }],
    });
    expect(parseFuel(rows({ e10_prix: 1.913, e10_maj: "2026-11-12T20:01:00+00:00" }))).toHaveLength(1);
    expect(parseFuel(rows({ gplc_prix: 1.099, gplc_maj: "2026-10-29T07:20:17+00:00" }))).toHaveLength(1);
    expect(parseFuel(rows({ e10_prix: 1.913, e10_maj: "2026-11-12T20:01:00+00:00" }))[0]).toMatchObject({
      prices: { e10: 1.913, gplc: null, gazole: null },
      updatedAt: "2026-11-12T20:01:00.000Z",
    });
    // Un prix absurde ne sauve pas une station, et une station sans aucun prix reste écartée.
    expect(parseFuel(rows({ e10_prix: 99 }))).toEqual([]);
    expect(parseFuel(rows({}))).toEqual([]);
  });

  it("de bout en bout : une station du jeu public avec seulement E10 ou seulement GPLc est servie", async () => {
    practicalSources({
      fuel: {
        "66": [
          { ...gov, only: "e10" },
          { ...gov, adresse: "Avenue du Gaz", lat: 42.705, only: "gplc" },
        ],
      },
    });
    const res = await here(await fan("Fan_E10"));
    expect(
      fuels(res)
        .map((p) => p.address)
        .sort(),
    ).toEqual(["Avenue du Gaz, 66000 Perpignan", "Route de Canet, 66000 Perpignan"]);
    expect(JSON.stringify(res.json)).not.toMatch(/1\.913|1\.099|e10|gplc/i);
  });
});

describe("lavages : stations-service avec `car_wash=yes`", () => {
  it("une station avec lavage compte comme une station ET comme un lavage, au nom de la station", async () => {
    practicalSources({
      wash: {
        "66": [
          osmFuel({ name: "Intermarché Station", carWash: true, lat: 42.71 }),
          osmFuel({ name: "Station sans lavage", lat: 42.72 }),
          { name: "Lavage du Port", lat: 42.69, lon: 2.9 },
        ],
      },
    });
    const res = await here(await fan("Fan_Lavage"));
    expect(
      washes(res)
        .map((p) => p.name)
        .sort(),
    ).toEqual(["Intermarché Station", "Lavage du Port"]);
    expect(
      fuels(res)
        .map((p) => p.name)
        .sort(),
    ).toEqual(["Intermarché Station", "Station sans lavage"]);
    // Les deux lieux de la même station ont des identifiants distincts.
    expect(new Set(res.json.places.map((p: { id: string }) => p.id)).size).toBe(4);
  });

  it("station avec lavage sans nom : « Station de lavage » côté lavage, « Station-service » côté station", async () => {
    practicalSources({ wash: { "66": [osmFuel({ carWash: true })] } });
    const res = await here(await fan("Fan_SansNom"));
    expect(washes(res).map((p) => p.name)).toEqual(["Station de lavage"]);
    expect(fuels(res).map((p) => p.name)).toEqual(["Station-service"]);
  });

  it("une station avec lavage à moins de 60 m d'un lavage déjà cartographié n'en fait pas un second", async () => {
    practicalSources({
      wash: {
        "66": [
          { name: "Lavage Total", lat: 42.7, lon: 2.9 },
          osmFuel({ name: "Total", carWash: true, lat: 42.7 + m(30) }),
        ],
      },
    });
    const res = await here(await fan("Fan_Jumeau"));
    expect(washes(res).map((p) => p.name)).toEqual(["Lavage Total"]);
    expect(fuels(res).map((p) => p.name)).toEqual(["Total"]);
  });

  it("lecture : étiquettes d'une station, `car_wash=no` n'est pas un lavage", () => {
    const places = parseOverpass(
      {
        elements: [
          { type: "way", center: { lat: 42.7, lon: 2.9 }, tags: { amenity: "fuel", name: "A", car_wash: "yes" } },
          { type: "node", lat: 42.71, lon: 2.9, tags: { amenity: "fuel", name: "B", car_wash: "no" } },
          { type: "node", lat: 42.72, lon: 2.9, tags: { amenity: "charging_station", name: "C" } },
        ],
      },
      PERPIGNAN,
    );
    expect(places.map((p) => [p.name, p.as])).toEqual([
      ["A", "both"],
      ["B", "fuel"],
    ]);
  });

  it("une seule requête Overpass par département pour les lavages ET les stations", async () => {
    const stub = practicalSources({ fuel: { "66": [gov] }, wash: { "66": [osmFuel({ name: "A", carWash: true })] } });
    const u = await fan("Fan_UneRequete");
    await here(u);
    await here(u);
    expect(stub.count("wash", "66")).toBe(1);
    expect(stub.count("fuel", "66")).toBe(1);
    // Autant d'appels Overpass que de départements lus, jamais un de plus (pas de seconde requête pour les stations).
    expect(stub.count("wash")).toBe(stub.count("fuel"));
    const body = decodeURIComponent(stub.calls.find((c) => c.source === "wash")?.body.replace(/\+/g, " ") ?? "");
    expect(body).toContain('"amenity"="car_wash"');
    expect(body).toContain('"amenity"="fuel"');
    expect(overpassQuery("66")).toContain("[timeout:18]");
  });
});

describe("pannes : une source tombe, l'autre répond", () => {
  const data = { fuel: { "66": [gov] }, wash: { "66": [osmFuel({ name: "Osm", lat: 42.71 })] } };

  it("Overpass en panne (502 « at capacity ») : le jeu public répond, réponse partielle, jamais un 500, pas de relance serrée", async () => {
    const stub = practicalSources(data, {
      failWith: { wash: { status: 502, body: "The server is probably too busy to handle your request. at capacity" } },
    });
    const u = await fan("Fan_502");
    const first = await here(u);
    expect(first.status).toBe(200);
    expect(first.json.partial).toBe(true);
    expect(fuels(first).map((p) => p.address)).toEqual(["Route de Canet, 66000 Perpignan"]);
    expect(first.json.attribution.fuel).toContain("data.economie.gouv.fr");
    expect(stub.count("wash", "66")).toBe(1);
    // Dix minutes sans nouvel appel, plusieurs demandes ou non.
    await here(u);
    await here(u);
    clock.advance(9 * 60_000);
    await here(u);
    expect(stub.count("wash", "66")).toBe(1);
    // Passé le délai, une seule nouvelle tentative.
    clock.advance(2 * 60_000);
    await here(u);
    expect(stub.count("wash", "66")).toBe(2);
  });

  it("Overpass en panne avec un cache périmé tolérable (moins de 30 jours) : le cache est servi, réponse partielle ; au-delà, plus rien", async () => {
    const old = new Date(NOW.getTime() - 10 * DAY);
    await db.insert(externalCache).values({
      key: "osm:66",
      fetchedAt: old,
      data: [{ name: "Station du cache", address: null, lat: 42.71, lng: 2.9, as: "both" }],
    });
    practicalSources({ fuel: { "66": [gov] } }, { failWith: { wash: { status: 502, body: "at capacity" } } });
    const u = await fan("Fan_Cache502");
    const res = await here(u);
    expect(res.status).toBe(200);
    expect(washes(res).map((p) => p.name)).toEqual(["Station du cache"]);
    expect(
      fuels(res)
        .map((p) => p.name)
        .sort(),
    ).toEqual(["Station du cache", "Station-service"]);
    // Le cache a été servi malgré la panne : la réponse est PARTIELLE (l'écran relit plus tard), même si tous les départements ont un cache.
    expect(res.json.partial).toBe(true);
    clock.advance(25 * DAY);
    const gone = await here(u);
    expect(washes(gone)).toHaveLength(0);
    expect(gone.json.partial).toBe(true);
  });

  it("Overpass répond 200 avec une erreur d'exécution (« runtime error ») : liste incomplète, un échec, rien n'est mis en cache", async () => {
    practicalSources(data, { washRemark: 'runtime error: Query timed out in "query" at line 1 after 19 seconds.' });
    const res = await here(await fan("Fan_Remark"));
    expect(res.json.partial).toBe(true);
    expect(fuels(res)).toHaveLength(1);
    expect(await db.query.externalCache.findFirst({ where: eq(externalCache.key, "osm:66") })).toBeUndefined();
  });

  it("le jeu public en panne pendant qu'OpenStreetMap répond : les stations d'OpenStreetMap et les lavages sont servis, partiel", async () => {
    practicalSources(
      {
        fuel: {},
        wash: { "66": [osmFuel({ name: "Osm", lat: 42.71 }), { name: "Lavage du Port", lat: 42.69, lon: 2.9 }] },
      },
      { failWith: { fuel: { status: 503, body: "panne" } } },
    );
    const res = await here(await fan("Fan_GovPanne"));
    expect(res.status).toBe(200);
    expect(res.json.partial).toBe(true);
    expect(fuels(res).map((p) => p.name)).toEqual(["Osm"]);
    expect(washes(res).map((p) => p.name)).toEqual(["Lavage du Port"]);
    expect(res.json.attribution.fuel).toBe(practicalTexts.fuelSourcesOsm);
  });
});

describe("cache", () => {
  it("les deux listes sont sous les clés `osm:<département>` et `fuel:<département>` ; stations 24 h, Overpass 7 jours", async () => {
    const stub = practicalSources({
      fuel: { "66": [gov] },
      wash: { "66": [osmFuel({ name: "A", carWash: true, lat: 42.71 })] },
    });
    const u = await fan("Fan_Cache");
    await here(u);
    const keys = (await db.select({ key: externalCache.key }).from(externalCache)).map((r) => r.key);
    expect(keys.every((k) => /^(osm|fuel):[0-9][0-9AB]$/.test(k))).toBe(true);
    expect(keys).toContain("osm:66");
    expect(keys).not.toContain("wash:66");
    const cached = await db.query.externalCache.findFirst({ where: eq(externalCache.key, "osm:66") });
    expect(cached?.data).toEqual([{ name: "A", address: null, lat: 42.71, lng: 2.9, as: "both" }]);
    clock.advance(2 * DAY);
    await here(u);
    expect(stub.count("fuel", "66")).toBe(2);
    expect(stub.count("wash", "66")).toBe(1);
    clock.advance(6 * DAY);
    await here(u);
    expect(stub.count("wash", "66")).toBe(2);
  });

  it("un ancien cache `wash:` (lavages seulement, sans `as`) se lit toujours : des lavages, aucune station", async () => {
    await db.insert(externalCache).values({
      key: "wash:66",
      fetchedAt: new Date(NOW.getTime() - HOUR),
      data: [{ name: "Ancien lavage", address: null, lat: 42.71, lng: 2.9 }],
    });
    practicalSources({ fuel: { "66": [gov] } });
    const res = await here(await fan("Fan_Ancien"));
    expect(washes(res).map((p) => p.name)).toEqual(["Ancien lavage"]);
    expect(fuels(res)).toHaveLength(1);
  });
});

describe("vie privée : les sources ne reçoivent qu'un code de département", () => {
  it("ni la position ni sa case ne sont dans la requête Overpass ni dans celle du jeu public", async () => {
    const stub = practicalSources({ fuel: { "66": [gov] }, wash: { "66": [osmFuel({ name: "A", carWash: true })] } });
    const u = await fan("Fan_Prive");
    await call(u, "POST", "/practical", { near: "position", lat: 42.6931, lng: 2.8847 });
    expect(stub.calls.length).toBeGreaterThan(0);
    for (const c of stub.calls) {
      const text = decodeURIComponent(`${c.url} ${c.body}`.replace(/\+/g, " "));
      expect(text, c.source).not.toMatch(/42\.69|2\.88|42\.7|2\.9\b/);
      expect(c.department).toMatch(/^[0-9][0-9AB]$/);
    }
  });
});
