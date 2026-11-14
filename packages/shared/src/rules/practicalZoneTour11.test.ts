// Petit lot de fin F, tour 11 : une réponse de zone lue avant un renouvellement des données ne retire pas ce qu'une couverture plus récente
// (une ouverture arrivée pendant la lecture) garantit.
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { PracticalData, PracticalPlace } from "./practical";
import { coverContains, type PracticalZone, zoneContains } from "./practicalZone";
import { createPracticalZone } from "./practicalZoneController";

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

it("une réponse de zone périmée n'efface pas une station neuve qu'une ouverture plus récente couvre encore", async () => {
  const old = [place("a", 48.85, 2.35), place("b", 48.86, 2.36)];
  const fresh = place("N", 48.851, 2.351);
  let release: ((d: PracticalData) => void) | null = null;
  const read = vi.fn().mockImplementation(() => new Promise<PracticalData>((r) => (release = r)));
  const z = createPracticalZone({ read, visible: () => true, statusOf: () => null });
  z.setView({ south: 48.84, west: 2.34, north: 48.86, east: 2.36 });
  expect(z.searchHere()).toBe(true);
  await vi.advanceTimersByTimeAsync(0);
  // Les données changent (N apparaît) ; une ouverture lue APRÈS arrive avant la réponse de zone.
  z.ingest({
    origin: { kind: "city", label: "X", lat: 48.85, lng: 2.35 },
    places: [...old, fresh],
    partial: false,
    attribution: att,
  });
  expect(z.getState().places.has("N")).toBe(true);
  (release as unknown as (d: PracticalData) => void)({ origin: null, places: old, partial: false, attribution: att });
  await vi.advanceTimersByTimeAsync(0);
  const s = z.getState();
  expect(s.places.has("N")).toBe(true);
  expect(coverContains(s.cover, fresh)).toBe(true);
  // Ce que la zone a lu est bien là aussi.
  expect(s.places.has("a") && s.places.has("b")).toBe(true);
});

it("la MÊME ouverture relue (disque déjà connu) pendant une lecture de zone périmée : la station neuve reste", async () => {
  const origin = { kind: "city" as const, label: "X", lat: 48.85, lng: 2.35 };
  const a = place("a", 48.85, 2.35);
  const c = place("c", 48.85, 2.75);
  const fresh = place("N", 48.85, 2.62);
  let release: ((d: PracticalData) => void) | null = null;
  let askedZone: PracticalZone | null = null;
  const read = vi.fn().mockImplementation((zone: PracticalZone) => {
    askedZone = zone;
    return new Promise<PracticalData>((r) => (release = r));
  });
  const z = createPracticalZone({ read, visible: () => true, statusOf: () => null });
  z.ingest({ origin, places: [a], partial: false, attribution: att });
  expect(z.getState().cover.length).toBe(1);
  z.setView({ south: 48.83, west: 2.7, north: 48.87, east: 2.8 });
  expect(z.searchHere()).toBe(true);
  await vi.advanceTimersByTimeAsync(0);
  expect(askedZone && zoneContains(askedZone, fresh)).toBe(true);
  // Les données sont renouvelées (N apparaît) ; la même ouverture est relue et arrive avant la réponse de zone.
  z.ingest({ origin, places: [a, fresh], partial: false, attribution: att });
  expect(z.getState().places.has("N")).toBe(true);
  // La seconde ouverture REMPLACE le disque connu : il n'y en a toujours qu'un (un doublon de disque ne passerait pas inaperçu).
  expect(z.getState().cover.length).toBe(1);
  (release as unknown as (d: PracticalData) => void)({ origin: null, places: [c], partial: false, attribution: att });
  await vi.advanceTimersByTimeAsync(0);
  const s = z.getState();
  expect(coverContains(s.cover, fresh)).toBe(true);
  expect(s.places.has("N")).toBe(true);
});
