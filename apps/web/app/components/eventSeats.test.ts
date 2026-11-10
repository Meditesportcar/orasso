import { describe, expect, it } from "vitest";

import { seatsOf } from "./eventSeats";

describe("décompte des places d'une carte (site)", () => {
  it("non complet : places restantes sur la capacité", () => {
    expect(seatsOf({ capacity: 60, remaining: 58 })).toEqual({ full: false, text: "58 places exposants sur 60" });
    expect(seatsOf({ capacity: 60, remaining: 1 }).text).toBe("1 place exposants sur 60");
  });
  it("complet : « Complet » seul, jamais un effectif inventé", () => {
    expect(seatsOf({ capacity: 60, remaining: 0 })).toEqual({ full: true, text: "Complet" });
    expect(seatsOf({ capacity: 60, remaining: -2 }).full).toBe(true);
  });
  it("journées limitées différemment de la capacité générale : complet sans nombre", () => {
    expect(seatsOf({ capacity: 100, remaining: 0 })).toEqual({ full: true, text: "Complet" });
  });
  it("capacité générale absente : complet quand il ne reste rien, sinon les places restantes", () => {
    expect(seatsOf({ capacity: null, remaining: 0 })).toEqual({ full: true, text: "Complet" });
    expect(seatsOf({ capacity: null, remaining: 3 })).toEqual({ full: false, text: "3 places exposants" });
  });
  it("sans limite", () => {
    expect(seatsOf({ capacity: null, remaining: null })).toEqual({ full: false, text: "Sans limite" });
  });
});
