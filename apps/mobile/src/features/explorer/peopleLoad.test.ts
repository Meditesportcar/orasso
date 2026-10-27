import type { CrewCard, PeopleSearchPage, PeopleSuggestions } from "@orasso/shared";
import { describe, expect, it, vi } from "vitest";

import { createRequestGate } from "../../lib/requestGate";
import { emptyPeopleFilters } from "./explorerChoice";
import { loadPeople, type PeopleFetchers, peopleQuery, peopleView } from "./peopleLoad";

const page = (pseudos: string[], nextCursor: string | null = null): PeopleSearchPage => ({
  items: pseudos.map((pseudo) => ({
    userId: pseudo,
    pseudo,
    avatarUrl: null,
    grade: "route",
    departments: ["66"],
    vehicles: [],
    follow: { mine: "none", followsMe: false },
  })),
  nextCursor,
});
const crews = (names: string[]) => ({ items: names.map((name) => ({ id: name, name }) as CrewCard), nextCursor: null });
const suggestions: PeopleSuggestions = { sameModel: null };

function fakeApi(): PeopleFetchers & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    searchPeople: vi.fn(async (f) => {
      calls.push(`people:${JSON.stringify(f)}`);
      return page(["Pilote_041"]);
    }),
    searchCrews: vi.fn(async (q, _d, departments) => {
      calls.push(`crews:${q}:${departments ?? ""}`);
      return crews(["Drift 66"]);
    }),
    suggestions: vi.fn(async (departments) => {
      calls.push(`suggest:${departments ?? ""}`);
      return suggestions;
    }),
  };
}

describe("Personnes et crews : plus aucun annuaire (lot R2, tour 2)", () => {
  it("sans texte d'au moins deux caractères : jamais de recherche de personnes, même avec des filtres", async () => {
    expect(peopleView("", emptyPeopleFilters, null)).toEqual({ mode: "suggest", needText: false });
    expect(peopleView("  ", { categoryId: "", grade: "sport" }, null)).toEqual({ mode: "suggest", needText: true });
    expect(peopleView("s", emptyPeopleFilters, null)).toEqual({ mode: "tooShort" });
    expect(peopleView("su", emptyPeopleFilters, null)).toEqual({ mode: "search", broadened: true });
    expect(peopleView("su", emptyPeopleFilters, { kind: "mine" })).toEqual({ mode: "search", broadened: false });
    const api = fakeApi();
    const gate = createRequestGate(() => "A");
    const input = { q: "", where: null, filters: { categoryId: "", grade: "sport" as const }, coin: ["66"] };
    expect(await loadPeople(gate.start(), api, input)).toMatchObject({ kind: "suggest", crewDept: "66" });
    expect(api.calls.some((c) => c.startsWith("people:"))).toBe(false);
    expect(await loadPeople(gate.start(), api, { ...input, q: "p" })).toBeNull();
    expect(api.searchPeople).not.toHaveBeenCalled();
  });

  it("« Mon coin » choisi cherche dans mes départements ; rien de choisi : toute la France", () => {
    const base = { q: " su ", filters: emptyPeopleFilters, coin: ["66", "11"] };
    expect(peopleQuery({ ...base, where: { kind: "mine" } })).toMatchObject({ q: "su", departments: "66,11" });
    expect(peopleQuery({ ...base, where: null }).departments).toBeUndefined();
    expect(peopleQuery({ ...base, where: { kind: "dept", code: "34" } }, "c2")).toMatchObject({
      departments: "34",
      cursor: "c2",
    });
    expect(peopleQuery({ ...base, where: { kind: "all" } }).departments).toBeUndefined();
  });

  it("suggestions : le lieu choisi, sinon mon coin ; partout : aucun département", async () => {
    const api = fakeApi();
    const gate = createRequestGate(() => "A");
    const input = { q: "", filters: emptyPeopleFilters, coin: ["66", "11"] };
    await loadPeople(gate.start(), api, { ...input, where: null });
    await loadPeople(gate.start(), api, { ...input, where: { kind: "dept", code: "34" } });
    await loadPeople(gate.start(), api, { ...input, where: { kind: "all" } });
    expect(api.calls.filter((c) => c.startsWith("suggest:"))).toEqual(["suggest:66,11", "suggest:34", "suggest:"]);
  });

  it("une réponse lue pour le compte A, arrivée après la connexion de B : jetée", async () => {
    let scope = "A";
    const gate = createRequestGate(() => scope);
    let release: (p: PeopleSearchPage) => void = () => undefined;
    const api: PeopleFetchers = {
      searchPeople: () => new Promise((resolve) => (release = resolve)),
      searchCrews: async () => crews([]),
      suggestions: async () => suggestions,
    };
    const pending = loadPeople(gate.start(), api, { q: "su", where: null, filters: emptyPeopleFilters, coin: [] });
    scope = "B";
    release(page(["Prive_de_A"]));
    expect(await pending).toBeNull();
  });
});

describe("Rejoindre un crew : les crews seulement (lot R3b, tour 2)", () => {
  it("aucune lecture de personnes : une panne (503, 429) de leur recherche ne vide pas les crews", async () => {
    const api = fakeApi();
    const down = Object.assign(new Error("Service indisponible"), { status: 503 });
    api.searchPeople = vi.fn(async () => Promise.reject(down));
    api.suggestions = vi.fn(async () => Promise.reject(Object.assign(new Error("Trop de demandes"), { status: 429 })));
    const gate = createRequestGate(() => "compte");
    const input = { where: null, filters: emptyPeopleFilters, coin: ["66"], crewsOnly: true };
    const near = await loadPeople(gate.start(), api, { ...input, q: "" });
    expect(near).toMatchObject({ kind: "suggest", sameModel: null, crews: [{ name: "Drift 66" }] });
    const found = await loadPeople(gate.start(), api, { ...input, q: "drift" });
    expect(found).toMatchObject({ kind: "search", people: [], crews: [{ name: "Drift 66" }] });
    expect(api.searchPeople).not.toHaveBeenCalled();
    expect(api.suggestions).not.toHaveBeenCalled();
  });
});
