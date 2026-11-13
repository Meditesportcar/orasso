// Petit lot de fin F, tour 2 : plafond sur toute la France, compte, coupe à l'ouverture, zone dense, lecture en vol, refus, doublons,
// montage double (StrictMode), éviction. Horloge simulée, lecture injectée.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PracticalData, PracticalPlace } from "./practical";
import { zoneAround, zoneContains, zoneForRequest, zoneRequestTooBig } from "./practicalZone";
import { createPracticalZone, zoneNeedsSearch } from "./practicalZoneController";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const att = { wash: "w", fuel: "f" };
const place = (id: string, lat: number, lng: number, name = id): PracticalPlace => ({
  id,
  kind: "fuel",
  name,
  address: null,
  lat,
  lng,
});
const opening = (places: PracticalPlace[], extra: Partial<PracticalData> = {}): PracticalData => ({
  origin: { kind: "city", label: "Perpignan", lat: 42.7, lng: 2.9 },
  places,
  partial: false,
  attribution: att,
  ...extra,
});
const zoneData = (places: PracticalPlace[], extra: Partial<PracticalData> = {}): PracticalData => ({
  origin: null,
  places,
  partial: false,
  attribution: att,
  ...extra,
});
const many = (n: number, lat: number, lng: number, spread = 0.001, prefix = "m"): PracticalPlace[] =>
  Array.from({ length: n }, (_, i) =>
    place(`${prefix}${i}`, lat + ((i % 20) - 10) * spread, lng + (Math.floor(i / 20) - 5) * spread),
  );
const view = { south: 42.47, west: 3.1, north: 42.53, east: 3.16 };
const toulouse = { south: 43.4, west: 1.3, north: 43.5, east: 1.4 };
const netError = Object.assign(new Error("réseau"), { status: 0 });

function make(read: (z: unknown) => Promise<PracticalData>) {
  return createPracticalZone({
    read: read as never,
    visible: () => true,
    statusOf: (e) => (e instanceof Error && "status" in e ? (e as { status: number }).status : null),
  });
}

describe("plafond sur toute la France", () => {
  it("une vue de 60 km (à 0,01 km près) n'est jamais refusée par l'API, à toutes les latitudes de la métropole", () => {
    for (let lat = 41.3; lat <= 51.1; lat += 0.0371) {
      for (const km of [59.99, 60]) {
        const asked = zoneForRequest(zoneAround({ lat, lng: 2.31 + lat * 0.01 }, km, km));
        expect(zoneRequestTooBig(asked), `${lat} / ${km}`).toBe(false);
      }
    }
  });
  it("Blois (47,599° N) : une vue de 59,996 km est acceptée", () => {
    const asked = zoneForRequest(zoneAround({ lat: 47.599, lng: 1.33 }, 59.996, 59.996));
    expect(zoneRequestTooBig(asked)).toBe(false);
  });
  it("une zone déjà coupée se resserre (pas d'élargissement), bords en cases entières", () => {
    const v = zoneAround({ lat: 48.86, lng: 2.35 }, 3, 3);
    const wide = zoneForRequest(v);
    const tight = zoneForRequest(v, false);
    expect(tight.north - tight.south).toBeLessThan(wide.north - wide.south);
    for (const x of Object.values(tight)) expect(Math.abs(x * 10 - Math.round(x * 10))).toBeLessThan(1e-9);
    for (const lat of [v.south, v.north])
      for (const lng of [v.west, v.east]) expect(zoneContains(tight, { lat, lng })).toBe(true);
  });
});

describe("contrôleur, tour 2", () => {
  it("un autre compte pendant une lecture lente : la réponse de A n'est jamais appliquée sous B, la mémoire de A est effacée", async () => {
    let done: (d: PracticalData) => void = () => undefined;
    const read = vi
      .fn()
      .mockReturnValueOnce(new Promise<PracticalData>((r) => (done = r)))
      .mockResolvedValue(zoneData([place("b", 42.48, 3.12)]));
    const z = make(read);
    z.ingest(opening([place("a0", 42.7, 2.9)]));
    z.setView(view);
    z.searchHere();
    z.reset();
    expect(z.getState().places.size).toBe(0);
    expect(z.getState().cover).toHaveLength(0);
    done(zoneData([place("a1", 42.48, 3.12)]));
    await vi.advanceTimersByTimeAsync(0);
    expect(z.getState().places.has("a1")).toBe(false);
    expect(z.getState().loading).toBe(false);
    z.setView(view);
    expect(z.searchHere()).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect([...z.getState().places.keys()]).toEqual(["b"]);
  });

  it("ouverture coupée à 200 lieux : seul le rayon servi est couvert ; un lavage à 20 km n'est pas « chargé »", () => {
    const central = many(200, 42.7, 2.9);
    const z = make(vi.fn());
    z.ingest(opening(central, { truncated: true, coveredKm: 2 }));
    expect(z.getState().cover[0]).toMatchObject({ t: "disk", km: 2 });
    z.setView({ south: 42.5, west: 2.85, north: 42.54, east: 2.95 });
    expect(zoneNeedsSearch(z.getState())).toBe(true);
    // Ancien serveur (sans `truncated`) : 200 lieux reçus = coupe, rayon du plus lointain.
    const old = make(vi.fn());
    old.ingest(opening(central));
    const c = old.getState().cover[0];
    expect(c).toMatchObject({ t: "disk" });
    expect((c as { km: number }).km).toBeLessThan(5);
    old.setView({ south: 42.5, west: 2.85, north: 42.54, east: 2.95 });
    expect(zoneNeedsSearch(old.getState())).toBe(true);
  });

  it("zone dense : une seconde recherche dans une zone déjà coupée se resserre, et la vue est toujours dedans", async () => {
    const read = vi.fn().mockResolvedValue(zoneData(many(200, 48.86, 2.35), { truncated: true, coveredKm: 0.6 }));
    const z = make(read);
    z.setView({ south: 48.85, west: 2.34, north: 48.87, east: 2.36 });
    z.searchHere();
    await vi.advanceTimersByTimeAsync(0);
    const first = read.mock.calls[0]?.[0] as { south: number; north: number };
    const corner = { south: 48.868, west: 2.355, north: 48.88, east: 2.37 };
    z.setView(corner);
    expect(zoneNeedsSearch(z.getState())).toBe(true);
    z.searchHere();
    await vi.advanceTimersByTimeAsync(0);
    const second = read.mock.calls[1]?.[0] as { south: number; north: number; west: number; east: number };
    expect(second.north - second.south).toBeLessThan(first.north - first.south);
    for (const lat of [corner.south, corner.north])
      for (const lng of [corner.west, corner.east]) expect(zoneContains(second, { lat, lng })).toBe(true);
  });

  it("vue ailleurs pendant la lecture : `loading` ne bloque pas le bouton, un échec n'est pas montré, jamais de relecture de l'ancienne zone", async () => {
    let done: (d: PracticalData) => void = () => undefined;
    const read = vi
      .fn()
      .mockReturnValueOnce(new Promise<PracticalData>((r) => (done = r)))
      .mockResolvedValue(zoneData([]));
    const z = make(read);
    z.setView(view);
    z.searchHere();
    z.setView(toulouse);
    done(zoneData([], { partial: true, loading: true }));
    await vi.advanceTimersByTimeAsync(0);
    expect(z.getState()).toMatchObject({ loading: false, failed: false });
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(read).toHaveBeenCalledTimes(1);
    expect(z.searchHere()).toBe(true);

    let fail: (e: unknown) => void = () => undefined;
    const read2 = vi
      .fn()
      .mockReturnValueOnce(new Promise<PracticalData>((_, rej) => (fail = rej)))
      .mockResolvedValue(zoneData([]));
    const w = make(read2);
    w.setView(view);
    w.searchHere();
    w.setView(toulouse);
    fail(netError);
    await vi.advanceTimersByTimeAsync(0);
    expect(w.getState()).toMatchObject({ failed: false, loading: false });
  });

  it("« Réessayer » après déplacement lance une nouvelle recherche, pas l'ancienne zone", async () => {
    const read = vi
      .fn()
      .mockRejectedValueOnce(netError)
      .mockResolvedValue(zoneData([place("t", 43.45, 1.35)]));
    const z = make(read);
    z.setView(view);
    z.searchHere();
    await vi.advanceTimersByTimeAsync(0);
    expect(z.getState().failed).toBe(true);
    z.setView(toulouse);
    expect(z.retry()).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    const asked = read.mock.calls[1]?.[0] as { south: number; north: number };
    expect(asked.south).toBeLessThanOrEqual(toulouse.south);
    expect(asked.north).toBeGreaterThanOrEqual(toulouse.north);
  });

  it("une zone refusée (400) n'est jamais relue : aucun bouton, la vue suivante repart", async () => {
    const refusal = Object.assign(new Error("refus"), { status: 400 });
    const read = vi.fn().mockRejectedValueOnce(refusal).mockResolvedValue(zoneData([]));
    const z = make(read);
    z.setView(view);
    z.searchHere();
    await vi.advanceTimersByTimeAsync(0);
    expect(z.getState()).toMatchObject({ refused: true, failed: false, loading: false });
    expect(zoneNeedsSearch(z.getState())).toBe(false);
    expect(z.searchHere()).toBe(false);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(read).toHaveBeenCalledTimes(1);
    z.setView(toulouse);
    expect(z.getState().refused).toBe(false);
    expect(z.searchHere()).toBe(true);
  });

  it("une réponse complète remplace son emprise : une station vue seule puis fusionnée n'existe qu'une fois", async () => {
    const z = make(vi.fn());
    z.ingest(opening([place("osm-seule", 42.7, 2.9, "Total")]));
    z.ingest(opening([place("fusionnee", 42.7001, 2.9001, "Total")]));
    expect([...z.getState().places.keys()]).toEqual(["fusionnee"]);
    // Une zone lue : les lieux de son emprise sont remplacés, ceux d'ailleurs restent.
    const read = vi.fn().mockResolvedValue(zoneData([place("zone-b", 42.48, 3.12)]));
    const w = make(read);
    w.ingest(opening([place("ancienne", 42.5, 3.12), place("loin", 43.9, 3.0)]));
    w.setView(toulouse);
    w.searchHere();
    await vi.advanceTimersByTimeAsync(0);
    const v = { south: 42.45, west: 3.1, north: 42.55, east: 3.14 };
    w.setView(v);
    w.searchHere();
    await vi.advanceTimersByTimeAsync(0);
    expect(w.getState().places.has("ancienne")).toBe(false);
    expect(w.getState().places.has("zone-b")).toBe(true);
  });

  it("montage double (StrictMode) : dispose puis attach, le contrôleur reste vivant ; démonté, il ne lit plus", async () => {
    const read = vi.fn().mockResolvedValue(zoneData([place("c", 42.48, 3.12)]));
    const z = make(read);
    z.dispose();
    z.attach();
    z.setView(view);
    expect(z.searchHere()).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(z.getState().places.has("c")).toBe(true);
    z.dispose();
    z.setView(toulouse);
    expect(z.searchHere()).toBe(false);
  });

  it("au-delà de 4 000 lieux : lieux et couverture évincés ensemble, jamais une zone chargée sans ses lieux", async () => {
    let i = 0;
    const read = vi
      .fn()
      .mockImplementation(async () => zoneData(many(150, 43 + i * 0.35, 1 + i * 0.1, 0.0005, `k${i++}-`)));
    const z = make(read);
    for (let k = 0; k < 30; k++) {
      z.setView({
        south: 43 + k * 0.35 - 0.02,
        west: 1 + k * 0.1 - 0.02,
        north: 43 + k * 0.35 + 0.02,
        east: 1 + k * 0.1 + 0.02,
      });
      z.searchHere();
      await vi.advanceTimersByTimeAsync(0);
    }
    expect(z.getState().places.size).toBeLessThanOrEqual(4000);
    for (const c of z.getState().cover) {
      if (c.t === "rect") expect([...z.getState().places.values()].some((p) => zoneContains(c.zone, p))).toBe(true);
    }
    expect(z.getState().cover.length).toBeLessThan(30);
  });
});
