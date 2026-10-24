import { describe, expect, it } from "vitest";

import {
  activeFilters,
  type EventFilters,
  eventsParams,
  failureMessage,
  firstFailure,
  isMover,
  parseChosenWhere,
  parseEventSort,
  parsePeopleWhere,
  parseProSort,
  preferredFormats,
  prosParams,
  whenRange,
} from "./explorerQuery";

const get = (params: Record<string, string>) => (name: string) => params[name] ?? "";
const noFilters: EventFilters = { format: "", formats: [], when: "all", affinity: false, followed: false };

describe("lieu de l'Explorer (adresse)", () => {
  it("rien de choisi : les réglages habituels", () => {
    expect(parseChosenWhere(get({}))).toBeNull();
    expect(parseChosenWhere(get({ autour: "n'importe quoi" }))).toBeNull();
  });

  it("autour de moi garde la distance sur le curseur", () => {
    expect(parseChosenWhere(get({ autour: "moi", rayon: "100" }))).toEqual({ kind: "me", km: 100 });
    expect(parseChosenWhere(get({ autour: "moi", rayon: "7" }))).toEqual({ kind: "me", km: 10 });
    expect(parseChosenWhere(get({ autour: "moi" }))).toEqual({ kind: "me", km: 100 });
    expect(parseChosenWhere(get({ autour: "moi", rayon: "999" }))).toEqual({ kind: "me", km: 200 });
  });

  it("mon coin, partout, ailleurs (un département valide)", () => {
    expect(parseChosenWhere(get({ autour: "coin" }))).toEqual({ kind: "mine" });
    expect(parseChosenWhere(get({ autour: "partout" }))).toEqual({ kind: "all" });
    expect(parseChosenWhere(get({ autour: "ailleurs", ailleurs: "11" }))).toEqual({ kind: "dept", code: "11" });
    expect(parseChosenWhere(get({ autour: "ailleurs", ailleurs: "xx" }))).toBeNull();
    // Ancienne adresse (lot M4) : le département seul.
    expect(parseChosenWhere(get({ autour: "11" }))).toEqual({ kind: "dept", code: "11" });
  });

  it("personnes et crews : des départements seulement", () => {
    // Rien de choisi : null (suggestions de mon coin, recherche élargie d'elle-même) ; « Mon coin » choisi est explicite.
    expect(parsePeopleWhere("")).toBeNull();
    expect(parsePeopleWhere("coin")).toEqual({ kind: "mine" });
    expect(parsePeopleWhere("partout")).toEqual({ kind: "all" });
    expect(parsePeopleWhere("ailleurs", "66")).toEqual({ kind: "dept", code: "66" });
    expect(parsePeopleWhere("ailleurs", "xx")).toBeNull();
    expect(parsePeopleWhere("moi")).toBeNull();
  });
});

describe("tris", () => {
  it("par date pour les événements, par distance pour les pros, anciens noms compris", () => {
    expect(parseEventSort("")).toBe("date");
    expect(parseEventSort("distance")).toBe("distance");
    expect(parseEventSort("nouveautes")).toBe("recent");
    expect(parseEventSort("places")).toBe("seats");
    expect(parseEventSort("affinites")).toBe("date");
    expect(parseProSort("")).toBe("distance");
    expect(parseProSort("nom")).toBe("name");
  });
});

describe("filtres", () => {
  it("les types des préférences ne filtrent que s'ils sont partiels", () => {
    expect(preferredFormats(undefined)).toEqual([]);
    expect(preferredFormats([])).toEqual([]);
    expect(preferredFormats(["meet"] as never)).toEqual(["meet"]);
  });

  it("compte les filtres actifs", () => {
    expect(activeFilters({ ...noFilters })).toBe(0);
    expect(activeFilters({ ...noFilters, when: "weekend", affinity: true })).toBe(2);
    expect(activeFilters({ ...noFilters, formats: ["meet"] as never })).toBe(1);
  });

  it("ce week-end : du samedi 0 h au dimanche 23 h 59 (Paris)", () => {
    // Mercredi 28 octobre 2026, 12 h à Paris.
    const range = whenRange("weekend", new Date("2026-10-28T11:00:00Z"));
    expect(range.from).toBe("2026-10-30T23:00:00.000Z");
    expect(range.to).toBe("2026-11-01T22:59:00.000Z");
    expect(whenRange("all", new Date())).toEqual({});
  });
});

describe("paramètres de l'API", () => {
  const now = new Date("2026-10-28T11:00:00Z");
  const place = (where: Parameters<typeof eventsParams>[0]["place"]["where"]) => ({ where, coin: ["66", "11"] });

  it("mon coin : les départements entiers, le nombre en tout sur la première page de la liste", () => {
    const p = eventsParams({
      q: "",
      filters: { ...noFilters },
      sort: "date",
      place: place({ kind: "mine" }),
      position: null,
      now,
      mode: "list",
      limit: 24,
    });
    expect(p.get("departments")).toBe("66,11");
    expect(p.get("withTotal")).toBe("1");
    expect(p.get("sort")).toBe("date");
    expect(p.get("everywhere")).toBeNull();
  });

  it("la page suivante et la carte n'ont pas le nombre en tout", () => {
    const base: Omit<Parameters<typeof eventsParams>[0], "mode"> = {
      q: "",
      filters: { ...noFilters },
      sort: "date",
      place: place({ kind: "all" }),
      position: null,
      now,
      limit: 24,
    };
    expect(eventsParams({ ...base, mode: "list", cursor: "abc" }).get("withTotal")).toBeNull();
    expect(eventsParams({ ...base, mode: "map" }).get("withTotal")).toBeNull();
    expect(eventsParams({ ...base, mode: "map" }).get("everywhere")).toBe("1");
  });

  it("autour de moi : la position et le rayon ; mes affinités l'emportent sur le tri", () => {
    const p = eventsParams({
      q: " drift ",
      filters: { ...noFilters, affinity: true, followed: true },
      sort: "distance",
      place: place({ kind: "me", km: 50 }),
      position: { lat: 42.7, lng: 2.9 },
      now,
      mode: "list",
      limit: 24,
    });
    expect(p.get("radiusKm")).toBe("50");
    expect(p.get("lat")).toBe("42.7");
    expect(p.get("sort")).toBe("affinity");
    expect(p.get("followed")).toBe("1");
    expect(p.get("q")).toBe("drift");
  });

  it("ailleurs : le département et le point de départ", () => {
    const p = eventsParams({
      q: "",
      filters: { ...noFilters, formats: ["meet"] as never },
      sort: "date",
      place: place({ kind: "dept", code: "11" }),
      position: null,
      now,
      mode: "list",
      limit: 24,
    });
    expect(p.get("departments")).toBe("11");
    expect(p.get("around")).toBe("11");
    expect(p.get("formats")).toBe("meet");
  });

  it("pros : pas de « partout » ni de point de départ ; le métier ; les comptes sans métier ni page", () => {
    const list = prosParams({
      q: "",
      job: "tyres",
      sort: "distance",
      place: place({ kind: "dept", code: "11" }),
      position: null,
      mode: "list",
      limit: 24,
    });
    expect(list.get("activity")).toBe("tyres");
    expect(list.get("around")).toBeNull();
    expect(list.get("everywhere")).toBeNull();
    expect(list.get("departments")).toBe("11");
    const counts = prosParams({
      q: "",
      job: "tyres",
      sort: "distance",
      place: place({ kind: "all" }),
      position: null,
      mode: "list",
      limit: 1,
      forCounts: true,
    });
    expect(counts.get("activity")).toBeNull();
    expect(counts.get("limit")).toBeNull();
    expect(counts.get("withTotal")).toBeNull();
  });

  it("un pro sans atelier se déplace", () => {
    expect(isMover({ lat: null, city: null, interventionDepartments: ["66"] })).toBe(true);
    expect(isMover({ lat: 42.7, city: "Perpignan", interventionDepartments: ["66"] })).toBe(false);
    expect(isMover({ lat: null, city: null, interventionDepartments: [] })).toBe(false);
  });
});

describe("erreur distincte d'une liste vide", () => {
  const fail = (status: number, message = "x") => ({ ok: false as const, status, error: { message } });
  it("ok ou rien lu : pas d'erreur ; 429 et 503 ont leur texte ; une autre erreur garde le sien", () => {
    expect(failureMessage({ ok: true })).toBeNull();
    expect(failureMessage(null)).toBeNull();
    expect(failureMessage(fail(429))).toContain("Trop de demandes");
    expect(failureMessage(fail(503))).toContain("momentanément indisponible");
    expect(failureMessage(fail(500, "Erreur inattendue."))).toBe("Erreur inattendue.");
    expect(failureMessage(fail(500, ""))).toContain("momentanément indisponible");
  });
  it("la première lecture en échec l'emporte, une liste vide qui a réussi n'est pas une erreur", () => {
    expect(firstFailure({ ok: true }, null, fail(503))).toContain("indisponible");
    expect(firstFailure({ ok: true }, fail(429), fail(503))).toContain("Trop de demandes");
    expect(firstFailure({ ok: true }, null)).toBeNull();
  });
});
