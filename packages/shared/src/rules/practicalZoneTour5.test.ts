// Petit lot de fin F, tour 5 : couverture contrôlée case par case, « trop de lieux » limité à la vue courante, pagination de la même zone par
// curseur, relance différée au retour du réseau.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PracticalData, PracticalPlace } from "./practical";
import {
  PRACTICAL_ZONE_MAX_PAGES,
  type PracticalZone,
  placesInZonePage,
  viewCovered,
  zoneContains,
} from "./practicalZone";
import { createPracticalZone, zoneNeedsSearch } from "./practicalZoneController";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const att = { wash: "w", fuel: "f" };
const place = (id: string, lat: number, lng: number): PracticalPlace => ({
  id,
  kind: "wash",
  name: id,
  address: null,
  lat,
  lng,
});
const zoneData = (places: PracticalPlace[], extra: Partial<PracticalData> = {}): PracticalData => ({
  origin: null,
  places,
  partial: false,
  attribution: att,
  ...extra,
});
const netError = Object.assign(new Error("réseau"), { status: 0 });

describe("viewCovered : toutes les cases de la vue", () => {
  const rect = (zone: PracticalZone, except: string[]) => [{ t: "rect" as const, zone, except: new Set(except) }];
  it("reproduction d'Opus : une case incomplète à l'intérieur d'une vue de 55 km n'est plus oubliée", () => {
    const cover = rect({ south: 48.5, west: 2.0, north: 49.1, east: 2.6 }, ["487,22"]);
    expect(viewCovered(cover, { south: 48.55, west: 2.05, north: 49.05, east: 2.55 })).toBe(false);
  });
  it("reproduction de Codex : une vue de 44,4 × 55,6 km avec une case incomplète entre les points de contrôle", () => {
    const cover = rect({ south: 48.4, west: 1.9, north: 49.2, east: 2.8 }, ["489,23"]);
    const view = { south: 48.6, west: 2.0, north: 49.0, east: 2.5 };
    expect(viewCovered(cover, view)).toBe(false);
    // Sans case exclue, la même vue est couverte.
    expect(viewCovered(rect({ south: 48.4, west: 1.9, north: 49.2, east: 2.8 }, []), view)).toBe(true);
  });
  it("chaque case de la vue est contrôlée : quelle que soit la case exclue, la vue n'est jamais couverte", () => {
    const zone = { south: 48.5, west: 2.0, north: 49.1, east: 2.6 };
    const view = { south: 48.55, west: 2.05, north: 49.05, east: 2.55 };
    for (let i = 485; i <= 490; i++)
      for (let j = 20; j <= 25; j++) expect(viewCovered(rect(zone, [`${i},${j}`]), view), `${i},${j}`).toBe(false);
  });
});

describe("« trop de lieux » ne vaut que pour la recherche et la vue courantes", () => {
  it("déplacement vers Toulouse pendant la lecture resserrée de Paris : la réponse coupée ne bloque pas Toulouse", async () => {
    const paris = { south: 48.85, west: 2.34, north: 48.87, east: 2.36 };
    const toulouse = { south: 43.4, west: 1.3, north: 43.5, east: 1.4 };
    const centre = Array.from({ length: 200 }, (_, i) =>
      place(`p${i}`, 48.86 + (i % 20) * 0.00005, 2.35 + Math.floor(i / 20) * 0.00005),
    );
    let release: (d: PracticalData) => void = () => undefined;
    const read = vi
      .fn()
      .mockResolvedValueOnce(zoneData(centre, { truncated: true, partialCells: [[488, 23]] }))
      .mockReturnValueOnce(new Promise<PracticalData>((r) => (release = r)))
      .mockResolvedValue(zoneData([]));
    const z = createPracticalZone({ read: read as never, visible: () => true, statusOf: () => null });
    z.setView(paris);
    z.searchHere();
    await vi.advanceTimersByTimeAsync(0);
    z.searchHere(); // lecture resserrée (ou page suivante) de Paris, en vol
    z.setView(toulouse);
    release(zoneData(centre, { truncated: true, partialCells: [[488, 23]] }));
    await vi.advanceTimersByTimeAsync(0);
    expect(z.getState().tooDense).toBe(false);
    expect(zoneNeedsSearch(z.getState())).toBe(true);
    expect(z.searchHere()).toBe(true);
  });
});

describe("pagination de la même zone", () => {
  // Neuf cases de 30 lieux (270 > 200) dans une zone de 3 × 3 cases, et un lavage visible dans la dernière case servie en dernier.
  const zone = { south: 48.7, west: 2.2, north: 49.0, east: 2.5 };
  const nine: PracticalPlace[] = [];
  for (let ci = 0; ci < 3; ci++)
    for (let cj = 0; cj < 3; cj++)
      for (let k = 0; k < 30; k++)
        nine.push(place(`c${ci}${cj}-${k}`, 48.7 + ci * 0.1 + 0.001 + k * 0.0002, 2.2 + cj * 0.1 + 0.001 + k * 0.0002));
  // Le lavage visible : le plus éloigné du centre de sa case (donc servi en dernier de sa case).
  nine.push(place("lavage-visible", 48.7 + 0.1 + 0.099, 2.2 + 0.2 + 0.099));

  it("placesInZonePage : 271 lieux, deux pages, la dernière rend la zone complète", () => {
    const p0 = placesInZonePage(nine, zone, 0);
    const p1 = placesInZonePage(nine, zone, 1);
    expect(p0.places).toHaveLength(200);
    expect(p0.more).toBe(true);
    expect(p0.partialCells.length).toBeGreaterThan(0);
    expect(p1.places).toHaveLength(71);
    expect(p1.more).toBe(false);
    expect(p1.partialCells).toEqual([]);
    const ids = new Set([...p0.places, ...p1.places].map((p) => p.id));
    expect(ids.size).toBe(271);
    expect(p0.places.map((p) => p.id)).not.toContain("lavage-visible");
    expect(p1.places.map((p) => p.id)).toContain("lavage-visible");
  });

  function server() {
    return vi.fn().mockImplementation(async (_z: PracticalZone, cursor?: string) => {
      const page = cursor ? Number(cursor.replace("page-", "")) : 0;
      const r = placesInZonePage(nine, zone, page);
      return zoneData(
        r.places,
        r.more
          ? {
              truncated: true,
              partialCells: r.partialCells,
              ...(page + 1 < PRACTICAL_ZONE_MAX_PAGES ? { nextCursor: `page-${page + 1}` } : {}),
            }
          : {},
      );
    });
  }

  it("le lavage arrive à la 2e page, à l'appui sur le même bouton, jamais automatiquement ; ensuite la zone est complète", async () => {
    const read = server();
    const z = createPracticalZone({ read: read as never, visible: () => true, statusOf: () => null });
    const vue = { south: 48.89, west: 2.39, north: 48.9995, east: 2.4995 };
    z.setView(vue);
    z.searchHere();
    await vi.advanceTimersByTimeAsync(0);
    expect(z.getState().places.has("lavage-visible")).toBe(false);
    expect(zoneNeedsSearch(z.getState())).toBe(true);
    // Rien ne part seul.
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(read).toHaveBeenCalledTimes(1);
    // Le bouton (même appui) lit la page suivante de la même zone.
    expect(z.searchHere()).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(read).toHaveBeenCalledTimes(2);
    expect(read.mock.calls[1]?.[1]).toBe("page-1");
    expect(read.mock.calls[1]?.[0]).toEqual(read.mock.calls[0]?.[0]);
    expect(z.getState().places.has("lavage-visible")).toBe(true);
    // Les lieux de la 1re page sont gardés (page suivante = ajout, jamais remplacement) et la zone est maintenant complète.
    expect(z.getState().places.size).toBe(271);
    expect(zoneNeedsSearch(z.getState())).toBe(false);
    expect(viewCovered(z.getState().cover, zone)).toBe(true);
    expect(zoneContains(read.mock.calls[0]?.[0] as PracticalZone, { lat: 48.95, lng: 2.45 })).toBe(true);
  });

  it("plafond de pages : dix pages de la zone large puis dix de la zone resserrée, alors seulement « trop de lieux » et plus de bouton", async () => {
    const big = Array.from({ length: 3000 }, (_, i) =>
      place(`g${i}`, 48.805 + (i % 50) * 0.00001, 2.305 + Math.floor(i / 50) * 0.00001),
    );
    const read = vi.fn().mockImplementation(async (_z: PracticalZone, cursor?: string) => {
      const page = cursor ? Number(cursor.replace("page-", "")) : 0;
      const r = placesInZonePage(big, { south: 48.7, west: 2.2, north: 49.0, east: 2.5 }, page);
      return zoneData(
        r.places,
        r.more
          ? {
              truncated: true,
              partialCells: r.partialCells,
              ...(page + 1 < PRACTICAL_ZONE_MAX_PAGES ? { nextCursor: `page-${page + 1}` } : {}),
            }
          : {},
      );
    });
    const z = createPracticalZone({ read: read as never, visible: () => true, statusOf: () => null });
    z.setView({ south: 48.803, west: 2.303, north: 48.807, east: 2.307 });
    for (let k = 0; k < PRACTICAL_ZONE_MAX_PAGES * 3; k++) {
      if (!z.searchHere()) break;
      await vi.advanceTimersByTimeAsync(0);
    }
    // Dix pages de la zone large (la dixième sans curseur), puis la zone resserrée sur la vue : dix pages encore, puis « trop de lieux ».
    expect(read).toHaveBeenCalledTimes(PRACTICAL_ZONE_MAX_PAGES * 2);
    expect(z.getState().tooDense).toBe(true);
    expect(zoneNeedsSearch(z.getState())).toBe(false);
  });
});

describe("retour du réseau rapide", () => {
  it("un retour à +2 s sans autre événement : UNE relance programmée à +15 s", async () => {
    const vue = { south: 42.47, west: 3.1, north: 42.53, east: 3.16 };
    const read = vi
      .fn()
      .mockRejectedValueOnce(netError)
      .mockResolvedValue(zoneData([place("c", 42.5, 3.12)]));
    const z = createPracticalZone({
      read: read as never,
      visible: () => true,
      statusOf: (e) => (e instanceof Error && "status" in e ? (e as { status: number }).status : null),
    });
    z.setView(vue);
    z.searchHere();
    await vi.advanceTimersByTimeAsync(0);
    expect(z.getState().failed).toBe(true);
    await vi.advanceTimersByTimeAsync(2_000);
    z.resume();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(read).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3_100);
    expect(read).toHaveBeenCalledTimes(2);
    expect(z.getState().failed).toBe(false);
    // Jamais en boucle.
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(read).toHaveBeenCalledTimes(2);
  });
});
