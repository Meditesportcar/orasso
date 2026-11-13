// Essai aléatoire du contrôleur de Pratique (seeds fixes) : jamais un lieu déclaré couvert qui manque en mémoire, au plus 3 lectures par geste,
// pagination, 409 (versions qui changent), éviction, lectures en vol et remontages ; les rectangles des recherches se chevauchent au hasard.
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { type PracticalData, type PracticalPlace, placesAroundInfo } from "./practical";
import { coverContains, PRACTICAL_ZONE_MAX_PAGES, type PracticalZone, placesInZonePage } from "./practicalZone";
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
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const centres = [
  { lat: 48.85, lng: 2.35 },
  { lat: 43.3, lng: 5.4 },
  { lat: 45.75, lng: 4.85 },
  { lat: 47.2, lng: -1.55 },
];
const pick = (r: () => number) => centres[Math.floor(r() * centres.length)] as { lat: number; lng: number };
function dataset(r: () => number, tag: string) {
  const all: PracticalPlace[] = [];
  centres.forEach((c, ci) => {
    const n = 900 + Math.floor(r() * 900);
    for (let k = 0; k < n; k++) {
      const a = r() * Math.PI * 2,
        d = r() ** 0.7 * 0.25;
      all.push(place(`${tag}${ci}-${k}`, c.lat + Math.sin(a) * d, c.lng + Math.cos(a) * d));
    }
  });
  return all;
}

const st = { cursor: 0, c409: 0, drops: 0, maxSize: 0 };

async function run(seed: number, opts: { flips: boolean; inflight: boolean }) {
  const r = rng(seed);
  const A = dataset(r, "s");
  let data = A;
  const stable = new Set(A.map((p) => p.id));
  const pending: { resolve: (v: PracticalData) => void; reject: (e: unknown) => void; v: PracticalData | Error }[] = [];
  let reads = 0;
  const read = async (z: PracticalZone, cursor?: string): Promise<PracticalData> => {
    reads++;
    if (cursor) st.cursor++;
    const page = cursor ? Number(cursor.split(":")[0]) : 0;
    const pg = placesInZonePage(data, z, page);
    let v: PracticalData | Error;
    const fail = r();
    if (fail < 0.05) v = Object.assign(new Error("net"), { status: fail < 0.025 ? 0 : 503 });
    else if (cursor && cursor.split(":")[1] !== pg.version) {
      v = Object.assign(new Error("409"), { status: 409 });
      st.c409++;
    } else {
      const partial = r() < 0.12;
      v = {
        origin: null,
        places: partial ? pg.places.slice(0, Math.floor(pg.places.length * r())) : pg.places,
        partial,
        ...(partial ? { loading: true as const } : {}),
        attribution: att,
        ...(pg.more
          ? {
              truncated: true as const,
              partialCells: pg.partialCells,
              ...(page + 1 < PRACTICAL_ZONE_MAX_PAGES ? { nextCursor: `${page + 1}:${pg.version}` } : {}),
            }
          : {}),
      };
    }
    if (!opts.inflight) {
      if (v instanceof Error) throw v;
      return v;
    }
    return new Promise((resolve, reject) => pending.push({ resolve, reject, v }));
  };
  const z = createPracticalZone({
    read,
    visible: () => true,
    statusOf: (e) => (e as { status?: number }).status ?? null,
  });
  const log: string[] = [];
  const check = (label: string) => {
    const s = z.getState();
    let bad = 0;
    let ex = "";
    for (const p of data)
      if (stable.has(p.id) && coverContains(s.cover, p) && !s.places.has(p.id)) {
        bad++;
        ex = p.id;
      }
    if (bad)
      throw new Error(
        `seed ${seed} ${label}: ${bad} lieux couverts absents (ex ${ex}), mémoire ${s.places.size}\n${log.slice(-15).join("\n")}`,
      );
  };
  let prevSize = 0;
  for (let step = 0; step < 400; step++) {
    const x = r();
    const before = reads;
    if (x < 0.3) {
      const c = pick(r);
      const h = 0.02 + r() * 0.25,
        w = 0.02 + r() * 0.35;
      const lat = c.lat + (r() - 0.5) * 0.4,
        lng = c.lng + (r() - 0.5) * 0.5;
      z.setView({ south: lat - h / 2, north: lat + h / 2, west: lng - w / 2, east: lng + w / 2 });
      log.push(`view ${lat.toFixed(3)},${lng.toFixed(3)} ${h.toFixed(2)}x${w.toFixed(2)}`);
    } else if (x < 0.62) {
      const ok = z.searchHere();
      log.push(`search ${ok}`);
    } else if (x < 0.72) {
      const c = pick(r);
      const o = { lat: c.lat + (r() - 0.5) * 0.3, lng: c.lng + (r() - 0.5) * 0.3 };
      const info = placesAroundInfo(data, o);
      const partial = r() < 0.2;
      z.ingest({
        origin: { kind: "city", label: "x", ...o },
        places: info.places,
        partial,
        attribution: att,
        ...(info.cut ? { truncated: true as const, coveredKm: info.coveredKm } : {}),
      });
      log.push(`ingest ${partial ? "partial" : ""} ${info.places.length}`);
    } else if (x < 0.8 && opts.flips) {
      // nouvelle version : une partie des lieux disparaît, d'autres changent d'identifiant (fusion), d'autres apparaissent
      const next = data
        .filter(() => r() > 0.03)
        .map((p) => (r() < 0.03 ? place(`m${p.id}`, p.lat + 0.00001, p.lng) : p));
      for (let k = 0; k < 60; k++) {
        const c = pick(r);
        next.push(place(`n${step}-${k}`, c.lat + (r() - 0.5) * 0.3, c.lng + (r() - 0.5) * 0.3));
      }
      const ids = new Set(next.map((p) => p.id));
      for (const id of [...stable]) if (!ids.has(id)) stable.delete(id);
      data = next;
      log.push("flip");
    } else if (x < 0.83) {
      z.retry();
      log.push("retry");
    } else if (x < 0.85) {
      if (r() < 0.8) {
        z.dispose();
        z.attach();
        log.push("remount");
      } else {
        z.resume();
        log.push("resume");
      }
    } else {
      if (opts.inflight && pending.length) {
        const p = pending.shift()!;
        log.push(`deliver ${p.v instanceof Error ? "409" : (p.v as PracticalData).places.length}`);
        if (p.v instanceof Error) p.reject(p.v);
        else p.resolve(p.v);
      }
      await vi.advanceTimersByTimeAsync(r() < 0.3 ? 20_000 : 0);
    }
    await vi.advanceTimersByTimeAsync(0);
    if (reads - before > 3) throw new Error(`seed ${seed}: ${reads - before} lectures pour une action`);
    {
      const sz = z.getState().places.size;
      if (sz < prevSize - 150) st.drops++;
      prevSize = sz;
      st.maxSize = Math.max(st.maxSize, sz);
    }
    check(`step ${step}`);
  }
  return reads;
}

it("fuzz données fixes, réponses immédiates", async () => {
  st.c409 = 0;
  for (let s = 1; s <= 4; s++) await run(s, { flips: false, inflight: false });
}, 120_000);
it("fuzz données fixes, réponses en vol", async () => {
  st.c409 = 0;
  for (let s = 1; s <= 4; s++) await run(s, { flips: false, inflight: true });
}, 120_000);
it("fuzz versions qui changent (409), en vol", async () => {
  st.c409 = 0;
  for (let s = 1; s <= 4; s++) await run(s, { flips: true, inflight: true });
  expect(st.c409).toBeGreaterThan(0);
}, 120_000);
it("fuzz versions qui changent (409), immédiat", async () => {
  st.c409 = 0;
  for (let s = 1; s <= 4; s++) await run(s, { flips: true, inflight: false });
  expect(st.c409).toBeGreaterThan(0);
}, 120_000);
