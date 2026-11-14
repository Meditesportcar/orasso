// Petit lot de fin F, tour 4 : répartition des lieux par case (zone dense), couverture par case, remplacement dans l'emprise garantie d'une
// réponse coupée, plafond à exactement 60 km, ordres de carte avant l'initialisation, relance au retour du réseau.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PracticalData, PracticalPlace } from "./practical";
import {
  cellKey,
  coverContains,
  createOrderQueue,
  placesInZoneInfo,
  viewCovered,
  zoneAround,
  zoneTooBig,
} from "./practicalZone";
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
const zoneData = (places: PracticalPlace[], extra: Partial<PracticalData> = {}): PracticalData => ({
  origin: null,
  places,
  partial: false,
  attribution: att,
  ...extra,
});
const netError = Object.assign(new Error("réseau"), { status: 0 });
function make(read: (z: unknown) => Promise<PracticalData>) {
  return createPracticalZone({
    read: read as never,
    visible: () => true,
    statusOf: (e) => (e instanceof Error && "status" in e ? (e as { status: number }).status : null),
  });
}

describe("zone dense : répartition par case", () => {
  // 220 lieux au centre d'une case (48,80 à 48,81 N ; 2,30 à 2,31 E) et un lavage dans la case voisine (au nord), près du coin, dans la vue.
  const centre = Array.from({ length: 220 }, (_, i) =>
    place(`c${i}`, 48.805 + (i % 20) * 0.00005, 2.305 + Math.floor(i / 20) * 0.00005),
  );
  const coin = place("lavage-coin", 48.9006, 2.3995);
  const zone = { south: 48.7, west: 2.2, north: 49.0, east: 2.5 };

  it("le lavage du coin arrive à la première lecture, même sous 220 lieux au centre d'une case voisine", () => {
    const info = placesInZoneInfo([...centre, coin], zone);
    expect(info.cut).toBe(true);
    expect(info.places).toHaveLength(200);
    expect(info.places.map((p) => p.id)).toContain("lavage-coin");
    // Seule la case du centre est incomplète : toutes les autres (vides comprises) sont complètes.
    expect(info.partialCells).toEqual([[488, 23]]);
  });

  it("couverture par case : la case incomplète garde le bouton, une vue sur les autres cases est chargée", async () => {
    const info = placesInZoneInfo([...centre, coin], zone);
    const read = vi.fn().mockResolvedValue(zoneData(info.places, { truncated: true, partialCells: info.partialCells }));
    const z = make(read);
    const vue = { south: 48.9002, west: 2.395, north: 48.9012, east: 2.405 };
    z.setView(vue);
    z.searchHere();
    await vi.advanceTimersByTimeAsync(0);
    expect(z.getState().places.has("lavage-coin")).toBe(true);
    // Le coin est dans une case complète : plus de bouton pour la vue du lavage.
    expect(zoneNeedsSearch(z.getState())).toBe(false);
    // La case du centre est incomplète : une vue dessus propose encore le bouton.
    z.setView({ south: 48.803, west: 2.303, north: 48.807, east: 2.307 });
    expect(zoneNeedsSearch(z.getState())).toBe(true);
    expect(coverContains(z.getState().cover, { lat: 48.805, lng: 2.305 })).toBe(false);
    expect(coverContains(z.getState().cover, { lat: 48.9006, lng: 2.3995 })).toBe(true);
    expect(cellKey({ lat: 48.805, lng: 2.305 })).toBe("488,23");
  });

  it("une case qui dépasse seule le plafond : message « trop de lieux », plus de bouton, jamais de lecture répétée", async () => {
    // Tour 5 : une première réponse porte un curseur (page suivante de la même zone) ; seule la dernière page, encore incomplète, ferme la porte.
    const read = vi
      .fn()
      .mockResolvedValueOnce(
        zoneData(centre.slice(0, 200), { truncated: true, partialCells: [[488, 23]], nextCursor: "page-2" }),
      )
      .mockResolvedValue(zoneData(centre.slice(0, 200), { truncated: true, partialCells: [[488, 23]] }));
    const z = make(read);
    const vue = { south: 48.803, west: 2.303, north: 48.807, east: 2.307 };
    z.setView(vue);
    z.searchHere();
    await vi.advanceTimersByTimeAsync(0);
    expect(zoneNeedsSearch(z.getState())).toBe(true);
    z.searchHere();
    await vi.advanceTimersByTimeAsync(0);
    // Tour 6 : « trop de lieux » seulement après la zone RESSERRÉE : la dernière page de la zone large ne le pose pas, la recherche suivante
    // (zone resserrée sur la vue) le pose si elle revient coupée aussi.
    expect(z.getState().tooDense).toBe(false);
    expect(z.searchHere()).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(z.getState().tooDense).toBe(true);
    expect(zoneNeedsSearch(z.getState())).toBe(false);
    expect(z.searchHere()).toBe(false);
    expect(read).toHaveBeenCalledTimes(3);
    expect(viewCovered(z.getState().cover, vue)).toBe(false);
  });
});

describe("réponse coupée : remplacement dans l'emprise garantie", () => {
  it("une station reçue pendant une réponse partielle, puis sa version fusionnée dans une réponse coupée : une seule station", async () => {
    const zoneRect = { south: 48.7, west: 2.2, north: 49.0, east: 2.5 };
    const view = { south: 48.9, west: 2.4, north: 48.91, east: 2.41 };
    const partial = zoneData([place("osm-seule", 48.905, 2.405, "Total")], { partial: true, loading: true });
    const cut = zoneData([place("fusionnee", 48.9051, 2.4051, "Total"), place("autre", 48.8, 2.3)], {
      truncated: true,
      partialCells: [[488, 23]],
    });
    const read = vi.fn().mockResolvedValueOnce(partial).mockResolvedValue(cut);
    const z = make(read);
    z.setView(view);
    z.searchHere();
    await vi.advanceTimersByTimeAsync(0);
    expect(z.getState().places.has("osm-seule")).toBe(true);
    await vi.advanceTimersByTimeAsync(3_000);
    const ids = [...z.getState().places.keys()].sort();
    expect(ids).toEqual(["autre", "fusionnee"]);
    expect(zoneRect.south).toBeLessThan(view.south);
  });
});

describe("plafond à exactement 60 km", () => {
  it("59,99 km et 60 km exactement (Blois, flottants) ne sont pas trop grands ; 60,1 km l'est", () => {
    const blois = { lat: 47.599, lng: 1.33 };
    expect(zoneTooBig(zoneAround(blois, 59.99))).toBe(false);
    expect(zoneTooBig(zoneAround(blois, 60))).toBe(false);
    expect(zoneTooBig(zoneAround(blois, 60.1))).toBe(true);
    for (let lat = 41.3; lat <= 51.1; lat += 0.0371)
      expect(zoneTooBig(zoneAround({ lat, lng: 2.3 }, 60)), `${lat}`).toBe(false);
  });
});

describe("ordres de carte avant l'initialisation", () => {
  it("le dernier ordre reçu avant que la carte soit prête est appliqué à l'initialisation, une seule fois", () => {
    const q = createOrderQueue<{ seq: number; to: string }>();
    const applied: string[] = [];
    expect(q.offer({ seq: 1, to: "Toulouse" })).toBe(true);
    expect(q.offer({ seq: 2, to: "Banyuls" })).toBe(true);
    // La carte devient prête (initialisation retardée) : seul le dernier est appliqué.
    q.flush((o) => applied.push(o.to));
    q.flush((o) => applied.push(o.to));
    expect(applied).toEqual(["Banyuls"]);
    // Un ordre déjà appliqué (ou plus ancien) n'est pas rejoué.
    expect(q.offer({ seq: 2, to: "Banyuls" })).toBe(false);
    expect(q.offer({ seq: 3, to: "Cerbère" })).toBe(true);
    q.flush((o) => applied.push(o.to));
    expect(applied).toEqual(["Banyuls", "Cerbère"]);
  });
  it("les ordres antérieurs au montage de la carte sont réputés appliqués par sa vue de départ", () => {
    const q = createOrderQueue<{ seq: number }>();
    q.skipTo(4);
    expect(q.offer({ seq: 4 })).toBe(false);
    expect(q.offer({ seq: 5 })).toBe(true);
  });
});

describe("retour du réseau", () => {
  it("un échec réseau est relu UNE fois au retour (resume), jamais en boucle", async () => {
    const view = { south: 42.47, west: 3.1, north: 42.53, east: 3.16 };
    const read = vi
      .fn()
      .mockRejectedValueOnce(netError)
      .mockResolvedValue(zoneData([place("c", 42.5, 3.12)]));
    const z = make(read);
    z.setView(view);
    z.searchHere();
    await vi.advanceTimersByTimeAsync(0);
    expect(z.getState()).toMatchObject({ failed: true, offline: true });
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(read).toHaveBeenCalledTimes(1);
    z.resume();
    await vi.advanceTimersByTimeAsync(0);
    expect(read).toHaveBeenCalledTimes(2);
    expect(z.getState()).toMatchObject({ failed: false, loading: false });
    z.resume();
    await vi.advanceTimersByTimeAsync(0);
    expect(read).toHaveBeenCalledTimes(2);
  });
});
