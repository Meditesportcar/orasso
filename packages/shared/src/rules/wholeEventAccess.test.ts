import { describe, expect, it } from "vitest";

import { accessClosesAt, entryHolds, isWholeEventAccess, wholeEventEntryHolds } from "./wholeEventAccess";
import { fromWallTime } from "./time";

const at = (month: number, day: number, hour = 10, minute = 0) =>
  fromWallTime({ year: 2026, month, day, hour, minute });

// Trois jours : du 8 au 10 novembre, 9 h – 23 h.
const event = { startsAt: at(11, 8, 9), endsAt: at(11, 10, 23) };
const oneDay = { startsAt: at(11, 8, 9), endsAt: at(11, 8, 18) };
const night = { startsAt: at(11, 8, 20), endsAt: at(11, 9, 2) };
const day = { id: "d1" };

describe("accès « tout l'événement » : une seule règle pour l'appli et le site", () => {
  it("tout l'événement = pas de jour choisi sur un événement de plusieurs jours calendaires", () => {
    expect(isWholeEventAccess({ day: null }, event)).toBe(true);
    expect(isWholeEventAccess({ day }, event)).toBe(false);
    expect(isWholeEventAccess({ day: null }, oneDay)).toBe(false);
    // Une soirée qui finit à 2 h est un seul jour.
    expect(isWholeEventAccess({ day: null }, night)).toBe(false);
  });

  it("l'accès se ferme à J+1 0 h, heure de Paris", () => {
    expect(accessClosesAt(event)).toEqual(at(11, 11, 0));
  });

  it("entré le premier jour : l'entrée vaut le deuxième, le troisième, jusqu'à la fermeture", () => {
    const whole = { day: null, checkedInAt: at(11, 8, 9, 12).toISOString() };
    expect(entryHolds(whole, event, at(11, 8, 12))).toBe(true);
    expect(entryHolds(whole, event, at(11, 9, 8, 30))).toBe(true);
    expect(entryHolds(whole, event, at(11, 10, 22))).toBe(true);
    expect(wholeEventEntryHolds(whole, event, at(11, 9, 8, 30))).toBe(true);
    expect(entryHolds(whole, event, at(11, 11, 0))).toBe(false);
  });

  it("pas entré : rien ne vaut", () => {
    expect(entryHolds({ day: null, checkedInAt: null }, event, at(11, 9))).toBe(false);
    expect(wholeEventEntryHolds({ day: null }, event, at(11, 9))).toBe(false);
  });

  it("accès par jour ou événement d'un jour : entré, c'est fait (mais ce n'est pas un accès « tout l'événement »)", () => {
    const byDay = { day, checkedInAt: at(11, 8, 9, 12).toISOString() };
    expect(entryHolds(byDay, event, at(11, 8, 12))).toBe(true);
    expect(wholeEventEntryHolds(byDay, event, at(11, 8, 12))).toBe(false);
    const single = { day: null, checkedInAt: at(11, 8, 9, 12).toISOString() };
    expect(entryHolds(single, oneDay, at(11, 8, 12))).toBe(true);
    expect(wholeEventEntryHolds(single, oneDay, at(11, 8, 12))).toBe(false);
  });
});
