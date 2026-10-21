import { describe, expect, it } from "vitest";

import { appendPage, type CursorChunk, initialListState, syncListState } from "./useCursorList";

type Card = { id: string; kept?: boolean };
const card = (id: string, kept = false): Card => ({ id, kept });
const chunk = (items: Card[], next: string | null = null, cursor = ""): CursorChunk<Card> => ({
  items,
  next,
  failed: false,
  cursor,
});
const ids = (items: Card[]) => items.map((i) => i.id);

describe("syncListState", () => {
  it("même chargement : la liste et les pages ajoutées sont conservées", () => {
    const first = chunk([card("a")], "c1");
    const state = { ...initialListState(first), items: [card("a"), card("b")], to: null };
    expect(syncListState(state, first)).toBe(state);
  });

  it("recherche identique relancée : « aucun résultat » est remplacé par les nouveaux événements", () => {
    const state = initialListState(chunk([]));
    expect(state.items).toEqual([]);
    const next = syncListState(state, chunk([card("nouvel événement")], "c1")); // même recherche, nouveau loader
    expect(ids(next.items)).toEqual(["nouvel événement"]);
    expect(next.to).toBe("c1");
  });

  it("une seule page affichée : la nouvelle première page la remplace, curseur compris", () => {
    const state = initialListState(chunk([card("a"), card("b")], "c1"));
    const next = syncListState(state, chunk([card("b")], "d1"));
    expect(ids(next.items)).toEqual(["b"]);
    expect(next.to).toBe("d1");
  });

  it("« Garder » après deux « Voir la suite » : la carte est mise à jour sur place, les pages suivantes restent", () => {
    const first = chunk([card("a"), card("b")], "c1");
    const state = {
      ...initialListState(first),
      items: [card("a"), card("b"), card("c"), card("d"), card("e"), card("f")],
      to: "c3",
    };
    // Revalidation après l'envoi du formulaire « Garder » sur la carte e : la route relit la première page.
    const next = syncListState(state, chunk([card("a"), card("b", true)], "c1"));
    expect(ids(next.items)).toEqual(["a", "b", "c", "d", "e", "f"]);
    expect(next.items[1]).toEqual(card("b", true));
    expect(next.to).toBe("c3");
    // Le même loader ensuite : rien ne bouge.
    expect(syncListState(next, next.source)).toBe(next);
  });

  it("revalidation avec un nouvel élément en tête : ajouté devant, rien de perdu", () => {
    const first = chunk([card("a"), card("b")], "c1");
    const state = { ...initialListState(first), items: [card("a"), card("b"), card("c")], to: "c2" };
    const next = syncListState(state, chunk([card("z"), card("a")], "c1b"));
    expect(ids(next.items)).toEqual(["z", "a", "b", "c"]);
    expect(next.to).toBe("c2");
  });

  it("autre curseur (lien « Voir la suite » sans script) : repart de zéro", () => {
    const first = chunk([card("a")], "c1");
    const state = { ...initialListState(first), items: [card("a"), card("b")], to: "c2" };
    const next = syncListState(state, chunk([card("x")], "c3", "c2"));
    expect(ids(next.items)).toEqual(["x"]);
    expect(next.to).toBe("c3");
  });

  it("revalidation en panne : la liste affichée est gardée", () => {
    const first = chunk([card("a")], "c1");
    const state = { ...initialListState(first), items: [card("a"), card("b")], to: "c2" };
    const failed: CursorChunk<Card> = { items: [], next: null, failed: true, cursor: "" };
    const next = syncListState(state, failed);
    expect(ids(next.items)).toEqual(["a", "b"]);
    expect(next).toMatchObject({ to: "c2", failed: false });
  });

  it("tour 3 : réponse vide après plusieurs pages, la liste se vide", () => {
    const first = chunk([card("a")], "c1");
    const state = { ...initialListState(first), items: [card("a"), card("b"), card("c")], to: "c3" };
    const next = syncListState(state, chunk([]));
    expect(next.items).toEqual([]);
    expect(next.to).toBeNull();
  });

  it("tour 3 : nouvelles cartes sans raccord avec les anciennes, on repart de la nouvelle page et de son curseur", () => {
    const first = chunk([card("a")], "c1");
    const state = { ...initialListState(first), items: [card("a"), card("b"), card("c")], to: "c3" };
    const next = syncListState(state, chunk([card("n1"), card("n2")], "n2c"));
    expect(ids(next.items)).toEqual(["n1", "n2"]);
    expect(next.to).toBe("n2c");
  });

  it("tour 3 : liste épuisée puis nouvelle suite, « Voir la suite » revient sur le curseur de la nouvelle page", () => {
    const first = chunk([card("a"), card("b")], "c1");
    const state = { ...initialListState(first), items: [card("a"), card("b"), card("c")], to: null };
    const next = syncListState(state, chunk([card("z"), card("a")], "z2"));
    expect(ids(next.items)).toEqual(["z", "a", "b", "c"]);
    expect(next.to).toBe("z2");
    // La page suivante rend des cartes déjà affichées : pas de doublon.
    expect(ids(appendPage(next.items, [card("b"), card("c"), card("d")]))).toEqual(["z", "a", "b", "c", "d"]);
  });

  it("première page en échec : « Réessayer » repart de son curseur", () => {
    const failed: CursorChunk<Card> = { items: [], next: null, failed: true, cursor: "c9" };
    expect(initialListState(failed)).toMatchObject({ failed: true, to: "c9" });
  });
});

describe("appendPage", () => {
  it("un élément repoussé à la page suivante par une revalidation n'apparaît pas deux fois", () => {
    expect(ids(appendPage([card("z"), card("a"), card("b")], [card("b"), card("c")]))).toEqual(["z", "a", "b", "c"]);
  });
});
