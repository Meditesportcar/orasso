import { describe, expect, it } from "vitest";

import { createListGeneration, createSpotGuard } from "./spotGuard";

describe("garde d'une fiche de rendez-vous au spot (tour 4)", () => {
  it("un refus invalide les opérations parties avant lui, même si elles répondent 200 ensuite", () => {
    const guard = createSpotGuard();
    const slowRead = guard.start(); // relecture partie, encore en vol
    const action = guard.start(); // réponse « Je viens » : 404
    guard.refuse(); // refus appris
    expect(guard.valid(slowRead)).toBe(false); // l'ancienne réponse 200 n'appelle plus setMeetup
    expect(guard.valid(action)).toBe(false);
  });

  it("une opération partie après le refus reste valable (le droit peut être rendu)", () => {
    const guard = createSpotGuard();
    const before = guard.start();
    guard.refuse();
    const after = guard.start();
    expect(guard.valid(before)).toBe(false);
    expect(guard.valid(after)).toBe(true);
  });

  it("sans refus, toute opération est valable", () => {
    const guard = createSpotGuard();
    expect(guard.valid(guard.start())).toBe(true);
  });

  it("« Voir plus » retardé pendant un rafraîchissement : sa réponse est jetée, pas de doublon ni de manque", () => {
    const gen = createListGeneration();
    let list: string[] = ["a", "b"]; // première page
    const started = gen.current(); // « Voir plus » part (page suivante : c, d)
    // Le rafraîchissement remplace la première page (Alice est partie, Bob arrive) et repart de zéro.
    gen.bump();
    list = ["b", "c"];
    // L'ancienne réponse arrive : refusée.
    if (gen.accepts(started)) list = [...list, "c", "d"];
    expect(list).toEqual(["b", "c"]);
    // Un « Voir plus » parti après le rafraîchissement est accepté.
    const next = gen.current();
    if (gen.accepts(next)) list = [...list, "d"];
    expect(list).toEqual(["b", "c", "d"]);
  });
});
