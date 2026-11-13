// Bouchons des deux sources de « Pratique » (lot R8q) : Overpass (lavage) et le jeu public des prix des carburants (stations).
// Aucun appel réseau ; chaque appel est gardé pour que les tests voient exactement ce que les sources reçoivent.
import { vi } from "vitest";

import { setExternalFetch } from "../src/lib/external/cache";
import { resetOverpassQueue } from "../src/lib/external/overpass";

/**
 * Un élément d'OpenStreetMap. Par défaut un lavage (`amenity=car_wash`) ; `amenity: "fuel"` : une station-service,
 * `carWash` y ajoute `car_wash=yes`. `addr` : adresse `addr:*` ; `extra` : autres étiquettes (`disused`…).
 */
export type StubWash = {
  name?: string;
  brand?: string;
  lat: number;
  lon: number;
  amenity?: "car_wash" | "fuel";
  carWash?: boolean;
  addr?: { street: string; city: string; postcode: string };
  extra?: Record<string, string>;
};
/** `only` : la station ne déclare qu'un prix (E10 ou GPLc), les autres sont vides. */
export type StubFuel = {
  adresse: string;
  ville: string;
  cp: string;
  lat: number;
  lon: number;
  only?: "e10" | "gplc";
};
export type StubSource = "wash" | "fuel";

export type SourceCall = { source: StubSource; department: string; url: string; body: string };

/** `wash` / `fuel` : département → lieux. `fail` : la source répond 503. `hang` : la source ne répond jamais. */
export function practicalSources(
  data: { wash?: Record<string, StubWash[]>; fuel?: Record<string, StubFuel[]> },
  opts: {
    fail?: StubSource[];
    hang?: StubSource[];
    delayMs?: number;
    /** Réponse d'erreur précise d'une source (par exemple le 502 « at capacity » d'Overpass), à la place du 503 de `fail`. */
    failWith?: Partial<Record<StubSource, { status: number; body: string }>>;
    /** Overpass répond 200 avec ce `remark` (« runtime error… ») et les éléments qu'il a eu le temps de lire. */
    washRemark?: string;
  } = {},
) {
  const calls: SourceCall[] = [];
  // Appels Overpass en cours au même instant (la règle d'Overpass : un à la fois).
  let washInFlight = 0;
  let maxWashInFlight = 0;
  const fn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const body = init?.body ? String(init.body) : "";
    if (url.includes("overpass")) {
      const department = /FR-([0-9A-Z]+)/.exec(decodeURIComponent(body.replace(/\+/g, " ")))?.[1] ?? "";
      calls.push({ source: "wash", department, url, body });
      if (opts.hang?.includes("wash")) return new Promise<Response>(() => undefined);
      const washFailure = opts.failWith?.wash;
      if (washFailure) return new Response(washFailure.body, { status: washFailure.status });
      if (opts.fail?.includes("wash")) return new Response("panne", { status: 503 });
      washInFlight += 1;
      maxWashInFlight = Math.max(maxWashInFlight, washInFlight);
      if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
      washInFlight -= 1;
      return Response.json({
        elements: (data.wash?.[department] ?? []).map((p, i) => ({
          type: "node",
          id: i + 1,
          lat: p.lat,
          lon: p.lon,
          tags: {
            amenity: p.amenity ?? "car_wash",
            ...(p.name ? { name: p.name } : {}),
            ...(p.brand ? { brand: p.brand } : {}),
            ...(p.carWash ? { car_wash: "yes" } : {}),
            ...(p.addr
              ? { "addr:street": p.addr.street, "addr:city": p.addr.city, "addr:postcode": p.addr.postcode }
              : {}),
            ...(p.extra ?? {}),
          },
        })),
        ...(opts.washRemark ? { remark: opts.washRemark } : {}),
      });
    }
    const where = new URL(url).searchParams.get("where") ?? "";
    const department = /"([0-9A-Z]+)"/.exec(where)?.[1] ?? "";
    calls.push({ source: "fuel", department, url, body });
    if (opts.hang?.includes("fuel")) return new Promise<Response>(() => undefined);
    const fuelFailure = opts.failWith?.fuel;
    if (fuelFailure) return new Response(fuelFailure.body, { status: fuelFailure.status });
    if (opts.fail?.includes("fuel")) return new Response("panne", { status: 503 });
    return Response.json({
      results: (data.fuel?.[department] ?? []).map((s) => ({
        adresse: s.adresse,
        ville: s.ville,
        cp: s.cp,
        geom: { lat: s.lat, lon: s.lon },
        ...(s.only === "e10"
          ? { e10_prix: 1.913, e10_maj: "2026-10-16T07:27:43+00:00" }
          : s.only === "gplc"
            ? { gplc_prix: 1.099, gplc_maj: "2026-10-16T07:27:43+00:00" }
            : { gazole_prix: 1.789, sp95_prix: 1.859, gazole_maj: "2026-10-16T07:27:43+00:00" }),
      })),
    });
  });
  resetOverpassQueue();
  setExternalFetch(fn as unknown as typeof fetch);
  return {
    fn,
    calls,
    maxWashInFlight: () => maxWashInFlight,
    count: (source: StubSource, department?: string) =>
      calls.filter((c) => c.source === source && (!department || c.department === department)).length,
  };
}
