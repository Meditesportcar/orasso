// Petit lot de fin F : le contrôleur de zone de « Pratique » (hybride C). Horloge simulée, lecture injectée.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PracticalData, PracticalPlace } from "./practical";
import { PRACTICAL_LOADING_MAX_READS } from "./practicalRetry";
import { createPracticalZone, zoneIsTooWide, zoneNeedsSearch } from "./practicalZoneController";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const place = (id: string, lat: number, lng: number, kind: PracticalPlace["kind"] = "fuel"): PracticalPlace => ({
  id,
  kind,
  name: id,
  address: null,
  lat,
  lng,
});
const att = { wash: "w", fuel: "f" };
const opening = (places: PracticalPlace[], partial = false): PracticalData => ({
  origin: { kind: "city", label: "Perpignan", lat: 42.6986, lng: 2.8956 },
  places,
  partial,
  attribution: att,
});
const zoneData = (places: PracticalPlace[], extra: Partial<PracticalData> = {}): PracticalData => ({
  origin: null,
  places,
  partial: false,
  attribution: att,
  ...extra,
});
const view = { south: 42.47, west: 3.1, north: 42.53, east: 3.16 };
const netError = Object.assign(new Error("réseau"), { status: 0 });

function make(read: (z: unknown) => Promise<PracticalData>) {
  const zone = createPracticalZone({
    read: read as never,
    visible: () => true,
    statusOf: (e) => (e instanceof Error && "status" in e ? (e as { status: number }).status : null),
  });
  return zone;
}

describe("hybride : filtre local dans le chargé, bouton au-delà", () => {
  it("l'ouverture couvre 30 km autour de l'origine ; une vue dedans ne propose rien, une vue dehors propose le bouton", () => {
    const read = vi.fn();
    const z = make(read);
    z.ingest(opening([place("a", 42.7, 2.9)]));
    z.setView({ south: 42.69, west: 2.89, north: 42.71, east: 2.92 });
    expect(zoneNeedsSearch(z.getState())).toBe(false);
    z.setView(view);
    expect(zoneNeedsSearch(z.getState())).toBe(true);
    expect(read).not.toHaveBeenCalled();
  });

  it("une ouverture partielle ne couvre rien (le bouton reste proposé), et la même réponse n'est prise qu'une fois", () => {
    const z = make(vi.fn());
    const partial = opening([place("a", 42.7, 2.9)], true);
    z.ingest(partial);
    z.ingest(partial);
    expect(z.getState().cover).toHaveLength(0);
    z.ingest(opening([place("a", 42.7, 2.9)]));
    z.ingest(opening([place("b", 42.7, 2.91)]));
    expect(z.getState().cover).toHaveLength(1);
    expect(z.getState().places.size).toBe(2);
  });

  it("l'appui lit la zone élargie, couvre la zone demandée, et les gestes suivants dedans ne lisent plus", async () => {
    const read = vi.fn().mockResolvedValue(zoneData([place("c", 42.48, 3.12)]));
    const z = make(read);
    z.ingest(opening([place("a", 42.7, 2.9)]));
    z.setView(view);
    expect(z.searchHere()).toBe(true);
    expect(z.getState().loading).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(read).toHaveBeenCalledTimes(1);
    const asked = read.mock.calls[0]?.[0] as { south: number; north: number; west: number; east: number };
    expect(asked.south).toBeLessThanOrEqual(view.south);
    expect(asked.north).toBeGreaterThanOrEqual(view.north);
    expect(asked.east - asked.west).toBeGreaterThan(view.east - view.west);
    expect(z.getState().loading).toBe(false);
    expect(z.getState().places.has("c")).toBe(true);
    // Un geste voisin, dans la zone élargie : rien à chercher.
    z.setView({ south: 42.44, west: 3.08, north: 42.5, east: 3.14 });
    expect(zoneNeedsSearch(z.getState())).toBe(false);
    expect(z.searchHere()).toBe(false);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("une zone trop grande ne lit jamais et le dit", () => {
    const read = vi.fn();
    const z = make(read);
    z.setView({ south: 42.0, west: 2.0, north: 43.0, east: 3.5 });
    expect(zoneIsTooWide(z.getState())).toBe(true);
    expect(zoneNeedsSearch(z.getState())).toBe(false);
    expect(z.searchHere()).toBe(false);
    expect(read).not.toHaveBeenCalled();
  });

  it("une seule lecture à la fois : un second appui pendant la lecture est ignoré", async () => {
    let done: (d: PracticalData) => void = () => undefined;
    const read = vi.fn().mockReturnValue(new Promise<PracticalData>((r) => (done = r)));
    const z = make(read);
    z.setView(view);
    expect(z.searchHere()).toBe(true);
    expect(z.searchHere()).toBe(false);
    done(zoneData([]));
    await vi.advanceTimersByTimeAsync(0);
    expect(read).toHaveBeenCalledTimes(1);
  });
});

describe("hors ligne et échec", () => {
  it("l'échec réseau : hors ligne, « Réessayer », aucune relance automatique ; le filtre local reste", async () => {
    const read = vi.fn().mockRejectedValue(netError);
    const z = make(read);
    z.ingest(opening([place("a", 42.7, 2.9)]));
    z.setView(view);
    z.searchHere();
    await vi.advanceTimersByTimeAsync(0);
    expect(z.getState()).toMatchObject({ failed: true, offline: true, loading: false });
    expect(z.getState().places.has("a")).toBe(true);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(read).toHaveBeenCalledTimes(1);
    read.mockResolvedValue(zoneData([place("c", 42.48, 3.12)]));
    expect(z.retry()).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(z.getState()).toMatchObject({ failed: false, offline: false, loading: false });
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("une exception inconnue est signalée et n'est jamais relue seule", async () => {
    const onUnknown = vi.fn();
    const read = vi.fn().mockRejectedValue(new TypeError("bogue"));
    const z = createPracticalZone({ read: read as never, visible: () => true, statusOf: () => null, onUnknown });
    z.setView(view);
    z.searchHere();
    await vi.advanceTimersByTimeAsync(0);
    expect(onUnknown).toHaveBeenCalledTimes(1);
    expect(z.getState().failed).toBe(true);
    expect(z.getState().offline).toBe(false);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(read).toHaveBeenCalledTimes(1);
  });
});

describe("champ loading : relectures bornées, puis « Réessayer »", () => {
  it("tant que loading est vrai, relit la même zone aux délais ; la zone n'est pas chargée avant la réponse complète", async () => {
    const read = vi
      .fn()
      .mockResolvedValueOnce(zoneData([place("c", 42.48, 3.12)], { partial: true, loading: true }))
      .mockResolvedValueOnce(zoneData([place("c", 42.48, 3.12)], { partial: true, loading: true }))
      .mockResolvedValue(zoneData([place("c", 42.48, 3.12), place("d", 42.5, 3.13)]));
    const z = make(read);
    z.setView(view);
    z.searchHere();
    await vi.advanceTimersByTimeAsync(0);
    expect(z.getState()).toMatchObject({ loading: true, failed: false });
    expect(zoneNeedsSearch(z.getState())).toBe(true);
    await vi.advanceTimersByTimeAsync(3000);
    expect(read).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(6000);
    expect(read).toHaveBeenCalledTimes(3);
    expect(z.getState()).toMatchObject({ loading: false, failed: false });
    expect(z.getState().places.size).toBe(2);
    expect(zoneNeedsSearch(z.getState())).toBe(false);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(read).toHaveBeenCalledTimes(3);
  });

  it("loading sans fin : au plus 1 + 16 lectures, jamais deux à moins de 15 s après le début, puis « Réessayer »", async () => {
    const starts: number[] = [];
    const read = vi.fn().mockImplementation(async () => {
      starts.push(Date.now());
      return zoneData([], { partial: true, loading: true });
    });
    const z = make(read);
    z.setView(view);
    z.searchHere();
    await vi.advanceTimersByTimeAsync(20 * 60_000);
    expect(read).toHaveBeenCalledTimes(1 + PRACTICAL_LOADING_MAX_READS);
    expect(z.getState()).toMatchObject({ loading: false, failed: true });
    expect(zoneNeedsSearch(z.getState())).toBe(true);
    for (let i = 5; i < starts.length; i++)
      expect((starts[i] as number) - (starts[i - 1] as number)).toBeGreaterThanOrEqual(15_000);
    // « Réessayer » repart à zéro.
    z.retry();
    await vi.advanceTimersByTimeAsync(0);
    expect(read).toHaveBeenCalledTimes(2 + PRACTICAL_LOADING_MAX_READS);
    expect(z.getState().failed).toBe(false);
  });

  it("partial sans loading : une seule relecture espacée, puis « Réessayer »", async () => {
    const read = vi.fn().mockResolvedValue(zoneData([place("c", 42.48, 3.12)], { partial: true }));
    const z = make(read);
    z.setView(view);
    z.searchHere();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(read).toHaveBeenCalledTimes(2);
    expect(z.getState()).toMatchObject({ loading: false, failed: true });
  });

  it("la zone abandonnée (autre compte, reset) : la réponse tardive est jetée", async () => {
    let done: (d: PracticalData) => void = () => undefined;
    const read = vi.fn().mockReturnValue(new Promise<PracticalData>((r) => (done = r)));
    const z = make(read);
    z.setView(view);
    z.searchHere();
    z.reset();
    done(zoneData([place("c", 42.48, 3.12)]));
    await vi.advanceTimersByTimeAsync(0);
    expect(z.getState().places.size).toBe(0);
    expect(z.getState().cover).toHaveLength(0);
  });
});

describe("tour 1 : coupe, bouton pendant loading, « Réessayer » après déplacement", () => {
  it("une réponse coupée (200 lieux) ne marque comme chargé que le disque couvert : le bouton revient au bord", async () => {
    const read = vi.fn().mockResolvedValue(zoneData([place("c", 48.76, 2.31)], { truncated: true, coveredKm: 3 }));
    const z = make(read);
    const v = { south: 48.7, west: 2.25, north: 48.8, east: 2.4 };
    z.setView(v);
    z.searchHere();
    await vi.advanceTimersByTimeAsync(0);
    expect(z.getState().cover).toHaveLength(1);
    expect(z.getState().cover[0]).toMatchObject({ t: "disk", km: 3 });
    expect(zoneNeedsSearch(z.getState())).toBe(true);
    // Rien de sûr (0 km) : rien n'est marqué chargé.
    const none = make(vi.fn().mockResolvedValue(zoneData([], { truncated: true, coveredKm: 0 })));
    none.setView(v);
    none.searchHere();
    await vi.advanceTimersByTimeAsync(0);
    expect(none.getState().cover).toHaveLength(0);
  });

  it("pendant loading, la vue sort de la zone demandée : le bouton redevient actif, l'ancienne relecture est abandonnée", async () => {
    const read = vi.fn().mockResolvedValue(zoneData([], { partial: true, loading: true }));
    const z = make(read);
    z.setView(view);
    z.searchHere();
    await vi.advanceTimersByTimeAsync(0);
    expect(z.getState().loading).toBe(true);
    // Un geste dans la zone demandée : toujours « Recherche… ».
    z.setView({ south: 42.48, west: 3.11, north: 42.52, east: 3.15 });
    expect(z.getState().loading).toBe(true);
    // Un geste hors de la zone demandée : le bouton est actif pour la nouvelle zone, plus de relecture de l'ancienne.
    z.setView({ south: 43.4, west: 1.3, north: 43.5, east: 1.4 });
    expect(z.getState().loading).toBe(false);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(read).toHaveBeenCalledTimes(1);
    expect(z.searchHere()).toBe(true);
  });

  it("« Réessayer » après déplacement : un seul appui pour la zone regardée, jamais l'ancienne", async () => {
    const read = vi
      .fn()
      .mockRejectedValueOnce(netError)
      .mockResolvedValue(zoneData([place("t", 43.45, 1.35)]));
    const z = make(read);
    z.setView(view);
    z.searchHere();
    await vi.advanceTimersByTimeAsync(0);
    expect(z.getState().failed).toBe(true);
    const other = { south: 43.4, west: 1.3, north: 43.5, east: 1.4 };
    z.setView(other);
    expect(z.getState()).toMatchObject({ failed: false, offline: false });
    expect(z.searchHere()).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    const asked = read.mock.calls[1]?.[0] as { south: number; north: number };
    expect(asked.south).toBeLessThanOrEqual(other.south);
    expect(asked.north).toBeGreaterThanOrEqual(other.north);
  });
});
