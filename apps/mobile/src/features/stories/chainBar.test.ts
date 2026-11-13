import { describe, expect, it } from "vitest";
import { barFor, barOfActor, barScope, rememberBar } from "./chainBar";

const bar = { mine: null, authors: [] };

describe("chainBar", () => {
  it("rend la barre affichée du même compte, pas celle d'un autre, pas une périmée", () => {
    rememberBar("a", bar, 1_000);
    expect(barFor("a", 2_000)).toBe(bar);
    expect(barFor("b", 2_000)).toBeNull();
    expect(barFor(null, 2_000)).toBeNull();
    expect(barFor("a", 1_000 + 10 * 60_000)).toBeNull();
  });
  it("oublie à la déconnexion", () => {
    rememberBar("a", bar, 1_000);
    rememberBar(null, null);
    expect(barFor("a", 1_001)).toBeNull();
  });
});

describe("R9n, tour 1 : la barre est rangée par acteur", () => {
  const barA = { mine: null, authors: [{ key: "u:1" }] } as never;
  it("la portée change avec la casquette", () => {
    expect(barScope("u1", "s:a")).not.toBe(barScope("u1", "s:b"));
    expect(barScope("u1", null)).not.toBe(barScope("u1", "s:a"));
    expect(barScope(null, "s:a")).toBeNull();
  });
  it("une barre mémorisée sous A n'est jamais rendue à B", () => {
    rememberBar(barScope("u1", "s:a"), barA, 1_000);
    expect(barFor(barScope("u1", "s:a"), 2_000)).toBe(barA);
    expect(barFor(barScope("u1", "s:b"), 2_000)).toBeNull();
    expect(barFor(barScope("u1", null), 2_000)).toBeNull();
  });
  it("A → B : la lecture d'A reste cachée pour B, même quand celle de B est retardée puis échoue (jamais l'ancienne barre)", () => {
    const readA = { actor: "s:a", bar: barA };
    expect(barOfActor(readA, "s:a")).toBe(barA);
    // B vient d'être choisi : la lecture de B n'est pas arrivée (ou a échoué : pas de donnée) ; on ne montre pas celle d'A.
    expect(barOfActor(readA, "s:b")).toBeNull();
    expect(barOfActor(null, "s:b")).toBeNull();
    // Une lecture d'A qui arrive en retard alors que B est actif est ignorée.
    expect(barOfActor({ actor: "s:a", bar: barA }, "s:b")).toBeNull();
  });
});
