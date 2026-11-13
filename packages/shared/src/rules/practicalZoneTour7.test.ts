// Petit lot de fin F, tour 7 : une page suivante ne déclare jamais couvertes des pages perdues (éviction par une autre lecture, page
// partielle), la reprise après 409 invalide l'ancienne version, la reprise forcée par l'éviction n'est pas « Trop de lieux ».
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PracticalData, PracticalPlace } from "./practical";
import {
  coverContains,
  PRACTICAL_ZONE_MAX_PAGES,
  type PracticalZone,
  placesInZonePage,
  viewCovered,
  zoneContains,
  zoneForRequest,
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
const make = (read: (z: PracticalZone, cursor?: string) => Promise<PracticalData>) =>
  createPracticalZone({
    read: read as never,
    visible: () => true,
    statusOf: (e) => (e instanceof Error && "status" in e ? (e as { status: number }).status : null),
  });

/** 19 régions de 199 lieux, éloignées l'une de l'autre : de quoi remplir la mémoire sans jamais couper une réponse. */
function regions(n: number): PracticalPlace[] {
  const all: PracticalPlace[] = [];
  for (let r = 0; r < n; r++)
    for (let k = 0; k < 199; k++)
      all.push(place(`r${r}-${k}`, 43.0 + r * 0.3 + 0.01 + (k % 14) * 0.003, 0.5 + 0.01 + Math.floor(k / 14) * 0.003));
  return all;
}
/** Une zone dense : 3 × 3 cases de 30 lieux (270 lieux, deux pages). */
function dense(tag = "c", shift = 0): PracticalPlace[] {
  const all: PracticalPlace[] = [];
  for (let ci = 0; ci < 3; ci++)
    for (let cj = 0; cj < 3; cj++)
      for (let k = 0; k < 30; k++)
        all.push(
          place(
            `${tag}${ci}${cj}-${k}`,
            48.7 + ci * 0.1 + 0.001 + k * 0.0002 + shift,
            2.2 + cj * 0.1 + 0.001 + k * 0.0002,
          ),
        );
  return all;
}
/** Un faux serveur paginé : le vrai découpage par case ; `partialOn(page)` rend la page en « chargement ». */
function server(all: PracticalPlace[], partialOn?: (page: number) => boolean) {
  return vi.fn().mockImplementation(async (z: PracticalZone, cursor?: string): Promise<PracticalData> => {
    const page = cursor ? Number(cursor.split(":")[1]) : 0;
    const r = placesInZonePage(all, z, page);
    const partial = partialOn?.(page) ?? false;
    return {
      origin: null,
      places: r.places,
      partial,
      ...(partial ? { loading: true } : {}),
      attribution: att,
      ...(r.more
        ? {
            truncated: true,
            partialCells: r.partialCells,
            ...(page + 1 < PRACTICAL_ZONE_MAX_PAGES ? { nextCursor: `x:${page + 1}` } : {}),
          }
        : {}),
    };
  });
}
async function fill(z: ReturnType<typeof make>, n: number) {
  for (let r = 0; r < n; r++) {
    z.setView({ south: 43.0 + r * 0.3 + 0.005, west: 0.505, north: 43.0 + r * 0.3 + 0.095, east: 0.595 });
    z.searchHere();
    await vi.advanceTimersByTimeAsync(0);
  }
}
/** Les lieux denses gardés et ceux que la couverture déclare chargés : jamais « couvert » sans être en mémoire. */
function kept(z: ReturnType<typeof make>, all: PracticalPlace[]) {
  const s = z.getState();
  const mine = all.filter((p) => p.id.startsWith("c"));
  return {
    kept: mine.filter((p) => s.places.has(p.id)).length,
    covered: mine.filter((p) => coverContains(s.cover, p)).length,
    lostButCovered: mine.filter((p) => coverContains(s.cover, p) && !s.places.has(p.id)).length,
  };
}

describe("pages précédentes perdues alors que leurs cases restent déclarées couvertes", () => {
  it("A : une lecture d'ouverture évince la mémoire entre deux pages : la page suivante ne déclare rien de couvert", async () => {
    const d = dense();
    const read = server([...regions(19), ...d]);
    const z = make(read);
    await fill(z, 18);
    z.setView({ south: 48.8, west: 2.3, north: 48.9, east: 2.4 });
    z.searchHere();
    await vi.advanceTimersByTimeAsync(0);
    expect(z.getState().places.size).toBe(3782);
    // Une relecture de l'ouverture (ville) apporte 250 lieux ailleurs : 4 032 > 4 000, toute la mémoire sort.
    z.ingest({
      origin: { kind: "city", label: "Y", lat: 45, lng: 5 },
      places: Array.from({ length: 250 }, (_, i) => place(`y${i}`, 45 + i * 0.0003, 5)),
      partial: false,
      attribution: att,
    });
    expect(z.getState().places.size).toBe(250);
    z.setView({ south: 48.705, west: 2.205, north: 48.995, east: 2.495 });
    // La suite de l'ancienne série n'existe plus : le bouton repart de la première page.
    expect(zoneNeedsSearch(z.getState())).toBe(true);
    expect(z.searchHere()).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(read.mock.calls.at(-1)?.[1]).toBeUndefined();
    expect(kept(z, d).lostButCovered).toBe(0);
    // Deuxième page de la nouvelle série : tout est là, tout est couvert, plus de bouton.
    expect(zoneNeedsSearch(z.getState())).toBe(true);
    z.searchHere();
    await vi.advanceTimersByTimeAsync(0);
    expect(kept(z, d)).toEqual({ kept: 270, covered: 270, lostButCovered: 0 });
    expect(zoneNeedsSearch(z.getState())).toBe(false);
  });

  it("A' : l'éviction a lieu pendant que la page suivante est en vol : sa réponse ne déclare rien de couvert", async () => {
    const d = dense();
    const inner = server([...regions(19), ...d]);
    let release: (() => void) | null = null;
    const read = vi.fn().mockImplementation(async (zone: PracticalZone, cursor?: string) => {
      const data = await inner(zone, cursor);
      if (cursor) await new Promise<void>((r) => (release = r));
      return data;
    });
    const z = make(read);
    await fill(z, 18);
    z.setView({ south: 48.8, west: 2.3, north: 48.9, east: 2.4 });
    z.searchHere();
    await vi.advanceTimersByTimeAsync(0);
    z.setView({ south: 48.705, west: 2.205, north: 48.995, east: 2.495 });
    z.searchHere(); // la page suivante part
    await vi.advanceTimersByTimeAsync(0);
    z.ingest({
      origin: { kind: "city", label: "Y", lat: 45, lng: 5 },
      places: Array.from({ length: 250 }, (_, i) => place(`y${i}`, 45 + i * 0.0003, 5)),
      partial: false,
      attribution: att,
    });
    (release as (() => void) | null)?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(kept(z, d).lostButCovered).toBe(0);
    expect(viewCovered(z.getState().cover, { south: 48.705, west: 2.205, north: 48.995, east: 2.495 })).toBe(false);
    expect(zoneNeedsSearch(z.getState())).toBe(true);
  });

  it("B : page suivante partielle avec mémoire pleine, puis relue complète : 270 lieux pour 270 couverts", async () => {
    const d = dense();
    let partialOnce = true;
    const read = server([...regions(19), ...d], (page) => {
      if (page === 1 && partialOnce) {
        partialOnce = false;
        return true;
      }
      return false;
    });
    const z = make(read);
    await fill(z, 19);
    z.setView({ south: 48.8, west: 2.3, north: 48.9, east: 2.4 });
    z.searchHere();
    await vi.advanceTimersByTimeAsync(0);
    expect(z.getState().places.size).toBe(3981);
    z.setView({ south: 48.705, west: 2.205, north: 48.995, east: 2.495 });
    z.searchHere(); // la page 1 revient partielle : 70 lieux, 4 051 > 4 000
    await vi.advanceTimersByTimeAsync(0);
    // Les 200 lieux de la page 0 sortent avec les autres zones : non (zone du curseur gardée).
    expect(kept(z, d)).toMatchObject({ kept: 270, lostButCovered: 0 });
    await vi.advanceTimersByTimeAsync(120_000); // relecture de la même page, complète
    expect(kept(z, d)).toEqual({ kept: 270, covered: 270, lostButCovered: 0 });
    expect(zoneNeedsSearch(z.getState())).toBe(false);
  });
});

describe("éviction pendant la page suivante (branche de la zone du curseur)", () => {
  it("3 750 entrées, première page à 3 950, dépassement à la page suivante : les 270 lieux de la zone et leur couverture", async () => {
    const d = dense("s");
    const read = server(d);
    // 25 lectures de 150 lieux, ailleurs.
    let i = 0;
    const fillRead = (): PracticalData => {
      const k = i++;
      return {
        origin: null,
        places: Array.from({ length: 150 }, (_, n) =>
          place(`f${k}-${n}`, 42 + (k % 13) * 0.5 + n * 0.0001, Math.floor(k / 13) * 3 + n * 0.0001),
        ),
        partial: false,
        attribution: att,
      };
    };
    const z = make(async (zone, cursor) => (i < 25 ? fillRead() : read(zone, cursor)));
    for (let k = 0; k < 25; k++) {
      z.setView({
        south: 42 + (k % 13) * 0.5 - 0.02,
        west: Math.floor(k / 13) * 3 - 0.02,
        north: 42 + (k % 13) * 0.5 + 0.02,
        east: Math.floor(k / 13) * 3 + 0.02,
      });
      z.searchHere();
      await vi.advanceTimersByTimeAsync(0);
    }
    expect(z.getState().places.size).toBe(3750);
    const view = { south: 48.8, west: 2.3, north: 48.82, east: 2.32 };
    z.setView(view);
    z.searchHere();
    await vi.advanceTimersByTimeAsync(0);
    expect(z.getState().places.size).toBe(3950);
    z.searchHere(); // 70 lieux de plus : 4 020 > 4 000
    await vi.advanceTimersByTimeAsync(0);
    const places = [...z.getState().places.values()];
    expect(places.length).toBe(270);
    expect(places.every((p) => p.id.startsWith("s"))).toBe(true);
    expect(viewCovered(z.getState().cover, view)).toBe(true);
    expect(zoneNeedsSearch(z.getState())).toBe(false);
  });
});

describe("409 : la reprise ne garde ni les lieux ni la couverture de l'ancienne version", () => {
  /** Une série de 270 lieux (version « A »), puis, entre deux pages, une version « B » de la zone avec une case qui a grossi. */
  function flip(after: PracticalPlace[]) {
    let data = dense("A");
    let flipped = false;
    const read = vi.fn().mockImplementation(async (z: PracticalZone, cursor?: string): Promise<PracticalData> => {
      if (cursor && !flipped) {
        flipped = true;
        data = after;
      }
      const page = cursor ? Number(cursor.split(":")[0]) : 0;
      const r = placesInZonePage(data, z, page);
      if (cursor && cursor.split(":")[1] !== r.version) throw Object.assign(new Error("409"), { status: 409 });
      return {
        origin: null,
        places: r.places,
        partial: false,
        attribution: att,
        ...(r.more
          ? {
              truncated: true,
              partialCells: r.partialCells,
              ...(page + 1 < PRACTICAL_ZONE_MAX_PAGES ? { nextCursor: `${page + 1}:${r.version}` } : {}),
            }
          : {}),
      };
    });
    return read;
  }

  it("la page 0 relue sert les NOUVELLES données : 270 lieux après la page suivante, aucun ancien, aucun doublon", async () => {
    const read = flip(dense("B", 0.00001));
    const z = make(read);
    z.setView({ south: 48.8, west: 2.3, north: 48.9, east: 2.4 });
    z.searchHere();
    await vi.advanceTimersByTimeAsync(0);
    z.setView({ south: 48.705, west: 2.205, north: 48.995, east: 2.495 });
    z.searchHere(); // page 1 : 409, puis page 0 relue seule
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(read.mock.calls.map((c) => c[1]?.slice(0, 2))).toEqual([undefined, "1:", undefined]);
    expect(z.getState().failed).toBe(false);
    // Après la relecture : 200 lieux de la nouvelle version, aucun de l'ancienne.
    expect([...z.getState().places.keys()].some((id) => id.startsWith("A"))).toBe(false);
    expect(zoneNeedsSearch(z.getState())).toBe(true);
    z.searchHere();
    await vi.advanceTimersByTimeAsync(0);
    const ids = [...z.getState().places.keys()];
    expect(ids.length).toBe(270);
    expect(ids.every((id) => id.startsWith("B"))).toBe(true);
    expect(zoneNeedsSearch(z.getState())).toBe(false);
  });

  it("une case autrefois complète a grossi : après la reprise elle n'est pas « chargée » sur l'ancien état", async () => {
    // Version B : la case (48.7-48.8 ; 2.2-2.3) passe de 30 à 250 lieux ; les autres cases gardent 30 lieux.
    const grown = dense("B").filter((p) => !(p.lat < 48.8 && p.lng < 2.3));
    for (let k = 0; k < 250; k++) grown.push(place(`Bg-${k}`, 48.7 + 0.001 + k * 0.0003, 2.2 + 0.001 + k * 0.0002));
    const read = flip(grown);
    const z = make(read);
    z.setView({ south: 48.8, west: 2.3, north: 48.9, east: 2.4 });
    z.searchHere();
    await vi.advanceTimersByTimeAsync(0);
    z.setView({ south: 48.705, west: 2.205, north: 48.795, east: 2.295 });
    z.searchHere(); // 409, page 0 relue : seulement 200 des 460 lieux de la nouvelle version
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(60_000);
    const s = z.getState();
    const view = { south: 48.705, west: 2.205, north: 48.795, east: 2.295 };
    const inView = [...s.places.values()].filter((p) => p.lat >= 48.7 && p.lat <= 48.8 && p.lng >= 2.2 && p.lng <= 2.3);
    // La case a grossi (250 lieux, 200 servis au plus par la page 0) : elle n'est plus « chargée », le bouton revient, aucun ancien lieu.
    expect(inView.every((p) => p.id.startsWith("B"))).toBe(true);
    expect(viewCovered(s.cover, view)).toBe(false);
    expect(zoneNeedsSearch(s)).toBe(true);
  });
});

describe("reprise forcée par l'éviction à la dernière page : pas « Trop de lieux »", () => {
  it("2 010 anciennes entrées dans la zone resserrée, dix pages de 200 : la lecture repart de la première page", async () => {
    const view = { south: 48.71, west: 2.21, north: 48.74, east: 2.24 };
    const tight = zoneForRequest(view, false);
    // Tous les lieux sont dans la case de la vue (487, 22), dans la zone resserrée.
    const inTight = (k: number) => ({ lat: 48.701 + (k % 90) * 0.001, lng: 2.201 + Math.floor(k / 90) * 0.0004 });
    // Les 2 010 anciennes entrées (une lecture partielle d'avant) sont dans la zone et restent : leur case n'est jamais « servie ».
    const old = Array.from({ length: 2010 }, (_, k) => place(`old${k}`, inTight(k).lat, inTight(k).lng));
    const page = (n: number, k: number, extra: Partial<PracticalData>): PracticalData => ({
      origin: null,
      places: Array.from({ length: n }, (_, i) =>
        place(`p${k}-${i}`, inTight(k * 200 + i).lat, inTight(k * 200 + i).lng),
      ),
      partial: false,
      attribution: att,
      ...extra,
    });
    const cell: [number, number] = [487, 22];
    expect(zoneContains(tight, { lat: 48.72, lng: 2.22 })).toBe(true);
    const read = vi.fn().mockImplementation(async (_zone: PracticalZone, cursor?: string) => {
      const k = cursor ? Number(cursor.split(":")[1]) : 0;
      if (read.mock.calls.length === 1) {
        // La première recherche (zone large) revient coupée : la zone devient « dense », la suivante sera resserrée.
        return page(1, 99, { truncated: true, partialCells: [cell] });
      }
      return page(200, k, {
        truncated: true,
        partialCells: [cell],
        ...(k + 1 < PRACTICAL_ZONE_MAX_PAGES ? { nextCursor: `x:${k + 1}` } : {}),
      });
    });
    const z = make(read);
    z.ingest({
      origin: { kind: "city", label: "Z", lat: 40, lng: 1 },
      places: old,
      partial: true,
      attribution: att,
    });
    z.setView(view);
    z.searchHere();
    await vi.advanceTimersByTimeAsync(0);
    expect(zoneNeedsSearch(z.getState())).toBe(true);
    for (let k = 0; k < PRACTICAL_ZONE_MAX_PAGES; k++) {
      expect(z.searchHere()).toBe(true);
      await vi.advanceTimersByTimeAsync(0);
    }
    const s = z.getState();
    // La dixième page a dépassé le plafond : tout est évincé sauf cette page, rien n'est couvert, ce n'est pas « Trop de lieux ».
    expect(s.tooDense).toBe(false);
    expect(s.cover).toEqual([]);
    expect(s.places.size).toBe(200);
    expect(zoneNeedsSearch(s)).toBe(true);
    expect(z.searchHere()).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(read.mock.calls.at(-1)?.[1]).toBeUndefined();
  });
});

describe("409 : l'invalidation vise toute couverture qui chevauche la zone du curseur", () => {
  const cellPlaces = (tag: string, ci: number, cj: number, n: number) =>
    Array.from({ length: n }, (_, k) =>
      place(`${tag}${ci}${cj}-${k}`, 48.7 + ci * 0.1 + 0.001 + k * 0.0003, 2.4 + cj * 0.1 + 0.001 + k * 0.0002),
    );
  /** Un bloc de 3 × 3 cases de 20 lieux (lng 2.4 à 2.7), plus deux cases qui grossissent : G (dans le bloc) et H (à l'est, hors du bloc). */
  const block = (tag: string) => {
    const out: PracticalPlace[] = [];
    for (let ci = 0; ci < 3; ci++) for (let cj = 0; cj < 3; cj++) out.push(...cellPlaces(tag, ci, cj, 20));
    return out;
  };
  const grown = (tag: string) => [
    ...block(tag),
    ...cellPlaces(`${tag}g`, 1, 2, 250), // G : lat 48.8-48.9, lng 2.6-2.7
    ...cellPlaces(`${tag}h`, 1, 4, 250), // H : lat 48.8-48.9, lng 2.8-2.9
  ];
  const serveFrom = (get: () => PracticalPlace[]) =>
    vi.fn().mockImplementation(async (zone: PracticalZone, cursor?: string): Promise<PracticalData> => {
      const page = cursor ? Number(cursor.split(":")[0]) : 0;
      const r = placesInZonePage(get(), zone, page);
      if (cursor && cursor.split(":")[1] !== r.version) throw Object.assign(new Error("409"), { status: 409 });
      return {
        origin: null,
        places: r.places,
        partial: false,
        attribution: att,
        ...(r.more
          ? {
              truncated: true,
              partialCells: r.partialCells,
              ...(page + 1 < PRACTICAL_ZONE_MAX_PAGES ? { nextCursor: `${page + 1}:${r.version}` } : {}),
            }
          : {}),
      };
    });

  it("une recherche antérieure sur un AUTRE rectangle qui chevauche la zone : sa couverture et ses anciens lieux sortent aussi", async () => {
    let data = block("A"); // 180 lieux : la première zone est complète
    const read = serveFrom(() => data);
    const z = make(read);
    z.setView({ south: 48.84, west: 2.34, north: 48.86, east: 2.36 });
    z.searchHere();
    await vi.advanceTimersByTimeAsync(0);
    const z1 = read.mock.calls[0]?.[0] as PracticalZone;
    // Les cases G et H grossissent : une zone chevauchante, à l'est, est coupée (deux cases incomplètes, une dans le chevauchement).
    data = grown("B");
    z.setView({ south: 48.84, west: 2.84, north: 48.86, east: 2.86 });
    expect(zoneNeedsSearch(z.getState())).toBe(true);
    z.searchHere();
    await vi.advanceTimersByTimeAsync(0);
    const z2 = read.mock.calls[1]?.[0] as PracticalZone;
    expect(z2).not.toEqual(z1);
    expect(z2.west).toBeLessThan(z1.east); // les deux rectangles se chevauchent
    // L'utilisateur appuie sur la case H (hors de la première zone) : la page suivante, alors que les données ont encore changé.
    data = grown("C");
    z.setView({ south: 48.81, west: 2.81, north: 48.89, east: 2.89 });
    expect(zoneNeedsSearch(z.getState())).toBe(true);
    z.searchHere();
    await vi.advanceTimersByTimeAsync(0);
    expect(read.mock.calls.map((c) => c[1]?.slice(0, 2))).toEqual([undefined, undefined, "1:", undefined]);
    // La case G (dans le chevauchement) n'est plus déclarée chargée par l'ancienne recherche : le bouton revient, aucun ancien lieu de la zone.
    const g = { south: 48.81, west: 2.61, north: 48.89, east: 2.69 };
    z.setView(g);
    const s = z.getState();
    expect(viewCovered(s.cover, g)).toBe(false);
    expect(zoneNeedsSearch(s)).toBe(true);
    const stale = [...s.places.values()].filter((p) => zoneContains(z2, p) && !p.id.startsWith("C"));
    expect(stale).toEqual([]);
  });

  it("409 reçu alors que la vue est déjà sortie de la zone : l'ancienne version n'y reste pas « chargée », aucune relance", async () => {
    // Version A : la case (48.7 ; 2.2) a 5 lieux (complète dès la page 0) ; version B : elle passe à 250 lieux.
    const before: PracticalPlace[] = [];
    for (let ci = 0; ci < 3; ci++)
      for (let cj = 0; cj < 3; cj++)
        for (let k = 0; k < (ci === 0 && cj === 0 ? 5 : 30); k++)
          before.push(
            place(`A${ci}${cj}-${k}`, 48.7 + ci * 0.1 + 0.001 + k * 0.0002, 2.2 + cj * 0.1 + 0.001 + k * 0.0002),
          );
    const after = [...before];
    for (let k = 0; k < 250; k++) after.push(place(`Bg-${k}`, 48.7 + 0.001 + k * 0.0003, 2.2 + 0.0015 + k * 0.0002));
    let data = before;
    let release: (() => void) | null = null;
    const inner = serveFrom(() => data);
    const read = vi.fn().mockImplementation(async (zone: PracticalZone, cursor?: string) => {
      if (!cursor) return inner(zone);
      data = after;
      await new Promise<void>((r) => (release = r));
      return inner(zone, cursor);
    });
    const z = make(read);
    z.setView({ south: 48.8, west: 2.3, north: 48.9, east: 2.4 });
    z.searchHere();
    await vi.advanceTimersByTimeAsync(0);
    z.setView({ south: 48.705, west: 2.205, north: 48.995, east: 2.495 });
    z.searchHere(); // la page 1 est en vol
    await vi.advanceTimersByTimeAsync(0);
    z.setView({ south: 47.0, west: 1.0, north: 47.05, east: 1.05 }); // la vue sort de la zone
    (release as (() => void) | null)?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(read).toHaveBeenCalledTimes(2); // ni relance de la page 0, ni boucle
    const cell = { south: 48.705, west: 2.205, north: 48.795, east: 2.295 };
    z.setView(cell);
    const s = z.getState();
    expect(viewCovered(s.cover, cell)).toBe(false);
    expect(zoneNeedsSearch(s)).toBe(true);
    expect(s.loading).toBe(false);
    expect(s.failed).toBe(false);
  });
});
