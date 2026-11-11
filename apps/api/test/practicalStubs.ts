// Bouchons des deux sources de « Pratique » (lot R8q) : Overpass (lavage) et le jeu public des prix des carburants (stations).
// Aucun appel réseau ; chaque appel est gardé pour que les tests voient exactement ce que les sources reçoivent.
import { vi } from "vitest";

import { setExternalFetch } from "../src/lib/external/cache";

export type StubWash = { name?: string; lat: number; lon: number };
export type StubFuel = { adresse: string; ville: string; cp: string; lat: number; lon: number };
export type StubSource = "wash" | "fuel";

export type SourceCall = { source: StubSource; department: string; url: string; body: string };

/** `wash` / `fuel` : département → lieux. `fail` : la source répond 503. `hang` : la source ne répond jamais. */
export function practicalSources(
  data: { wash?: Record<string, StubWash[]>; fuel?: Record<string, StubFuel[]> },
  opts: { fail?: StubSource[]; hang?: StubSource[] } = {},
) {
  const calls: SourceCall[] = [];
  const fn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const body = init?.body ? String(init.body) : "";
    if (url.includes("overpass")) {
      const department = /FR-([0-9A-Z]+)/.exec(decodeURIComponent(body.replace(/\+/g, " ")))?.[1] ?? "";
      calls.push({ source: "wash", department, url, body });
      if (opts.hang?.includes("wash")) return new Promise<Response>(() => undefined);
      if (opts.fail?.includes("wash")) return new Response("panne", { status: 503 });
      return Response.json({
        elements: (data.wash?.[department] ?? []).map((p, i) => ({
          type: "node",
          id: i + 1,
          lat: p.lat,
          lon: p.lon,
          tags: { amenity: "car_wash", ...(p.name ? { name: p.name } : {}) },
        })),
      });
    }
    const where = new URL(url).searchParams.get("where") ?? "";
    const department = /"([0-9A-Z]+)"/.exec(where)?.[1] ?? "";
    calls.push({ source: "fuel", department, url, body });
    if (opts.hang?.includes("fuel")) return new Promise<Response>(() => undefined);
    if (opts.fail?.includes("fuel")) return new Response("panne", { status: 503 });
    return Response.json({
      results: (data.fuel?.[department] ?? []).map((s) => ({
        adresse: s.adresse,
        ville: s.ville,
        cp: s.cp,
        geom: { lat: s.lat, lon: s.lon },
        gazole_prix: 1.789,
        sp95_prix: 1.859,
        gazole_maj: "2026-10-16T07:27:43+00:00",
      })),
    });
  });
  setExternalFetch(fn as unknown as typeof fetch);
  return {
    fn,
    calls,
    count: (source: StubSource, department?: string) =>
      calls.filter((c) => c.source === source && (!department || c.department === department)).length,
  };
}
