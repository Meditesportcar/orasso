// Petit lot de fin D, tour 1 : rapprochement par la référence `ref:FR:prix-carburants`, regroupement des objets d'OpenStreetMap,
// rapprochements faits après l'agrégation des départements, clé de cache `osm:`, délai et recul propres à Overpass, repli sur un
// ancien cache = réponse partielle, aucun nouveau prix dans l'Accueil. Aucun appel réseau : bouchons de `test/practicalStubs.ts`
// et un extrait anonyme de réponses réelles du 66 (`test/fixtures/practical-66-extrait.json`).
import { readFileSync } from "node:fs";
import { HOUR, nearestDepartments, practicalTexts } from "@orasso/shared";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { call, resetDb, seedReference, signUp, type TestUser, useClock, viewerOf } from "../../../test/helpers";
import { practicalSources, type StubFuel, type StubWash } from "../../../test/practicalStubs";
import { db, pool } from "../../db/client";
import { externalCache, profiles } from "../../db/schema";
import { setExternalFetch } from "../../lib/external/cache";
import { parseFuel } from "../../lib/external/fuel";
import { OVERPASS_TIMEOUT_MS, parseOverpass } from "../../lib/external/overpass";
import { groupOsmStations, isOsmFuel, mergeStations, type OsmEntry, washPlaces } from "../../lib/external/places";
import { resetRateLimits } from "../../lib/rateLimit";
import { nearbyStations } from "../home/service";
import { practicalService } from "./service";

afterAll(async () => {
  await pool.end();
});

const NOW = new Date("2026-11-13T09:00:00Z");
const DAY = 24 * HOUR;
const MIN = 60_000;
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
  vi.restoreAllMocks();
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
type Json = { places: { kind: string; name: string; address: string | null }[] };
const fuels = (r: { json: Json }) => r.json.places.filter((p) => p.kind === "fuel");
const washes = (r: { json: Json }) => r.json.places.filter((p) => p.kind === "wash");
/** Comme `here`, avec un budget large : plusieurs départements se chargent l'un après l'autre (Overpass, un appel à la fois). */
const hereLong = async (u: TestUser) => {
  const data = await practicalService.get(
    await viewerOf(u),
    { near: "position", cell: { lat: 42.7, lng: 2.9, key: "42.7,2.9" } },
    20_000,
  );
  return { json: data };
};
const m = (meters: number) => meters / 111_200;
const station = (over: Partial<StubFuel> = {}): StubFuel => ({
  adresse: "Route de Canet",
  ville: "Perpignan",
  cp: "66000",
  lat: 42.7,
  lon: 2.9,
  ...over,
});
const osm = (over: Partial<StubWash> = {}): StubWash => ({ amenity: "fuel", lat: 42.7, lon: 2.9, ...over });

const fixture = JSON.parse(
  readFileSync(new URL("../../../test/fixtures/practical-66-extrait.json", import.meta.url), "utf8"),
);

describe("extrait réaliste du 66 (réponses réelles du 13/11, anonymisées)", () => {
  const gov = parseFuel(fixture.gov);
  const entries = parseOverpass(fixture.osm, { lat: 42.6, lng: 2.5 });
  const merged = mergeStations(gov, entries.filter(isOsmFuel));

  it("la référence rapproche une station à 193 m (« Super U » et « Grande Rocade ») : une seule station, la marque est donnée", () => {
    const stations = merged.stations.filter((s) => s.address?.includes("Grande Rocade"));
    expect(stations).toHaveLength(1);
    expect(stations[0]).toMatchObject({ name: "Super U", fromGov: true, fromOsm: true });
    expect(merged.stations.some((s) => s.address === null && s.name === "Super U")).toBe(false);
  });

  it("un nœud et ses trois objets d'auvent (à 15, 16 et 33 m, dont deux sans nom) : une seule station", () => {
    expect(
      groupOsmStations(entries.filter(isOsmFuel).filter((e) => e.lng > 2.99 && e.lat > 42.778 && e.lat < 42.78)),
    ).toHaveLength(1);
    expect(merged.stations.filter((s) => s.name === "Total Access")).toHaveLength(1);
  });

  it("deux stations publiques à 42 m l'une de l'autre (Le Barcarès) : deux stations, chacune garde la marque de SA référence", () => {
    const barcares = merged.stations.filter((s) => s.address?.toLowerCase().includes("14 juillet"));
    expect(barcares.map((s) => [s.address, s.name]).sort()).toEqual([
      ["BOULEVARD DU 14 JUILLET, 66420 Le Barcarès", "Montaner et Fils"],
      ["Boulevard du 14 Juillet, 66420 Le Barcarès", "Système U"],
    ]);
  });

  it("le total : six stations publiques + une station seulement dans OpenStreetMap ; trois lavages", () => {
    expect(gov).toHaveLength(6);
    expect(merged.stations).toHaveLength(7);
    expect(merged.stations.filter((s) => !s.fromGov).map((s) => s.name)).toEqual(["Aire des Fenouillèdes"]);
    // Une station publique sans équivalent OpenStreetMap reste telle quelle, sans nom inventé.
    expect(merged.stations.find((s) => s.address?.includes("Vernet"))).toMatchObject({
      name: "Station-service",
      fromOsm: false,
    });
    // Lavages : deux `amenity=car_wash` + la station Intermarché avec lavage (aucun lavage cartographié à côté).
    const w = washPlaces(entries, merged.groups);
    expect(w).toHaveLength(3);
    expect(w.map((p) => p.name)).toContain("Intermarché");
  });

  it("E10 seul ou GPLc seul : les stations de l'extrait ne sont pas écartées", () => {
    expect(gov.find((g) => g.ref === "66700001")?.prices).toMatchObject({ e10: 1.919, gazole: null });
    expect(gov.find((g) => g.ref === "66000099")?.prices).toMatchObject({ gplc: 1.099, gazole: null });
  });
});

describe("règles de rapprochement", () => {
  const g = (ref: string | undefined, lat: number, name = "Station-service") => ({
    name,
    address: "rue",
    lat,
    lng: 2.9,
    ...(ref ? { ref } : {}),
  });
  const o = (ref: string | undefined, lat: number, name: string): OsmEntry => ({
    name,
    address: null,
    lat,
    lng: 2.9,
    as: "fuel",
    ...(ref ? { ref } : {}),
  });

  it("par la référence : quelle que soit la distance (1 km) ; sans référence : 60 m seulement, et sans nom donné", () => {
    expect(mergeStations([g("7", 42.7)], [o("7", 42.7 + m(1000), "Total")]).stations).toMatchObject([
      { name: "Total" },
    ]);
    expect(mergeStations([g("7", 42.7)], [o("7", 42.7 + m(1000), "Total")]).stations).toHaveLength(1);
    const byDistance = mergeStations([g(undefined, 42.7)], [o(undefined, 42.7 + m(40), "Total")]).stations;
    expect(byDistance).toHaveLength(1);
    expect(byDistance[0]?.name).toBe("Station-service");
    expect(mergeStations([g(undefined, 42.7)], [o(undefined, 42.7 + m(80), "Total")]).stations).toHaveLength(2);
  });

  it("deux stations qui ont chacune leur référence (différentes) à 20 m : deux stations, jamais une", () => {
    expect(mergeStations([g("1", 42.7)], [o("2", 42.7 + m(20), "Autre")]).stations).toHaveLength(2);
  });

  it("une ancienne liste du jeu public sans référence se lit par la distance", () => {
    const merged = mergeStations([g(undefined, 42.7)], [o("9", 42.7 + m(30), "Total")]);
    expect(merged.stations).toHaveLength(1);
  });

  it("regroupement des objets d'OpenStreetMap : même référence ; ≤ 35 m dont l'un sans nom ; deux stations nommées à 20 m restent deux", () => {
    expect(groupOsmStations([o("5", 42.7, "A"), o("5", 42.7 + m(300), "A")])).toHaveLength(1);
    expect(groupOsmStations([o(undefined, 42.7, "Total"), o(undefined, 42.7 + m(30), "Station-service")])).toHaveLength(
      1,
    );
    expect(groupOsmStations([o(undefined, 42.7, "Total"), o(undefined, 42.7 + m(36), "Station-service")])).toHaveLength(
      2,
    );
    expect(groupOsmStations([o(undefined, 42.7, "Total"), o(undefined, 42.7 + m(20), "Avia")])).toHaveLength(2);
    expect(groupOsmStations([o("1", 42.7, "A"), o("2", 42.7 + m(5), "Station-service")])).toHaveLength(2);
    // Le groupe garde la référence, le nom et la lavage d'un de ses membres.
    const group = groupOsmStations([
      { ...o(undefined, 42.7, "Station-service"), as: "both" },
      o("5", 42.7 + m(10), "Total"),
    ])[0];
    expect(group).toMatchObject({ name: "Total", ref: "5", as: "both" });
  });
});

describe("POST /practical : le rapprochement après l'agrégation des départements", () => {
  it("deux lavages représentant le même lieu (30 m), l'un dans chaque département voisin : un seul lavage", async () => {
    const [first, second] = nearestDepartments(PERPIGNAN) as [string, string];
    practicalSources({
      wash: {
        [first]: [{ name: "Lavage de la limite", lat: 42.7, lon: 2.91 }],
        [second]: [osm({ name: "Station de la limite", carWash: true, lat: 42.7 + m(30), lon: 2.91 })],
      },
    });
    const res = await hereLong(await fan("Fan_LimiteLavage"));
    expect(washes(res).map((p) => p.name)).toEqual(["Lavage de la limite"]);
    expect(fuels(res).map((p) => p.name)).toEqual(["Station de la limite"]);
  });

  it("deux stations (jeu public d'un département, OpenStreetMap du voisin) à 30 m : une seule station", async () => {
    const [first, second] = nearestDepartments(PERPIGNAN) as [string, string];
    practicalSources({
      fuel: { [first]: [station({ lat: 42.7, lon: 2.91 })] },
      wash: { [second]: [osm({ name: "Voisine", lat: 42.7 + m(30), lon: 2.91 })] },
    });
    const res = await hereLong(await fan("Fan_LimiteStation"));
    expect(fuels(res)).toHaveLength(1);
  });
});

describe("POST /practical : rapprochement par la référence, de bout en bout", () => {
  it("une station du jeu public et sa jumelle d'OpenStreetMap à 200 m, même référence : une seule station, la marque d'OpenStreetMap", async () => {
    practicalSources({
      fuel: { "66": [station({ id: 66000007 })] },
      wash: { "66": [osm({ name: "Super U", ref: "66000007", lat: 42.7 + m(200) })] },
    });
    const res = await here(await fan("Fan_Ref"));
    expect(fuels(res)).toHaveLength(1);
    expect(fuels(res)[0]).toMatchObject({ name: "Super U", address: "Route de Canet, 66000 Perpignan" });
    expect(res.json.attribution.fuel).toBe(practicalTexts.fuelSourcesBoth);
  });

  it("Le Barcarès : deux stations publiques à 42 m, une station OpenStreetMap qui porte la référence de la seconde", async () => {
    practicalSources({
      fuel: {
        "66": [
          station({ id: 1, adresse: "Boulevard A", lat: 42.7 }),
          station({ id: 2, adresse: "Boulevard B", lat: 42.7 + m(42) }),
        ],
      },
      wash: { "66": [osm({ name: "Système U", ref: "2", lat: 42.7 + m(400) })] },
    });
    const res = await here(await fan("Fan_Barcares"));
    expect(
      fuels(res)
        .map((p) => [p.address, p.name])
        .sort(),
    ).toEqual([
      ["Boulevard A, 66000 Perpignan", "Station-service"],
      ["Boulevard B, 66000 Perpignan", "Système U"],
    ]);
  });

  it("un nœud nommé et deux objets d'auvent sans nom : une seule station", async () => {
    practicalSources({
      wash: {
        "66": [osm({ name: "Total Access" }), osm({ lat: 42.7 + m(13), extra: {} }), osm({ lat: 42.7 + m(31) })],
      },
    });
    const res = await here(await fan("Fan_Auvent"));
    expect(fuels(res).map((p) => p.name)).toEqual(["Total Access"]);
  });
});

describe("cache `osm:` et ancienne ligne `wash:`", () => {
  it("un ancien cache `wash:` encore frais (1 jour) ne dispense pas de charger `osm:` : les stations d'OpenStreetMap arrivent tout de suite", async () => {
    await db.insert(externalCache).values({
      key: "wash:66",
      fetchedAt: new Date(NOW.getTime() - DAY),
      data: [{ name: "Ancien lavage", address: null, lat: 42.71, lng: 2.9 }],
    });
    const stub = practicalSources({ wash: { "66": [osm({ name: "Nouvelle station", carWash: true, lat: 42.72 })] } });
    const res = await here(await fan("Fan_Migration"));
    expect(stub.count("wash", "66")).toBe(1);
    expect(fuels(res).map((p) => p.name)).toEqual(["Nouvelle station"]);
    // Une liste `osm:` actuelle fait foi : l'ancienne ligne `wash:` ne complète rien (elle reste en place, intacte).
    expect(washes(res).map((p) => p.name)).toEqual(["Nouvelle station"]);
    const old = await db.query.externalCache.findFirst({ where: eq(externalCache.key, "wash:66") });
    expect(old?.data).toEqual([{ name: "Ancien lavage", address: null, lat: 42.71, lng: 2.9 }]);
  });

  it("l'ancienne ligne `wash:` ne s'ajoute pas à `osm:` : lavage déplacé de 20 m, renommé, supprimé, ou `osm:` vide", async () => {
    await db.insert(externalCache).values({
      key: "wash:66",
      fetchedAt: new Date(NOW.getTime() - HOUR),
      data: [
        { name: "Déplacé", address: null, lat: 42.71, lng: 2.9 },
        { name: "Ancien nom", address: null, lat: 42.72, lng: 2.9 },
        { name: "Supprimé", address: null, lat: 42.73, lng: 2.9 },
      ],
    });
    practicalSources({
      wash: {
        "66": [
          { name: "Déplacé", lat: 42.71 + m(20), lon: 2.9 },
          { name: "Nouveau nom", lat: 42.72, lon: 2.9 },
        ],
      },
    });
    const res = await here(await fan("Fan_AncienOsm"));
    expect(
      washes(res)
        .map((p) => p.name)
        .sort(),
    ).toEqual(["Déplacé", "Nouveau nom"]);
    // Une liste `osm:` actuelle vide fait foi aussi.
    await db.delete(externalCache).where(eq(externalCache.key, "osm:66"));
    await db.insert(externalCache).values({ key: "osm:66", fetchedAt: new Date(NOW.getTime() - HOUR), data: [] });
    expect(washes(await here(await fan("Fan_AncienVide")))).toHaveLength(0);
  });

  it("Overpass en panne, seulement l'ancienne ligne `wash:` (3 jours) : ses lavages sont servis, jamais des stations ; partiel", async () => {
    await db.insert(externalCache).values({
      key: "wash:66",
      fetchedAt: new Date(NOW.getTime() - 3 * DAY),
      data: [{ name: "Ancien lavage", address: null, lat: 42.71, lng: 2.9 }],
    });
    practicalSources({}, { failWith: { wash: { status: 502, body: "at capacity" } } });
    const res = await here(await fan("Fan_AncienPanne"));
    expect(washes(res).map((p) => p.name)).toEqual(["Ancien lavage"]);
    expect(fuels(res)).toHaveLength(0);
    expect(res.json.partial).toBe(true);
  });

  it("une ligne `osm:` récente n'est jamais lue comme des lavages par l'Accueil (stations exclues)", async () => {
    await db.insert(externalCache).values({
      key: "osm:66",
      fetchedAt: new Date(NOW.getTime() - HOUR),
      data: [{ name: "Une station", address: null, lat: 42.71, lng: 2.9, as: "fuel" }],
    });
    const { washNear } = await import("../../lib/external/overpass");
    practicalSources({});
    expect(await washNear("66")).toEqual([]);
  });
});

describe("regroupement : un objet sans nom ne relie jamais deux stations distinctes", () => {
  const o = (ref: string | undefined, lat: number, name: string): OsmEntry => ({
    name,
    address: null,
    lat,
    lng: 2.9,
    as: "fuel",
    ...(ref ? { ref } : {}),
  });
  it("A (référence a), un objet anonyme à 21 m, B (référence b) à 42 m : l'anonyme rejoint le plus proche, B reste seule avec son lavage", () => {
    const a = { ...o("a", 42.7, "Station A") };
    const anon = o(undefined, 42.7 + m(21), "Station-service");
    const b = { ...o("b", 42.7 + m(42), "Station B"), as: "both" as const };
    const groups = groupOsmStations([a, anon, b]);
    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.ref === "a")).toMatchObject({ name: "Station A", as: "fuel" });
    expect(groups.find((g) => g.ref === "b")).toMatchObject({ name: "Station B", as: "both" });
    // Même résultat quel que soit l'ordre d'arrivée.
    expect(groupOsmStations([b, anon, a])).toHaveLength(2);
  });

  it("deux stations nommées différemment, sans référence, reliées par un objet anonyme : deux stations", () => {
    const groups = groupOsmStations([
      o(undefined, 42.7, "Total"),
      o(undefined, 42.7 + m(20), "Station-service"),
      o(undefined, 42.7 + m(40), "Avia"),
    ]);
    expect(groups.map((g) => g.name).sort()).toEqual(["Avia", "Total"]);
  });

  it("une station et ses objets d'auvent (même nom ou sans nom) restent une seule station", () => {
    expect(
      groupOsmStations([
        o(undefined, 42.7, "Total"),
        o(undefined, 42.7 + m(10), "total"),
        o(undefined, 42.7 + m(25), "Station-service"),
      ]),
    ).toHaveLength(1);
  });
});

describe("anciennes lignes `fuel:` (sans référence)", () => {
  it("seulement l'ancienne ligne `fuel:` : ses stations sont servies par la distance, la réponse est partielle ; `fuel2:` fait foi dès qu'elle existe", async () => {
    await db.insert(externalCache).values({
      key: "fuel:66",
      fetchedAt: new Date(NOW.getTime() - 2 * HOUR),
      data: [
        {
          name: "Station-service",
          address: "Route d'avant, 66000 Perpignan",
          lat: 42.7,
          lng: 2.9,
          prices: {},
          updatedAt: null,
        },
      ],
    });
    practicalSources({}, { failWith: { fuel: { status: 503, body: "panne" } } });
    const u = await fan("Fan_AncienFuel");
    const old = await here(u);
    expect(fuels(old).map((p) => p.address)).toEqual(["Route d'avant, 66000 Perpignan"]);
    expect(old.json.partial).toBe(true);
    // Le jeu public revient : `fuel2:` est écrite et l'ancienne ligne ne compte plus.
    practicalSources({ fuel: { "66": [station({ adresse: "Route du jour", lat: 42.71 })] } });
    clock.advance(11 * MIN);
    const fresh = await here(u);
    expect(fuels(fresh).map((p) => p.address)).toEqual(["Route du jour, 66000 Perpignan"]);
    expect(fresh.json.partial).toBe(false);
    expect(await db.query.externalCache.findFirst({ where: eq(externalCache.key, "fuel2:66") })).toBeDefined();
  });
});

describe("chargement lent : deux départements en parallèle, `loading`", () => {
  it("deux départements lents : deux appels Overpass en même temps (jamais trois), `loading` tant que ça charge, puis complet", async () => {
    const stub = practicalSources({}, { delayMs: 400 });
    const u = await fan("Fan_Parallele");
    const first = await practicalService.get(
      await viewerOf(u),
      { near: "position", cell: { lat: 42.7, lng: 2.9, key: "42.7,2.9" } },
      80,
    );
    expect(first.loading).toBe(true);
    expect(first.partial).toBe(true);
    let rows = 0;
    for (let i = 0; i < 40 && rows < 2; i++) {
      await new Promise((r) => setTimeout(r, 100));
      rows = (await db.select().from(externalCache)).filter((r) => r.key.startsWith("osm:")).length;
    }
    expect(rows).toBeGreaterThanOrEqual(2);
    expect(stub.maxWashInFlight()).toBe(2);
    const done = await here(u);
    expect(done.json.partial).toBe(false);
    expect("loading" in done.json).toBe(false);
  });

  it("une source en échec n'est pas un chargement : partial sans loading", async () => {
    practicalSources({}, { failWith: { wash: { status: 502, body: "at capacity" } } });
    const res = await here(await fan("Fan_EchecSansLoading"));
    expect(res.json.partial).toBe(true);
    expect("loading" in res.json).toBe(false);
  });
});

describe("Overpass : délai propre et recul", () => {
  it("le chargement de fond attend jusqu'à 60 s (au lieu de 20 s)", async () => {
    expect(OVERPASS_TIMEOUT_MS).toBe(60_000);
    const spy = vi.spyOn(AbortSignal, "timeout");
    practicalSources({ fuel: { "66": [station()] } });
    await here(await fan("Fan_Delai"));
    const delays = spy.mock.calls.map((c) => c[0]);
    expect(delays).toContain(60_000);
  });

  it("Overpass lent : la personne garde son budget (réponse partielle tout de suite) et le chargement continue jusqu'au cache", async () => {
    practicalSources(
      { wash: { "66": [osm({ name: "Lente", lat: 42.71 })] }, fuel: { "66": [station()] } },
      { delayMs: 500 },
    );
    const u = await fan("Fan_Lent2");
    const started = Date.now();
    const first = await practicalService.get(
      await viewerOf(u),
      { near: "position", cell: { lat: 42.7, lng: 2.9, key: "42.7,2.9" } },
      80,
    );
    expect(Date.now() - started).toBeLessThan(450);
    expect(first.partial).toBe(true);
    // Le chargement de fond finit et remplit le cache.
    let row = null;
    for (let i = 0; i < 30 && !row; i++) {
      await new Promise((r) => setTimeout(r, 100));
      row = (await db.query.externalCache.findFirst({ where: eq(externalCache.key, "osm:66") })) ?? null;
    }
    expect(row).not.toBeNull();
    const second = await here(u);
    expect(second.json.partial).toBe(false);
    expect(
      fuels(second)
        .map((p) => p.name)
        .sort(),
    ).toEqual(["Lente", "Station-service"]);
  });

  it("recul progressif : 10 minutes, puis 30, puis 1 heure après des échecs de suite", async () => {
    const stub = practicalSources({}, { failWith: { wash: { status: 502, body: "at capacity" } } });
    const u = await fan("Fan_Recul");
    const calls = () => stub.count("wash", "66");
    await here(u); // échec 1 à t = 0
    expect(calls()).toBe(1);
    clock.advance(9 * MIN);
    await here(u);
    expect(calls()).toBe(1);
    clock.advance(2 * MIN); // t = 11 min : 10 min écoulées
    await here(u); // échec 2
    expect(calls()).toBe(2);
    clock.advance(29 * MIN); // t = 40 : 29 min depuis le dernier échec
    await here(u);
    expect(calls()).toBe(2);
    clock.advance(2 * MIN); // t = 42 : 31 min
    await here(u); // échec 3
    expect(calls()).toBe(3);
    clock.advance(59 * MIN);
    await here(u);
    expect(calls()).toBe(3);
    clock.advance(2 * MIN); // 61 min
    await here(u);
    expect(calls()).toBe(4);
  });
});

describe("panne avec cache ancien : partiel seulement si la liste est incomplète", () => {
  it("les caches `osm:` de TOUS les départements sont remplis (10 jours, toléré), Overpass tombe : liste complète, partial faux", async () => {
    const departments = nearestDepartments(PERPIGNAN);
    for (const d of departments) {
      await db.insert(externalCache).values({
        key: `osm:${d}`,
        fetchedAt: new Date(NOW.getTime() - 10 * DAY),
        data: d === "66" ? [{ name: "Cache", address: null, lat: 42.71, lng: 2.9 }] : [],
      });
    }
    practicalSources({ fuel: { "66": [station()] } }, { failWith: { wash: { status: 502, body: "at capacity" } } });
    const res = await here(await fan("Fan_Complet"));
    expect(washes(res).map((p) => p.name)).toEqual(["Cache"]);
    expect(res.json.partial).toBe(false);
  });

  it("seulement l'ancienne ligne `wash:` de chaque département (forme d'avant, sans stations), Overpass tombe : partial vrai", async () => {
    for (const d of nearestDepartments(PERPIGNAN)) {
      await db.insert(externalCache).values({
        key: `wash:${d}`,
        fetchedAt: new Date(NOW.getTime() - 3 * DAY),
        data: d === "66" ? [{ name: "Ancien", address: null, lat: 42.71, lng: 2.9 }] : [],
      });
    }
    practicalSources({ fuel: { "66": [station()] } }, { failWith: { wash: { status: 502, body: "at capacity" } } });
    const res = await here(await fan("Fan_AncienSeul"));
    expect(washes(res).map((p) => p.name)).toEqual(["Ancien"]);
    expect(res.json.partial).toBe(true);
  });

  it("Overpass revenu : plus partiel", async () => {
    const stub = practicalSources({ wash: { "66": [osm({ name: "Revenue" })] }, fuel: { "66": [station()] } });
    const res = await here(await fan("Fan_Revenu"));
    expect(res.json.partial).toBe(false);
    expect(stub.count("wash", "66")).toBe(1);
  });
});

describe("l'Accueil : aucun nouveau prix, ni référence", () => {
  it("E10, GPLc et la référence du jeu public ne sortent pas de GET /me/home ; une station sans prix des quatre d'avant n'y est pas", async () => {
    nearbyStations.enabled = true;
    try {
      practicalSources({
        fuel: {
          "66": [
            station({ id: 11, extra: { e10: 1.913, gplc: 1.099 } }),
            station({ id: 12, adresse: "Rue E10", lat: 42.701, only: "e10" }),
          ],
        },
        wash: { "66": [osm({ name: "Station avec lavage", carWash: true, ref: "11", lat: 42.702 })] },
      });
      const u = await fan("Fan_Accueil");
      const res = await call(u, "GET", "/me/home?lat=42.7&lng=2.9");
      expect(res.status).toBe(200);
      expect(res.json.fuel).toHaveLength(1);
      expect(Object.keys(res.json.fuel[0].prices).sort()).toEqual(["e85", "gazole", "sp95", "sp98"]);
      expect(Object.keys(res.json.fuel[0]).sort()).toEqual([
        "address",
        "distanceKm",
        "lat",
        "lng",
        "name",
        "prices",
        "updatedAt",
      ]);
      const text = JSON.stringify(res.json);
      for (const forbidden of ["e10", "gplc", "1.913", "1.099", '"ref"', '"as"'])
        expect(text, forbidden).not.toContain(forbidden);
      // Les lavages de l'Accueil : la station avec lavage, sans marque interne.
      expect(res.json.wash.map((p: { name: string }) => p.name)).toEqual(["Station avec lavage"]);
      expect(Object.keys(res.json.wash[0]).sort()).toEqual(["address", "distanceKm", "lat", "lng", "name"]);
    } finally {
      nearbyStations.enabled = false;
    }
  });
});
