// Petit lot de fin F, tour 6 : pagination par curseur : vue à cheval sur le bord, éviction qui garde la zone, version des données (409),
// dernière page de 200 exactement, anciennes versions remplacées quand une case devient complète.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PracticalData, PracticalPlace } from "./practical";
import { fingerprint, type PracticalZone, placesInZonePage, viewCovered, zoneContains } from "./practicalZone";
import { createPracticalZone, zoneNeedsSearch } from "./practicalZoneController";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const att = { wash: "w", fuel: "f" };
const place = (id: string, lat: number, lng: number, name = id): PracticalPlace => ({
  id,
  kind: "wash",
  name,
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
const make = (read: (z: unknown, cursor?: string) => Promise<PracticalData>) =>
  createPracticalZone({
    read: read as never,
    visible: () => true,
    statusOf: (e) => (e instanceof Error && "status" in e ? (e as { status: number }).status : null),
  });

/** Un faux serveur paginé sur de vraies données : le vrai découpage par case et ses curseurs. */
function pagedServer(all: PracticalPlace[]) {
  return vi.fn().mockImplementation(async (z: PracticalZone, cursor?: string) => {
    const page = cursor ? Number(cursor.split(":")[0]) : 0;
    const r = placesInZonePage(all, z, page);
    if (cursor && cursor.split(":")[1] !== r.version) throw Object.assign(new Error("conflit"), { status: 409 });
    return zoneData(
      r.places,
      r.more ? { truncated: true, partialCells: r.partialCells, nextCursor: `${page + 1}:${r.version}` } : {},
    );
  });
}

/** `n` lieux répartis dans une zone de 3 × 3 cases (au plus `per` par case). */
function spread(n: number, per = 40): PracticalPlace[] {
  const out: PracticalPlace[] = [];
  for (let k = 0; out.length < n; k++) {
    const cell = k % 9;
    const idx = Math.floor(k / 9);
    if (idx >= per) break;
    out.push(
      place(
        `s${out.length}`,
        48.7 + Math.floor(cell / 3) * 0.1 + 0.001 + idx * 0.0002,
        2.2 + (cell % 3) * 0.1 + 0.001 + idx * 0.0002,
      ),
    );
  }
  return out;
}

describe("vue à cheval sur le bord de la zone du curseur", () => {
  it("la page suivante n'est lue que pour une vue ENTIÈRE dans la zone ; à cheval, c'est une nouvelle recherche", async () => {
    const read = pagedServer(spread(270));
    const z = make(read);
    // Une vue centrée près du bord nord-est de la zone demandée (la zone demandée est élargie : on la lit pour la connaître).
    const view = { south: 48.8, west: 2.3, north: 48.82, east: 2.32 };
    z.setView(view);
    z.searchHere();
    await vi.advanceTimersByTimeAsync(0);
    const asked = read.mock.calls[0]?.[0] as PracticalZone;
    expect(read.mock.calls[0]?.[1]).toBeUndefined();
    // La vue entière dans la zone, case incomplète : page suivante de la MÊME zone.
    expect(zoneNeedsSearch(z.getState())).toBe(true);
    z.searchHere();
    await vi.advanceTimersByTimeAsync(0);
    expect(read.mock.calls[1]?.[1]).toMatch(/^1:/);
    // Une vue à cheval sur le bord nord de la zone : une autre zone, page 0 (jamais « la même page » relue).
    const straddle = { south: asked.north - 0.01, west: 2.3, north: asked.north + 0.03, east: 2.32 };
    z.setView(straddle);
    expect(zoneNeedsSearch(z.getState())).toBe(true);
    z.searchHere();
    await vi.advanceTimersByTimeAsync(0);
    const third = read.mock.calls[2] as [PracticalZone, string | undefined];
    expect(third[1]).toBeUndefined();
    expect(zoneContains(third[0], { lat: asked.north + 0.03, lng: 2.31 })).toBe(true);
  });
});

describe("éviction pendant une page suivante", () => {
  it("mémoire presque pleine : les lieux des pages précédentes de la zone sont gardés, les autres zones sortent", async () => {
    let i = 0;
    const fill = vi.fn().mockImplementation(async () => {
      const k = i++;
      return zoneData(
        Array.from({ length: 150 }, (_, n) =>
          place(`f${k}-${n}`, 42 + (k % 13) * 0.5 + n * 0.0001, 0 + Math.floor(k / 13) * 3 + n * 0.0001),
        ),
      );
    });
    const server = pagedServer(spread(270));
    const read = vi
      .fn()
      .mockImplementation((zone: PracticalZone, cursor?: string) => (i < 26 ? fill() : server(zone, cursor)));
    const z = make(read);
    for (let k = 0; k < 26; k++) {
      z.setView({
        south: 42 + (k % 13) * 0.5 - 0.02,
        west: Math.floor(k / 13) * 3 - 0.02,
        north: 42 + (k % 13) * 0.5 + 0.02,
        east: Math.floor(k / 13) * 3 + 0.02,
      });
      z.searchHere();
      await vi.advanceTimersByTimeAsync(0);
    }
    expect(z.getState().places.size).toBe(3900);
    const view = { south: 48.8, west: 2.3, north: 48.82, east: 2.32 };
    z.setView(view);
    z.searchHere();
    await vi.advanceTimersByTimeAsync(0);
    z.searchHere();
    await vi.advanceTimersByTimeAsync(0);
    const places = [...z.getState().places.values()];
    // Les 270 lieux de la zone sont tous en mémoire (aucun des deux pages perdu), et la zone est couverte.
    expect(places.filter((p) => p.id.startsWith("s")).length).toBe(270);
    expect(places.length).toBeLessThanOrEqual(4000);
    expect(viewCovered(z.getState().cover, view)).toBe(true);
  });

  it("impossible de tout garder : rien n'est déclaré couvert, la recherche repart de la première page", async () => {
    const big = (k: number) =>
      Array.from({ length: 2100 }, (_, n) => place(`b${k}-${n}`, 48.8 + n * 0.00003, 2.3 + k * 0.01));
    const read = vi
      .fn()
      .mockResolvedValueOnce(zoneData(big(0), { truncated: true, partialCells: [[488, 23]], nextCursor: "1:v" }))
      .mockResolvedValueOnce(zoneData(big(1), { truncated: true, partialCells: [[488, 23]], nextCursor: "2:v" }))
      .mockResolvedValue(zoneData([]));
    const z = make(read);
    z.setView({ south: 48.8, west: 2.3, north: 48.81, east: 2.31 });
    z.searchHere();
    await vi.advanceTimersByTimeAsync(0);
    z.searchHere();
    await vi.advanceTimersByTimeAsync(0);
    expect(z.getState().cover).toEqual([]);
    expect(zoneNeedsSearch(z.getState())).toBe(true);
    z.searchHere();
    await vi.advanceTimersByTimeAsync(0);
    expect(read.mock.calls[2]?.[1]).toBeUndefined();
  });
});

describe("version des données : 409 entre deux pages", () => {
  it("le cache a changé : l'écran repart de la page 0 et les lieux lus remplacent les anciens", async () => {
    const before = spread(270);
    const after = spread(270).map((p) => ({ ...p, id: `n-${p.id}` }));
    let current = before;
    const server = pagedServer(current);
    const read = vi.fn().mockImplementation((zone: PracticalZone, cursor?: string) => {
      if (cursor) current = after; // entre deux pages, le cache est renouvelé
      return cursor ? pagedServer(after)(zone, cursor) : server(zone);
    });
    const z = make(read);
    z.setView({ south: 48.8, west: 2.3, north: 48.82, east: 2.32 });
    z.searchHere();
    await vi.advanceTimersByTimeAsync(0);
    z.searchHere();
    await vi.advanceTimersByTimeAsync(0);
    // Appels : page 0, page 1 (409), puis page 0 relue seule, sans curseur.
    expect(read).toHaveBeenCalledTimes(3);
    expect(read.mock.calls[1]?.[1]).toMatch(/^1:/);
    expect(read.mock.calls[2]?.[1]).toBeUndefined();
    expect(z.getState().failed).toBe(false);
  });
  it("l'empreinte dépend des identifiants servis, pas de leur position", () => {
    expect(fingerprint(["a", "b"])).toBe(fingerprint(["a", "b"]));
    expect(fingerprint(["a", "b"])).not.toBe(fingerprint(["a", "c"]));
    expect(fingerprint(["ab", "c"])).not.toBe(fingerprint(["a", "bc"]));
  });
});

describe("dernière page de 200 lieux exactement", () => {
  it("200 lieux sans `truncated` : zone complète ; 400 lieux : deux pages, la seconde de 200 exactement rend la zone complète", async () => {
    const z200 = make(vi.fn().mockResolvedValue(zoneData(spread(200, 30).slice(0, 200))));
    z200.setView({ south: 48.8, west: 2.3, north: 48.82, east: 2.32 });
    z200.searchHere();
    await vi.advanceTimersByTimeAsync(0);
    expect(zoneNeedsSearch(z200.getState())).toBe(false);
    for (const c of z200.getState().cover) if (c.t === "rect") expect(c.except).toBeUndefined();

    const read = pagedServer(spread(400, 50));
    const z = make(read);
    const view = { south: 48.8, west: 2.3, north: 48.82, east: 2.32 };
    z.setView(view);
    z.searchHere();
    await vi.advanceTimersByTimeAsync(0);
    expect(zoneNeedsSearch(z.getState())).toBe(true);
    z.searchHere();
    await vi.advanceTimersByTimeAsync(0);
    expect(z.getState().places.size).toBe(400);
    expect(zoneNeedsSearch(z.getState())).toBe(false);
    expect(z.getState().tooDense).toBe(false);
  });
});

describe("anciennes versions remplacées quand une case devient complète", () => {
  it("201 lieux actuels et une ancienne version d'une station : 201 entrées après deux pages (pas 202)", async () => {
    const current = spread(201, 30);
    const target = current[5] as PracticalPlace;
    const read = pagedServer(current);
    const z = make(read);
    // L'ancienne lecture (version OpenStreetMap seule, réponse partielle) : autre identifiant, tout près de la même station.
    z.ingest({
      origin: { kind: "city", label: "X", lat: 40, lng: 1 },
      places: [place("osm-seule", target.lat + 0.00001, target.lng + 0.00001, "Total")],
      partial: true,
      attribution: att,
    });
    expect(z.getState().places.has("osm-seule")).toBe(true);
    z.setView({ south: 48.8, west: 2.3, north: 48.82, east: 2.32 });
    z.searchHere();
    await vi.advanceTimersByTimeAsync(0);
    // La vue se pose sur la case incomplète (celle du 201e lieu), dans la zone demandée : la page suivante de la même zone.
    const firstRead = read.mock.results[0];
    expect(firstRead).toBeDefined();
    const incomplete = (await firstRead!.value).partialCells[0] as [number, number];
    z.setView({
      south: incomplete[0] / 10 + 0.02,
      west: incomplete[1] / 10 + 0.02,
      north: incomplete[0] / 10 + 0.08,
      east: incomplete[1] / 10 + 0.08,
    });
    expect(z.searchHere()).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(read).toHaveBeenCalledTimes(2);
    expect(z.getState().places.size).toBe(201);
    expect(z.getState().places.has("osm-seule")).toBe(false);
  });
});
