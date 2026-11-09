import { describe, expect, it } from "vitest";

import { freshTail, tailFor, tailReducer } from "./tailPages";

describe("pages suivantes d'une liste (lot R7c2, tour 2)", () => {
  const first1 = { id: "page-1" };
  const first2 = { id: "page-2" };

  it("une page suivante s'ajoute à la première, son curseur prend le relais", () => {
    let s = tailReducer(freshTail<string>(first1), { type: "begin", base: first1 });
    expect(s.busy).toBe(true);
    s = tailReducer(s, { type: "done", base: first1, items: ["a", "b"], next: "c2" });
    expect(s).toMatchObject({ items: ["a", "b"], next: "c2", busy: false });
    s = tailReducer(s, { type: "begin", base: first1 });
    s = tailReducer(s, { type: "done", base: first1, items: ["c"], next: null });
    expect(s).toMatchObject({ items: ["a", "b", "c"], next: null });
  });

  it("une première page remplacée vide les pages suivantes et remet le chargement à zéro", () => {
    let s = tailReducer(freshTail<string>(first1), { type: "begin", base: first1 });
    s = tailReducer(s, { type: "done", base: first1, items: ["a"], next: "c2" });
    s = tailReducer(s, { type: "begin", base: first1 });
    expect(tailFor(s, first1).busy).toBe(true);
    const seen = tailFor(s, first2);
    expect(seen).toMatchObject({ items: [], next: undefined, busy: false, error: null });
  });

  it("pagination retardée puis rafraîchissement : la réponse d'avant est rejetée, le bouton n'est pas bloqué", () => {
    // « Voir plus » part pour la première page 1…
    let s = tailReducer(freshTail<string>(first1), { type: "begin", base: first1 });
    // … la première page est relue (page 2) avant la réponse : le bouton est libre.
    expect(tailFor(s, first2).busy).toBe(false);
    // La réponse en retard arrive : ignorée, elle ne s'ajoute pas et ne touche pas l'état de la page 2.
    s = tailReducer(s, { type: "done", base: first1, items: ["vieux"], next: "x" });
    expect(tailFor(s, first2).items).toEqual([]);
    // Un nouveau « Voir plus » sur la page 2 fonctionne, et sa réponse seule compte.
    s = tailReducer(s, { type: "begin", base: first2 });
    s = tailReducer(s, { type: "done", base: first1, items: ["vieux"], next: "x" });
    expect(tailFor(s, first2)).toMatchObject({ items: [], busy: true });
    s = tailReducer(s, { type: "done", base: first2, items: ["neuf"], next: null });
    expect(tailFor(s, first2)).toMatchObject({ items: ["neuf"], busy: false, next: null });
  });

  it("un échec périmé est ignoré ; un échec actuel affiche l'erreur et libère le bouton", () => {
    let s = tailReducer(freshTail<string>(first1), { type: "begin", base: first1 });
    s = tailReducer(s, { type: "begin", base: first2 });
    s = tailReducer(s, { type: "fail", base: first1, message: "ancien" });
    expect(tailFor(s, first2)).toMatchObject({ busy: true, error: null });
    s = tailReducer(s, { type: "fail", base: first2, message: "Pas de connexion" });
    expect(tailFor(s, first2)).toMatchObject({ busy: false, error: "Pas de connexion" });
  });
});
