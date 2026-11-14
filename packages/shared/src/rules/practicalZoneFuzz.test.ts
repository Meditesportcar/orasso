// Essai aléatoire du contrôleur de Pratique (seeds fixes) : jamais un lieu déclaré couvert qui manque en mémoire, au plus 3 lectures par geste,
// pagination, 409 (versions qui changent), éviction, lectures en vol et remontages ; les rectangles des recherches se chevauchent au hasard.
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { type PracticalData, type PracticalPlace, placesAroundInfo } from "./practical";
import {
  coverContains,
  PRACTICAL_STORE_MAX,
  PRACTICAL_ZONE_MAX_PAGES,
  type PracticalZone,
  placesInZonePage,
} from "./practicalZone";
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
/** Le monde du bord partagé : un seul centre, sur le bord de deux zones demandées voisines (lng 2,0 à 2,7 et 2,7 à 3,4). */
const edgeCentres = [{ lat: 48.85, lng: 2.7 }];
const pick = (r: () => number, from: readonly { lat: number; lng: number }[] = centres) =>
  from[Math.floor(r() * from.length)] as { lat: number; lng: number };
function dataset(r: () => number, tag: string, from: readonly { lat: number; lng: number }[] = centres) {
  const all: PracticalPlace[] = [];
  from.forEach((c, ci) => {
    const n = 900 + Math.floor(r() * 900);
    for (let k = 0; k < n; k++) {
      const a = r() * Math.PI * 2,
        d = r() ** 0.7 * 0.25;
      all.push(place(`${tag}${ci}-${k}`, c.lat + Math.sin(a) * d, c.lng + Math.cos(a) * d));
    }
    // Des lieux exactement sur les bords des cases de 0,1° (donc des zones) : un bord partagé par deux rectangles voisins.
    for (let k = 0; k < 60; k++) {
      const a = r() * Math.PI * 2;
      const d = r() ** 0.7 * 0.25;
      const lat = c.lat + Math.sin(a) * d;
      const lng = c.lng + Math.cos(a) * d;
      all.push(
        k % 2 === 0
          ? place(`${tag}${ci}-e${k}`, lat, Math.round(lng * 10) / 10)
          : place(`${tag}${ci}-e${k}`, Math.round(lat * 10) / 10, lng),
      );
    }
  });
  return all;
}

type Cover = ReturnType<ReturnType<typeof createPracticalZone>["getState"]>["cover"][number];
const geoKey = (c: Cover): string =>
  c.t === "rect" ? `r:${c.zone.south},${c.zone.west},${c.zone.north},${c.zone.east}` : `d:${c.lat},${c.lng},${c.km}`;
const coverKey = (c: Cover): string => `${geoKey(c)}#${c.except?.size ?? 0}`;
const cellCentre = (key: string) => {
  const [i, j] = key.split(",").map(Number) as [number, number];
  return { lat: (i + 0.5) / 10, lng: (j + 0.5) / 10 };
};

const st = { cursor: 0, c409: 0, drops: 0, maxSize: 0 };

async function run(seed: number, opts: { flips: boolean; inflight: boolean; edge?: boolean }) {
  const world = opts.edge ? edgeCentres : centres;
  const r = rng(seed);
  const A = dataset(r, "s", world);
  if (opts.edge)
    // Quelques lieux de plus exactement sur le bord partagé (lng 2,7), donc dans les deux zones voisines.
    for (let k = 0; k < 15; k++) A.push(place(`s-bord${k}`, 48.6 + r() * 0.5, 2.7));
  let data = A;
  const stable = new Set(A.map((p) => p.id));
  const pending: {
    resolve: (v: PracticalData) => void;
    reject: (e: unknown) => void;
    v: PracticalData | Error;
    epoch: number;
  }[] = [];
  /** La version des données (change à chaque `flip`) et les couvertures apparues depuis (clés), pour le contrôle « couvert = en mémoire ». */
  let epoch = 0;
  /**
   * La version des données à laquelle la réponse (ou l'ouverture) qui a CRÉÉ chaque couverture a été lue, indépendamment de sa géométrie :
   * -1 si inconnue (réponse lue sur une version d'avant). Une couverture née à la version courante doit avoir tous ses lieux actuels en mémoire.
   * La couverture créée à un geste est la dernière du tableau ; les autres objets nouveaux sont les mêmes couvertures avec plus d'exceptions
   * (même ordre, même géométrie) et gardent la naissance de l'ancienne.
   */
  const born = new Map<Cover, number>();
  let reads = 0;
  const read = async (z: PracticalZone, cursor?: string): Promise<PracticalData> => {
    reads++;
    const myEpoch = epoch;
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
    return new Promise((resolve, reject) => pending.push({ resolve, reject, v, epoch: myEpoch }));
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
  /** Contrôles de couverture après chaque geste (voir plus bas). */
  const checkCover = (label: string, only: ReadonlySet<Cover> | null) => {
    const s = z.getState();
    // 1. Une case incomplète (`except`) d'une couverture plus récente n'est jamais couverte par une couverture plus ancienne.
    s.cover.forEach((c, j) => {
      if (c.t !== "rect" || !c.except) return;
      for (const key of c.except)
        for (let i = 0; i < j; i++) {
          const older = s.cover[i] as Cover;
          if (coverContains([older], cellCentre(key)))
            throw new Error(
              [
                `seed ${seed} ${label}: case incomplète ${key} couverte par une couverture plus ancienne (${coverKey(older)})`,
                ...log.slice(-15),
              ].join("\n"),
            );
        }
    });
    // 2. Pour chaque couverture apparue depuis le dernier changement de version, tous les lieux ACTUELS de ses cases complètes sont en mémoire.
    for (const c of s.cover) {
      if (born.get(c) !== epoch || (only && !only.has(c))) continue;
      const dLat = c.t === "disk" ? c.km / 111 + 0.01 : 0;
      const dLng = c.t === "disk" ? c.km / (111 * Math.cos((c.lat * Math.PI) / 180)) + 0.05 : 0;
      const box =
        c.t === "rect" ? c.zone : { south: c.lat - dLat, north: c.lat + dLat, west: c.lng - dLng, east: c.lng + dLng };
      for (const p of data)
        if (
          !s.places.has(p.id) &&
          p.lat >= box.south &&
          p.lat <= box.north &&
          p.lng >= box.west &&
          p.lng <= box.east &&
          coverContains([c], p)
        )
          throw new Error(
            [
              `seed ${seed} ${label}: lieu actuel ${p.id} couvert par ${coverKey(c)} absent de la mémoire`,
              ...log.slice(-15),
            ].join("\n"),
          );
    }
  };
  let prevSize = 0;
  for (let step = 0; step < 300; step++) {
    const x = r();
    const before = reads;
    const prevCover = new Set(z.getState().cover);
    const prevArr = [...prevCover];
    let unreliable = false;
    if (x < 0.3) {
      const c = pick(r, world);
      const h = 0.02 + r() * 0.25,
        w = 0.02 + r() * 0.35;
      const lat = c.lat + (r() - 0.5) * 0.4,
        lng = c.lng + (r() - 0.5) * 0.5;
      if (opts.edge) {
        // Deux vues minuscules qui donnent deux zones voisines exactes (lng 2,0 à 2,7 et 2,7 à 3,4).
        const lo = r() < 0.5 ? 2.35 : 3.05;
        // (Parfois large, dans la zone : elle contient alors des cases incomplètes, donc des pages suivantes.)
        if (r() < 0.5) z.setView({ south: 48.84, north: 48.86, west: lo - 0.01, east: lo + 0.01 });
        else z.setView({ south: 48.65, north: 49.05, west: lo - 0.3, east: lo + 0.3 });
        log.push(`view bord ${lo}`);
      } else if (r() < 0.4) {
        // Vue minuscule sur un réseau de 0,7° : les zones demandées se touchent exactement par un bord (bord partagé).
        const la = (Math.floor(c.lat * 10) + 7 * (Math.floor(r() * 3) - 1)) / 10 + 0.05;
        const lo = (Math.floor(c.lng * 10) + 7 * (Math.floor(r() * 3) - 1)) / 10 + 0.05;
        z.setView({ south: la - 0.01, north: la + 0.01, west: lo - 0.01, east: lo + 0.01 });
        log.push(`view réseau ${la.toFixed(2)},${lo.toFixed(2)}`);
      } else {
        z.setView({ south: lat - h / 2, north: lat + h / 2, west: lng - w / 2, east: lng + w / 2 });
        log.push(`view ${lat.toFixed(3)},${lng.toFixed(3)} ${h.toFixed(2)}x${w.toFixed(2)}`);
      }
    } else if (x < 0.62) {
      const ok = z.searchHere();
      log.push(`search ${ok}`);
    } else if (x < 0.72) {
      const c = pick(r, world);
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
        const c = pick(r, world);
        next.push(place(`n${step}-${k}`, c.lat + (r() - 0.5) * 0.3, c.lng + (r() - 0.5) * 0.3));
      }
      const ids = new Set(next.map((p) => p.id));
      for (const id of [...stable]) if (!ids.has(id)) stable.delete(id);
      data = next;
      epoch++;
      unreliable = true;
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
        if (p.epoch !== epoch) {
          unreliable = true;
          // Une réponse d'une version d'avant peut retirer de la mémoire des lieux actuels (elle ne les connaît pas) : plus rien n'est contrôlable jusqu'aux prochaines lectures.
          for (const c of born.keys()) born.set(c, -1);
        } // réponse lue sur une version d'avant : elle ne prouve rien sur les données actuelles
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
    const appeared = new Set<Cover>();
    {
      const now = z.getState().cover;
      let j = 0;
      now.forEach((c, idx) => {
        if (prevCover.has(c)) {
          j = prevArr.indexOf(c) + 1;
          return;
        }
        if (idx === now.length - 1) {
          born.set(c, unreliable ? -1 : epoch); // créée à ce geste
          if (!unreliable) appeared.add(c);
          return;
        }
        while (j < prevArr.length && geoKey(prevArr[j] as Cover) !== geoKey(c)) j++;
        born.set(c, born.get(prevArr[j] as Cover) ?? -1);
        j++;
      });
    }
    check(`step ${step}`);
    // Les couvertures qui viennent d'apparaître à chaque geste, toutes celles de la version courante tous les 25 gestes (durée de la suite).
    checkCover(`step ${step}`, step % 25 === 0 ? null : appeared);
  }
  return reads;
}

it("fuzz données fixes, réponses immédiates", async () => {
  st.c409 = 0;
  st.maxSize = 0;
  for (let s = 1; s <= 2; s++) await run(s, { flips: false, inflight: false });
  // La mémoire a atteint le plafond : l'éviction (keepZone, débordement, reprise) a bien été exercée.
  expect(st.maxSize).toBeGreaterThan(PRACTICAL_STORE_MAX - 300);
  expect(st.maxSize).toBeLessThanOrEqual(PRACTICAL_STORE_MAX);
}, 120_000);
it("fuzz données fixes, réponses en vol", async () => {
  st.c409 = 0;
  st.maxSize = 0;
  for (let s = 1; s <= 2; s++) await run(s, { flips: false, inflight: true });
  // La mémoire a atteint le plafond : l'éviction (keepZone, débordement, reprise) a bien été exercée.
  expect(st.maxSize).toBeGreaterThan(PRACTICAL_STORE_MAX - 300);
  expect(st.maxSize).toBeLessThanOrEqual(PRACTICAL_STORE_MAX);
}, 120_000);
it("fuzz versions qui changent (409), en vol", async () => {
  st.c409 = 0;
  st.maxSize = 0;
  for (let s = 1; s <= 2; s++) await run(s, { flips: true, inflight: true });
  // Réponses en vol et versions qui changent : moins de lectures aboutissent, la mémoire monte moins haut (l'éviction est prouvée par les trois autres).
  expect(st.maxSize).toBeGreaterThan(PRACTICAL_STORE_MAX - 600);
  expect(st.maxSize).toBeLessThanOrEqual(PRACTICAL_STORE_MAX);
  expect(st.c409).toBeGreaterThan(0);
}, 120_000);
it("fuzz versions qui changent (409), immédiat", async () => {
  st.c409 = 0;
  st.maxSize = 0;
  for (let s = 1; s <= 2; s++) await run(s, { flips: true, inflight: false });
  // La mémoire a atteint le plafond : l'éviction (keepZone, débordement, reprise) a bien été exercée.
  expect(st.maxSize).toBeGreaterThan(PRACTICAL_STORE_MAX - 300);
  expect(st.maxSize).toBeLessThanOrEqual(PRACTICAL_STORE_MAX);
  expect(st.c409).toBeGreaterThan(0);
}, 120_000);
it("fuzz du bord partagé : deux zones voisines, versions qui changent (409), en vol", async () => {
  st.c409 = 0;
  for (let s = 1; s <= 8; s++) await run(s, { flips: true, inflight: true, edge: true });
  expect(st.c409).toBeGreaterThan(0);
}, 120_000);
