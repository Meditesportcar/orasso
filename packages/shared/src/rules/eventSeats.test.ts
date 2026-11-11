import { describe, expect, it } from "vitest";

import { seatsOf } from "./eventSeats";

describe("décompte des places d'une carte (appli et site)", () => {
  it("non complet : places restantes sur la capacité, jauge = part prise", () => {
    expect(seatsOf({ capacity: 60, remaining: 58 })).toEqual({
      full: false,
      text: "58 places exposants sur 60",
      taken: 2 / 60,
    });
    expect(seatsOf({ capacity: 60, remaining: 1 }).text).toBe("1 place exposants sur 60");
  });
  it("complet : « Complet » seul, jamais un effectif inventé, jauge pleine", () => {
    expect(seatsOf({ capacity: 60, remaining: 0 })).toEqual({ full: true, text: "Complet", taken: 1 });
    expect(seatsOf({ capacity: 60, remaining: -2 }).full).toBe(true);
  });
  it("journées limitées différemment de la capacité générale : complet sans nombre", () => {
    expect(seatsOf({ capacity: 100, remaining: 0 })).toEqual({ full: true, text: "Complet", taken: 1 });
  });
  it("capacité générale absente : complet quand il ne reste rien, sinon les places restantes sans jauge", () => {
    expect(seatsOf({ capacity: null, remaining: 0 })).toEqual({ full: true, text: "Complet", taken: 1 });
    expect(seatsOf({ capacity: null, remaining: 3 })).toEqual({ full: false, text: "3 places exposants", taken: null });
  });
  it("capacité générale plus petite que les places restantes (journées plus larges) : pas de « sur N » ni de jauge", () => {
    expect(seatsOf({ capacity: 20, remaining: 50 })).toEqual({ full: false, text: "50 places exposants", taken: null });
  });
  it("sans limite : pas de jauge, jamais « Complet »", () => {
    expect(seatsOf({ capacity: null, remaining: null })).toEqual({
      full: false,
      text: "Places exposants sans limite",
      taken: null,
    });
    expect(seatsOf({ capacity: 60, remaining: null }).full).toBe(false);
  });
});
