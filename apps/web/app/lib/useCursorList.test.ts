import { describe, expect, it } from "vitest";

import { type CursorChunk, initialListState, syncListState } from "./useCursorList";

const chunk = (items: string[], next: string | null = null, cursor = ""): CursorChunk<string> => ({
  items,
  next,
  failed: false,
  cursor,
});

describe("syncListState", () => {
  it("même chargement : la liste et les pages ajoutées sont conservées", () => {
    const first = chunk(["a"], "c1");
    const state = { ...initialListState(first), items: ["a", "b"], to: null };
    expect(syncListState(state, first)).toBe(state);
  });

  it("recherche identique relancée : « aucun résultat » est remplacé par les nouveaux événements", () => {
    const empty = chunk([]);
    const state = initialListState(empty);
    expect(state.items).toEqual([]);
    const fresh = chunk(["nouvel événement"], "c1"); // même recherche, nouveau loader
    const next = syncListState(state, fresh);
    expect(next.items).toEqual(["nouvel événement"]);
    expect(next.to).toBe("c1");
  });

  it("nouveau chargement après des pages accumulées : repart de la première page, curseur compris", () => {
    const first = chunk(["a"], "c1");
    const state = { ...initialListState(first), items: ["a", "b", "c"], to: "c3" };
    const fresh = chunk(["a2"], "d1");
    expect(syncListState(state, fresh)).toMatchObject({ items: ["a2"], to: "d1", failed: false });
  });

  it("première page en échec : « Réessayer » repart de son curseur", () => {
    const failed: CursorChunk<string> = { items: [], next: null, failed: true, cursor: "c9" };
    expect(initialListState(failed)).toMatchObject({ failed: true, to: "c9" });
  });
});
